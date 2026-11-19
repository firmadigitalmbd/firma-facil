import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { colombianHolidays } from "@/lib/holidays";
import {
  CONCEPTS,
  classifyShifts,
  emptyMinutes,
  localDate,
  mondayOf,
  payFor,
  rowToRules,
  type ConceptKey,
  type Rules,
  type Shift,
  type ShiftResult,
} from "@/lib/payrollCore";

export * from "@/lib/payrollCore";

export async function loadRules(): Promise<Rules> {
  const { data } = await getSupabaseAdmin()
    .from("att_settings")
    .select(
      "night_start, night_end, daily_limit_hours, weekly_limit_hours, monthly_hours, rates, verify_enabled, verify_after_hours, verify_enabled_since, geofence_block"
    )
    .eq("id", 1)
    .maybeSingle();
  return rowToRules(data);
}

// Si un año no tiene ningún festivo cargado, se generan los de Colombia:
// así un reporte nunca paga como ordinario un día festivo por olvido.
export async function ensureHolidayYears(years: number[]) {
  const supabase = getSupabaseAdmin();
  for (const year of Array.from(new Set(years))) {
    const { count } = await supabase
      .from("att_holidays")
      .select("day", { count: "exact", head: true })
      .gte("day", `${year}-01-01`)
      .lte("day", `${year}-12-31`);
    if (!count) {
      await supabase.from("att_holidays").upsert(colombianHolidays(year), { onConflict: "day" });
    }
  }
}

// ---------------------------------------------------------------------
// Periodos cerrados
// ---------------------------------------------------------------------
export type ClosedPeriod = { id: string; from: string; to: string; rules: Rules | null; holidays: string[] | null };

// Periodos cerrados que se cruzan con el rango [from, to].
export async function closedPeriodsOverlapping(from: string, to: string): Promise<ClosedPeriod[]> {
  const { data } = await getSupabaseAdmin()
    .from("att_periods")
    .select("id, from_day, to_day, summary")
    .lte("from_day", to)
    .gte("to_day", from)
    .order("from_day", { ascending: true });
  return (data || []).map((p: any) => ({
    id: p.id,
    from: p.from_day,
    to: p.to_day,
    rules: p.summary?.rules ? { ...rowToRules(null), ...p.summary.rules } : null,
    holidays: Array.isArray(p.summary?.holidays) ? p.summary.holidays : null,
  }));
}

// Si el día (hora de Colombia) cae en un periodo cerrado, devuelve ese periodo.
export async function closedPeriodForDay(day: string): Promise<ClosedPeriod | null> {
  const list = await closedPeriodsOverlapping(day, day);
  return list[0] ?? null;
}

// Un reporte con las fechas exactas de un periodo cerrado se calcula con
// las reglas y festivos que había al cerrarlo, aunque después cambien.
// Si el rango solo toca parte de un periodo cerrado se usan las reglas
// actuales y se avisa.
export async function reportContext(from: string, to: string) {
  const periods = await closedPeriodsOverlapping(from, to);
  const exact = periods.find((p) => p.from === from && p.to === to) ?? null;
  return {
    closed: exact ? { id: exact.id, from: exact.from, to: exact.to, savedRules: !!exact.rules } : null,
    rules: exact?.rules ?? undefined,
    holidays: exact?.holidays ?? undefined,
    partial: exact ? [] : periods.map((p) => ({ from: p.from, to: p.to })),
  };
}

// ---------------------------------------------------------------------
// Reporte
// ---------------------------------------------------------------------
export type ReportEmployee = {
  id: string;
  name: string;
  cedula: string;
  monthlySalary: number | null;
  minutes: Record<ConceptKey, number>;
  totalMinutes: number;
  pay: ReturnType<typeof payFor>;
  shifts: (ShiftResult & { startIso: string; endIso: string })[];
  incomplete: { at: string; siteName: string; kind: "in" | "out" }[];
  // Turnos en que se exigía verificación y no se hizo.
  missingVerify: number;
  // Turnos con una marcación agregada o corregida a mano.
  manualShifts: number;
  // Turnos con una marcación hecha lejos de la sede.
  outOfRangeShifts: number;
};

export type Report = {
  from: string;
  to: string;
  rules: Rules;
  employees: ReportEmployee[];
};

