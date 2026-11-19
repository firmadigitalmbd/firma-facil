import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import {
  ATTENDANCE_BUCKET,
  bogotaDateTime,
  bogotaDayEnd,
  bogotaDayStart,
  fail,
  isValidDay,
  requireAttendanceAdmin,
  validateNote,
  RECORD_COLUMNS,
  shapeRecord,
} from "@/lib/asistencia";
import { closedPeriodForDay, localDate } from "@/lib/payroll";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;
const KINDS = ["in", "out", "verify"] as const;

// Lista de marcaciones con filtros (empleado, sede, rango de fechas en hora
// de Colombia) y enlaces temporales a las fotos.
export async function GET(req: NextRequest) {
  try {
    const auth = await requireAttendanceAdmin(req);
    if (auth.error) return auth.error;

    const sp = req.nextUrl.searchParams;
    const employeeId = sp.get("employeeId");
    const siteId = sp.get("siteId");
    const from = sp.get("from");
    const to = sp.get("to");
    const only = sp.get("only"); // "manual" | "far"
    const offset = Math.max(0, parseInt(sp.get("offset") || "0", 10) || 0);

    const supabase = getSupabaseAdmin();
    let query = supabase
      .from("att_records")
      .select(RECORD_COLUMNS, { count: "exact" })
      .order("recorded_at", { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);

    if (employeeId) query = query.eq("employee_id", employeeId);
    if (siteId) query = query.eq("site_id", siteId);
    if (isValidDay(from)) query = query.gte("recorded_at", bogotaDayStart(from));
    if (isValidDay(to)) query = query.lte("recorded_at", bogotaDayEnd(to));
    if (only === "manual") query = query.or("manual.eq.true,edited_at.not.is.null,voided_at.not.is.null");
    if (only === "far") query = query.eq("out_of_range", true);

    const { data, error, count } = await query;
    if (error) return fail(error.message, 500);

    const rows = data || [];
    const paths = rows.map((r: any) => r.photo_path).filter(Boolean) as string[];
    const urlByPath = new Map<string, string>();
    if (paths.length > 0) {
      const { data: signed } = await supabase.storage
        .from(ATTENDANCE_BUCKET)
        .createSignedUrls(paths, 60 * 60);
      for (const s of signed || []) if (s.path && s.signedUrl) urlByPath.set(s.path, s.signedUrl);
    }

    return NextResponse.json({
      total: count ?? rows.length,
      pageSize: PAGE_SIZE,
      records: rows.map((r: any) => shapeRecord(r, r.photo_path ? urlByPath.get(r.photo_path) ?? null : null)),
    });
  } catch (err: any) {
    return fail(err.message || "Error inesperado.", 500);
  }
}

// Registro agregado a mano por la administradora (por ejemplo, una salida
// que el empleado olvidó marcar). Queda marcado como "manual", con el motivo.
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAttendanceAdmin(req);
    if (auth.error) return auth.error;

    const body = await req.json().catch(() => ({}));
    const employeeId = String(body?.employeeId || "");
    const siteId = String(body?.siteId || "");
    const kind = String(body?.kind || "");
    if (!employeeId) return fail("Elige el empleado.", 400);
    if (!siteId) return fail("Elige la sede.", 400);
    if (!(KINDS as readonly string[]).includes(kind)) return fail("Elige si es entrada, salida o verificación.", 400);

    const at = bogotaDateTime(body?.day, body?.time);
    if (!at) return fail("Escribe la fecha y la hora.", 400);
    if (new Date(at).getTime() > Date.now()) return fail("La hora no puede ser en el futuro.", 400);
    const noteError = validateNote(body?.note);
    if (noteError) return fail(noteError, 400);

    const closed = await closedPeriodForDay(localDate(at));
    if (closed) {
      return fail(`Esa fecha está en el periodo cerrado del ${closed.from} al ${closed.to}; ya no se puede modificar.`, 409);
    }

    const supabase = getSupabaseAdmin();
    const [{ data: emp }, { data: site }] = await Promise.all([
      supabase.from("att_employees").select("id").eq("id", employeeId).maybeSingle(),
      supabase.from("att_sites").select("id").eq("id", siteId).maybeSingle(),
    ]);
    if (!emp) return fail("Empleado no encontrado.", 404);
    if (!site) return fail("Sede no encontrada.", 404);

    const { data, error } = await supabase
      .from("att_records")
      .insert({
        employee_id: employeeId,
        site_id: siteId,
        kind,
        recorded_at: at,
        manual: true,
        edited_at: new Date().toISOString(),
        edited_by: auth.user!.username,
        edit_note: String(body.note).trim(),
      })
      .select(RECORD_COLUMNS)
      .single();
    if (error || !data) return fail(error?.message || "No se pudo guardar.", 500);

    return NextResponse.json({ record: shapeRecord(data, null) });
  } catch (err: any) {
    return fail(err.message || "Error inesperado.", 500);
  }
}
