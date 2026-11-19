import { NextRequest, NextResponse } from "next/server";
import { fail, isValidDay, requireAttendanceAdmin } from "@/lib/asistencia";
import { buildReport, reportContext } from "@/lib/payroll";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Resumen de horas por empleado y tipo de recargo en un rango de fechas.
export async function GET(req: NextRequest) {
  try {
    const auth = await requireAttendanceAdmin(req);
    if (auth.error) return auth.error;

    const sp = req.nextUrl.searchParams;
    const from = sp.get("from");
    const to = sp.get("to");
    if (!isValidDay(from) || !isValidDay(to)) return fail("Elige las fechas desde y hasta.", 400);
    if (from > to) return fail("La fecha inicial no puede ser posterior a la final.", 400);

    const ctx = await reportContext(from, to);
    const report = await buildReport({
      from,
      to,
      employeeId: sp.get("employeeId"),
      siteId: sp.get("siteId"),
      rules: ctx.rules,
      holidays: ctx.holidays,
    });
    // El detalle de turnos solo se usa en el Excel; el resumen va liviano.
    return NextResponse.json({
      from: report.from,
      to: report.to,
      rules: report.rules,
      closed: ctx.closed,
      partial: ctx.partial,
      employees: report.employees.map(({ shifts, ...e }) => ({ ...e, shiftCount: shifts.length })),
    });
  } catch (err: any) {
    return fail(err.message || "Error inesperado.", 500);
  }
}
