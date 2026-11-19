// =====================================================================
// Cálculo de horas y recargos (Colombia). Todo en hora de Colombia
// (UTC-5 fijo, sin horario de verano).
// =====================================================================

export const BOGOTA_OFFSET_MS = 5 * 3_600_000;

export type ConceptKey =
  | "ordinary_day"
  | "ordinary_night"
  | "ordinary_holiday_day"
  | "ordinary_holiday_night"
  | "extra_day"
  | "extra_night"
  | "extra_holiday_day"
  | "extra_holiday_night";

export const CONCEPTS: { key: ConceptKey; label: string; extra: boolean }[] = [
  { key: "ordinary_day", label: "Ordinaria diurna", extra: false },
  { key: "ordinary_night", label: "Recargo nocturno", extra: false },
  { key: "ordinary_holiday_day", label: "Dominical/festivo diurno", extra: false },
  { key: "ordinary_holiday_night", label: "Dominical/festivo nocturno", extra: false },
  { key: "extra_day", label: "Extra diurna", extra: true },
  { key: "extra_night", label: "Extra nocturna", extra: true },
  { key: "extra_holiday_day", label: "Extra dominical/festiva diurna", extra: true },
  { key: "extra_holiday_night", label: "Extra dominical/festiva nocturna", extra: true },
];

export type Rates = Record<ConceptKey, number>;

export type Rules = {
  nightStart: string; // "HH:MM"
  nightEnd: string;
  dailyLimitHours: number;
  weeklyLimitHours: number; // 0 = sin límite semanal
  monthlyHours: number; // divisor para el valor de la hora
  rates: Rates;
  // Verificación opcional a mitad del turno.
  verifyEnabled: boolean;
  verifyAfterHours: number;
  verifyEnabledSince: string | null;
  // Bloquear las marcaciones hechas lejos de la sede (si no, solo se marcan).
  geofenceBlock: boolean;
};

export const DEFAULT_RULES: Rules = {
  nightStart: "19:00",
  nightEnd: "06:00",
  dailyLimitHours: 8,
  weeklyLimitHours: 42,
  monthlyHours: 210,
  rates: {
    ordinary_day: 0,
    ordinary_night: 35,
    ordinary_holiday_day: 90,
    ordinary_holiday_night: 125,
    extra_day: 25,
    extra_night: 75,
    extra_holiday_day: 115,
    extra_holiday_night: 165,
  },
  verifyEnabled: false,
  verifyAfterHours: 4,
  verifyEnabledSince: null,
  geofenceBlock: false,
};

