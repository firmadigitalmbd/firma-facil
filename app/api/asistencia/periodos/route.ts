import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import {
  ATTENDANCE_BUCKET,
  bogotaDayEnd,
  bogotaDayStart,
  fail,
  isValidDay,
  requireAttendanceAdmin,
} from "@/lib/asistencia";
import { buildReport, mondayOf } from "@/lib/payroll";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function bogotaToday() {
  return new Date(Date.now() - 5 * 3_600_000).toISOString().slice(0, 10);
}

// Periodos ya cerrados (con el total guardado de cada uno).
export async function GET(req: NextRequest) {
  try {
    const auth = await requireAttendanceAdmin(req);
    if (auth.error) return auth.error;

    const { data, error } = await getSupabaseAdmin()
      .from("att_periods")
      .select("id, from_day, to_day, created_at, closed_by, photos_deleted, summary")
      .order("from_day", { ascending: false })
      .limit(60);
    if (error) return fail(error.message, 500);

    return NextResponse.json({
      periods: (data || []).map((p: any) => ({
        id: p.id,
        from: p.from_day,
        to: p.to_day,
        closedAt: p.created_at,
        closedBy: p.closed_by,
        photosDeleted: p.photos_deleted,
        employees: p.summary?.employees?.length ?? 0,
        totalPay: (p.summary?.employees || []).reduce((sum: number, e: any) => sum + (e.pay?.total || 0), 0),
      })),
    });
  } catch (err: any) {
    return fail(err.message || "Error inesperado.", 500);
  }
}

// Cierra un periodo: guarda una copia del resumen (con las reglas usadas) y
// BORRA las fotos de ese rango. Los registros (hora, sede, ubicación) se
// conservan. Repetir el cierre del mismo rango solo reintenta el borrado de
// las fotos que hubieran quedado pendientes.
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAttendanceAdmin(req);
    if (auth.error) return auth.error;

    const body = await req.json().catch(() => ({}));
    const from = String(body?.from || "");
    const to = String(body?.to || "");
    if (!isValidDay(from) || !isValidDay(to)) return fail("Elige las fechas desde y hasta.", 400);
    if (from > to) return fail("La fecha inicial no puede ser posterior a la final.", 400);
    if (to >= bogotaToday()) {
      return fail("Solo se pueden cerrar periodos que ya terminaron (hasta ayer como máximo).", 400);
    }
    if (body?.confirm !== "CERRAR") return fail('Escribe "CERRAR" para confirmar.', 400);

    const supabase = getSupabaseAdmin();

    const { data: overlapping } = await supabase
      .from("att_periods")
      .select("id, from_day, to_day")
      .lte("from_day", to)
      .gte("to_day", from);
    const same = (overlapping || []).find((p: any) => p.from_day === from && p.to_day === to);
    const conflict = (overlapping || []).find((p: any) => !(p.from_day === from && p.to_day === to));
    if (conflict) {
      return fail(`Ese rango se cruza con el periodo ya cerrado del ${conflict.from_day} al ${conflict.to_day}.`, 409);
    }

    // 1. Resumen guardado (solo la primera vez).
    let periodId: string | null = same?.id ?? null;
    let alreadyDeleted = 0;
    if (!same) {
      const report = await buildReport({ from, to });
      // Festivos que usó el cálculo (desde el lunes de la primera semana
      // hasta unos días después del final, por los turnos nocturnos).
      const holidayTo = new Date(new Date(`${to}T00:00:00Z`).getTime() + 7 * 86_400_000).toISOString().slice(0, 10);
      const { data: holidayRows } = await supabase
        .from("att_holidays")
        .select("day")
        .gte("day", mondayOf(from))
        .lte("day", holidayTo);
      const summary = {
        rules: report.rules,
        holidays: (holidayRows || []).map((h: any) => h.day as string),
        employees: report.employees.map((e) => ({
          name: e.name,
          cedula: e.cedula,
          monthlySalary: e.monthlySalary,
          minutes: e.minutes,
          totalMinutes: e.totalMinutes,
          pay: e.pay,
          shifts: e.shifts.length,
          incomplete: e.incomplete.length,
        })),
      };
      const { data: created, error } = await supabase
        .from("att_periods")
        .insert({ from_day: from, to_day: to, closed_by: auth.user!.username, summary })
        .select("id")
        .single();
      if (error || !created) return fail(error?.message || "No se pudo guardar el cierre.", 500);
      periodId = created.id;
    } else {
      const { data: prev } = await supabase.from("att_periods").select("photos_deleted").eq("id", same.id).single();
      alreadyDeleted = prev?.photos_deleted ?? 0;
    }

    // 2. Borrado de las fotos del rango.
    const records: { id: string; photo_path: string }[] = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await supabase
        .from("att_records")
        .select("id, photo_path")
        .not("photo_path", "is", null)
        .gte("recorded_at", bogotaDayStart(from))
        .lte("recorded_at", bogotaDayEnd(to))
        .order("recorded_at", { ascending: true })
        .range(offset, offset + 999);
      if (error) return fail(error.message, 500);
      records.push(...(data || []));
      if (!data || data.length < 1000) break;
    }

    let deleted = 0;
    let failed = 0;
    for (let i = 0; i < records.length; i += 100) {
      const batch = records.slice(i, i + 100);
      const { error: removeError } = await supabase.storage
        .from(ATTENDANCE_BUCKET)
        .remove(batch.map((r) => r.photo_path));
      if (removeError) {
        failed += batch.length;
        continue;
      }
      const { error: updateError } = await supabase
        .from("att_records")
        .update({ photo_path: null, photo_deleted_at: new Date().toISOString() })
        .in("id", batch.map((r) => r.id));
      if (updateError) failed += batch.length;
      else deleted += batch.length;
    }

    await supabase
      .from("att_periods")
      .update({ photos_deleted: alreadyDeleted + deleted })
      .eq("id", periodId!);

    return NextResponse.json({ ok: true, deleted, failed, repeated: !!same });
  } catch (err: any) {
    return fail(err.message || "Error inesperado.", 500);
  }
}
