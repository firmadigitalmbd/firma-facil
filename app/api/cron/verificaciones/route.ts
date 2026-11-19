import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { MAX_SHIFT_HOURS, fail } from "@/lib/asistencia";
import { loadRules, localTime } from "@/lib/payroll";
import { pushReady, sendToEmployee } from "@/lib/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// La llama un programador cada 5 minutos (Supabase pg_cron o Vercel Cron)
// con "Authorization: Bearer CRON_SECRET". Avisa en el celular a cada
// empleado con un turno abierto al que ya le toca la verificación. Cada
// entrada se avisa una sola vez.
export async function GET(req: NextRequest) {
  try {
    const secret = process.env.CRON_SECRET;
    if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
      return fail("No autorizado.", 401);
    }

    const rules = await loadRules();
    if (!rules.verifyEnabled || !rules.verifyEnabledSince) {
      return NextResponse.json({ ok: true, skipped: "verificación desactivada" });
    }
    if (!pushReady()) return NextResponse.json({ ok: true, skipped: "avisos sin configurar" });

    const supabase = getSupabaseAdmin();
    const now = Date.now();
    const dueBefore = new Date(now - rules.verifyAfterHours * 3_600_000).toISOString();
    const oldest = new Date(
      Math.max(now - MAX_SHIFT_HOURS * 3_600_000, new Date(rules.verifyEnabledSince).getTime())
    ).toISOString();

    const { data: entries, error } = await supabase
      .from("att_records")
      .select("id, employee_id, recorded_at")
      .eq("kind", "in")
      .is("voided_at", null)
      .is("verify_notified_at", null)
      .gte("recorded_at", oldest)
      .lte("recorded_at", dueBefore)
      .order("recorded_at", { ascending: true })
      .limit(500);
    if (error) return fail(error.message, 500);
    if (!entries || entries.length === 0) return NextResponse.json({ ok: true, notified: 0 });

    // Registros posteriores de esos empleados: si hay uno después de la
    // entrada (salida, verificación u otra entrada), ya no hay que avisar.
    const employeeIds = Array.from(new Set(entries.map((e) => e.employee_id)));
    const { data: later } = await supabase
      .from("att_records")
      .select("employee_id, recorded_at")
      .in("employee_id", employeeIds)
      .is("voided_at", null)
      .gt("recorded_at", entries[0].recorded_at);
    const lastByEmployee = new Map<string, number>();
    for (const r of later || []) {
      const t = new Date(r.recorded_at).getTime();
      if (t > (lastByEmployee.get(r.employee_id) ?? 0)) lastByEmployee.set(r.employee_id, t);
    }

    let notified = 0;
    const processed: string[] = [];
    for (const e of entries) {
      processed.push(e.id);
      const inAt = new Date(e.recorded_at).getTime();
      if ((lastByEmployee.get(e.employee_id) ?? 0) > inAt) continue;
      const sent = await sendToEmployee(e.employee_id, {
        title: "Registra tu verificación",
        body: `Entraste a las ${localTime(e.recorded_at)}. Ya puedes registrar la verificación con foto.`,
        url: "/marcar",
      });
      if (sent > 0) notified += 1;
    }

    await supabase
      .from("att_records")
      .update({ verify_notified_at: new Date().toISOString() })
      .in("id", processed);

    return NextResponse.json({ ok: true, checked: entries.length, notified });
  } catch (err: any) {
    return fail(err.message || "Error inesperado.", 500);
  }
}