export function parseHHMM(value: string): number | null {
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

export function rowToRules(row: any): Rules {
  if (!row) return DEFAULT_RULES;
  return {
    nightStart: row.night_start ?? DEFAULT_RULES.nightStart,
    nightEnd: row.night_end ?? DEFAULT_RULES.nightEnd,
    dailyLimitHours: Number(row.daily_limit_hours ?? DEFAULT_RULES.dailyLimitHours),
    weeklyLimitHours: Number(row.weekly_limit_hours ?? DEFAULT_RULES.weeklyLimitHours),
    monthlyHours: Number(row.monthly_hours ?? DEFAULT_RULES.monthlyHours),
    rates: { ...DEFAULT_RULES.rates, ...(row.rates || {}) },
    verifyEnabled: !!row.verify_enabled,
    verifyAfterHours: Number(row.verify_after_hours ?? DEFAULT_RULES.verifyAfterHours),
    verifyEnabledSince: row.verify_enabled_since ?? null,
    geofenceBlock: !!row.geofence_block,
  };
}

// ---------------------------------------------------------------------
// Fechas en hora de Colombia
// ---------------------------------------------------------------------
function localParts(ms: number) {
  const d = new Date(ms - BOGOTA_OFFSET_MS);
  return {
    day: d.toISOString().slice(0, 10), // YYYY-MM-DD local
    dow: d.getUTCDay(), // 0 = domingo
    minuteOfDay: d.getUTCHours() * 60 + d.getUTCMinutes(),
  };
}

export function mondayOf(day: string) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

export function localDate(iso: string) {
  return localParts(new Date(iso).getTime()).day;
}
export function localTime(iso: string) {
  const p = localParts(new Date(iso).getTime());
  return `${String(Math.floor(p.minuteOfDay / 60)).padStart(2, "0")}:${String(p.minuteOfDay % 60).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------
// Clasificación de los minutos de un turno
// ---------------------------------------------------------------------
export type Shift = {
  startMs: number;
  endMs: number;
  siteId: string;
  siteName: string;
  // Verificación a mitad del turno: cuántas hizo y si se exigía.
  verifies?: number;
  needsVerify?: boolean;
  // La entrada o la salida fue agregada o corregida por la administradora.
  manual?: boolean;
  // La entrada o la salida se hizo lejos de la sede.
  outOfRange?: boolean;
};

export type ShiftResult = Shift & { minutes: Record<ConceptKey, number>; totalMinutes: number };

export function emptyMinutes(): Record<ConceptKey, number> {
  return Object.fromEntries(CONCEPTS.map((c) => [c.key, 0])) as Record<ConceptKey, number>;
}

// Recorre los turnos de UN empleado en orden cronológico. Un minuto es
// "extra" cuando ya se superó el límite diario (contado por el día en que
// empezó el turno) o el límite semanal (semana lunes-domingo). Es festivo si
// es domingo o está en la lista de festivos; es nocturno según el horario
// configurado.
export function classifyShifts(shifts: Shift[], rules: Rules, holidays: Set<string>): ShiftResult[] {
  const nightStart = parseHHMM(rules.nightStart) ?? 19 * 60;
  const nightEnd = parseHHMM(rules.nightEnd) ?? 6 * 60;
  const dailyLimit = Math.round(rules.dailyLimitHours * 60);
  const weeklyLimit = Math.round(rules.weeklyLimitHours * 60);

  const dailyOrdinary = new Map<string, number>();
  const weeklyOrdinary = new Map<string, number>();
  const sorted = [...shifts].sort((a, b) => a.startMs - b.startMs);

  return sorted.map((shift) => {
    const startDay = localParts(shift.startMs).day;
    const week = mondayOf(startDay);
    const minutes = emptyMinutes();
    let total = 0;

    for (let t = shift.startMs; t < shift.endMs; t += 60_000) {
      const p = localParts(t);
      const night =
        nightStart > nightEnd
          ? p.minuteOfDay >= nightStart || p.minuteOfDay < nightEnd
          : p.minuteOfDay >= nightStart && p.minuteOfDay < nightEnd;
      const holiday = p.dow === 0 || holidays.has(p.day);

      const dayCount = dailyOrdinary.get(startDay) ?? 0;
      const weekCount = weeklyOrdinary.get(week) ?? 0;
      const extra = dayCount >= dailyLimit || (weeklyLimit > 0 && weekCount >= weeklyLimit);

      if (!extra) {
        dailyOrdinary.set(startDay, dayCount + 1);
        weeklyOrdinary.set(week, weekCount + 1);
      }

      const key = `${extra ? "extra" : "ordinary"}_${holiday ? "holiday_" : ""}${night ? "night" : "day"}` as ConceptKey;
      minutes[key] += 1;
      total += 1;
    }
    return { ...shift, minutes, totalMinutes: total };
  });
}

// ---------------------------------------------------------------------
// Dinero
// ---------------------------------------------------------------------
// Ordinarias: solo se paga el recargo (la hora base ya está en el salario).
// Extras: se paga la hora completa más su recargo.
export function payFor(minutes: Record<ConceptKey, number>, monthlySalary: number | null, rules: Rules) {
  if (!monthlySalary || rules.monthlyHours <= 0) return null;
  const hourly = monthlySalary / rules.monthlyHours;
  const byConcept = {} as Record<ConceptKey, number>;
  let total = 0;
  for (const c of CONCEPTS) {
    const hours = minutes[c.key] / 60;
    const pct = rules.rates[c.key] / 100;
    const value = Math.round(hours * hourly * (c.extra ? 1 + pct : pct));
    byConcept[c.key] = value;
    total += value;
  }
  return { hourly: Math.round(hourly), byConcept, total };
}