export async function buildReport(opts: {
  from: string;
  to: string;
  employeeId?: string | null;
  siteId?: string | null;
  // Reglas y festivos guardados al cerrar un periodo (si no, los actuales).
  rules?: Rules;
  holidays?: string[];
}): Promise<Report> {
  const supabase = getSupabaseAdmin();
  const rules = opts.rules ?? (await loadRules());

  // Se leen los registros desde el lunes de la semana de "from" para que el
  // límite semanal cuente las horas anteriores, y hasta un día después de
  // "to" para alcanzar la salida de un turno nocturno.
  const fetchFrom = `${mondayOf(opts.from)}T00:00:00-05:00`;
  const fetchTo = new Date(new Date(`${opts.to}T00:00:00-05:00`).getTime() + 2 * 86_400_000).toISOString();

  await ensureHolidayYears([
    Number(mondayOf(opts.from).slice(0, 4)),
    Number(opts.from.slice(0, 4)),
    Number(opts.to.slice(0, 4)),
  ]);

  const [{ data: holidayRows }, { data: employees }] = await Promise.all([
    supabase.from("att_holidays").select("day"),
    (() => {
      let q = supabase.from("att_employees").select("id, full_name, cedula, monthly_salary");
      if (opts.employeeId) q = q.eq("id", opts.employeeId);
      return q.order("full_name", { ascending: true });
    })(),
  ]);
  const holidays = new Set(opts.holidays ?? (holidayRows || []).map((h: any) => h.day as string));

  const records: any[] = [];
  const PAGE = 1000;
  for (let offset = 0; ; offset += PAGE) {
    let q = supabase
      .from("att_records")
      .select("employee_id, site_id, kind, recorded_at, manual, edited_at, out_of_range, att_sites(name)")
      .is("voided_at", null)
      .gte("recorded_at", fetchFrom)
      .lt("recorded_at", fetchTo)
      .order("recorded_at", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (opts.employeeId) q = q.eq("employee_id", opts.employeeId);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    records.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }

  const byEmployee = new Map<string, any[]>();
  for (const r of records) {
    if (!byEmployee.has(r.employee_id)) byEmployee.set(r.employee_id, []);
    byEmployee.get(r.employee_id)!.push(r);
  }

  const inRange = (iso: string) => {
    const d = localDate(iso);
    return d >= opts.from && d <= opts.to;
  };

  const out: ReportEmployee[] = [];
  for (const emp of employees || []) {
    const recs = byEmployee.get(emp.id) || [];
    const shifts: Shift[] = [];
    const incomplete: ReportEmployee["incomplete"] = [];

    // Empareja cada entrada con la salida que le sigue.
    let open: any = null;
    let verifies = 0;
    for (const r of recs) {
      if (r.kind === "verify") {
        if (open) verifies += 1;
        continue;
      }
      if (r.kind === "in") {
        if (open && inRange(open.recorded_at)) {
          incomplete.push({ at: open.recorded_at, siteName: open.att_sites?.name ?? "", kind: "in" });
        }
        open = r;
        verifies = 0;
      } else if (open) {
        const startMs = new Date(open.recorded_at).getTime();
        const endMs = new Date(r.recorded_at).getTime();
        shifts.push({
          startMs,
          endMs,
          siteId: open.site_id,
          siteName: open.att_sites?.name ?? "",
          verifies,
          needsVerify:
            rules.verifyEnabled &&
            !!rules.verifyEnabledSince &&
            startMs >= new Date(rules.verifyEnabledSince).getTime() &&
            endMs - startMs > rules.verifyAfterHours * 3_600_000,
          manual: !!(open.manual || open.edited_at || r.manual || r.edited_at),
          outOfRange: !!(open.out_of_range || r.out_of_range),
        });
        open = null;
      } else if (inRange(r.recorded_at)) {
        incomplete.push({ at: r.recorded_at, siteName: r.att_sites?.name ?? "", kind: "out" });
      }
    }
    if (open && inRange(open.recorded_at)) {
      incomplete.push({ at: open.recorded_at, siteName: open.att_sites?.name ?? "", kind: "in" });
    }

    const classified = classifyShifts(shifts, rules, holidays)
      .filter((s) => inRange(new Date(s.startMs).toISOString()))
      .filter((s) => !opts.siteId || s.siteId === opts.siteId)
      .map((s) => ({
        ...s,
        startIso: new Date(s.startMs).toISOString(),
        endIso: new Date(s.endMs).toISOString(),
      }));

    if (classified.length === 0 && incomplete.length === 0) continue;

    const minutes = emptyMinutes();
    let totalMinutes = 0;
    for (const s of classified) {
      for (const c of CONCEPTS) minutes[c.key] += s.minutes[c.key];
      totalMinutes += s.totalMinutes;
    }
    const salary = emp.monthly_salary == null ? null : Number(emp.monthly_salary);

    out.push({
      id: emp.id,
      name: emp.full_name,
      cedula: emp.cedula,
      monthlySalary: salary,
      minutes,
      totalMinutes,
      pay: payFor(minutes, salary, rules),
      shifts: classified,
      incomplete,
      missingVerify: classified.filter((s) => s.needsVerify && !s.verifies).length,
      manualShifts: classified.filter((s) => s.manual).length,
      outOfRangeShifts: classified.filter((s) => s.outOfRange).length,
    });
  }

  return { from: opts.from, to: opts.to, rules, employees: out };
}
