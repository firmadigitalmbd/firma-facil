import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { fail, requireAttendanceAdmin } from "@/lib/asistencia";
import { CONCEPTS, loadRules, parseHHMM, type Rates } from "@/lib/payroll";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAttendanceAdmin(req);
    if (auth.error) return auth.error;
    return NextResponse.json({ rules: await loadRules() });
  } catch (err: any) {
    return fail(err.message || "Error inesperado.", 500);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const auth = await requireAttendanceAdmin(req);
    if (auth.error) return auth.error;

    const body = await req.json().catch(() => ({}));
    const nightStart = String(body?.nightStart || "").trim();
    const nightEnd = String(body?.nightEnd || "").trim();
    if (parseHHMM(nightStart) === null || parseHHMM(nightEnd) === null) {
      return fail("Las horas de la jornada nocturna deben tener el formato HH:MM (por ejemplo 19:00).", 400);
    }

    const num = (v: unknown, min: number, max: number) => {
      if (v === "" || v === null || v === undefined) return null;
      const n = Number(v);
      return Number.isFinite(n) && n >= min && n <= max ? n : null;
    };
    const dailyLimit = num(body?.dailyLimitHours, 1, 24);
    const weeklyLimit = num(body?.weeklyLimitHours, 0, 168);
    const monthlyHours = num(body?.monthlyHours, 1, 400);
    if (dailyLimit === null) return fail("La jornada máxima diaria debe estar entre 1 y 24 horas.", 400);
    if (weeklyLimit === null) {
      return fail("La jornada máxima semanal debe estar entre 0 y 168 horas (0 = sin límite).", 400);
    }
    if (monthlyHours === null) return fail("Las horas del mes para el valor de la hora no son válidas.", 400);

    const verifyEnabled = body?.verifyEnabled === true;
    const verifyAfter = num(body?.verifyAfterHours, 0.5, 16);
    if (verifyAfter === null) return fail("Las horas para la verificación deben estar entre 0.5 y 16.", 400);

    const supabase = getSupabaseAdmin();
    const { data: previous } = await supabase
      .from("att_settings")
      .select("verify_enabled, verify_enabled_since")
      .eq("id", 1)
      .maybeSingle();

    const rates = {} as Rates;
    for (const c of CONCEPTS) {
      const pct = num(body?.rates?.[c.key], 0, 500);
      if (pct === null) return fail(`El porcentaje de "${c.label}" debe estar entre 0 y 500.`, 400);
      rates[c.key] = pct;
    }

    // Se anota desde cuándo está activa para no marcar turnos anteriores.
    const since = verifyEnabled
      ? previous?.verify_enabled && previous?.verify_enabled_since
        ? previous.verify_enabled_since
        : new Date().toISOString()
      : previous?.verify_enabled_since ?? null;

    const { error } = await supabase
      .from("att_settings")
      .update({
        geofence_block: body?.geofenceBlock === true,
        verify_enabled: verifyEnabled,
        verify_after_hours: verifyAfter,
        verify_enabled_since: since,
        night_start: nightStart,
        night_end: nightEnd,
        daily_limit_hours: dailyLimit,
        weekly_limit_hours: weeklyLimit,
        monthly_hours: monthlyHours,
        rates,
        updated_at: new Date().toISOString(),
      })
      .eq("id", 1);
    if (error) return fail(error.message, 500);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return fail(err.message || "Error inesperado.", 500);
  }
}
