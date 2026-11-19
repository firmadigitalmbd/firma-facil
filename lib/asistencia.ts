import { NextRequest, NextResponse } from "next/server";
import { requireUser, verifyAgainstDummy, verifyPassword } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { parseCoords } from "@/lib/geo";

export const ATTENDANCE_BUCKET = "attendance";

// Si la última marcación fue una entrada de hace más de estas horas, se
// asume que el empleado olvidó marcar la salida y la siguiente es entrada.
export const MAX_SHIFT_HOURS = 16;
// Evita dobles marcaciones por un toque repetido.
export const MIN_SECONDS_BETWEEN_RECORDS = 60;
export const MAX_PHOTO_BYTES = 300 * 1024;

export type RecordKind = "in" | "out" | "verify";

export function fail(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

// Todas las rutas /api/asistencia/* son solo para la administradora.
export async function requireAttendanceAdmin(req: NextRequest) {
  return requireUser(req, true);
}

export function normalizeCedula(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "");
}

export function validateCedula(cedula: string): string | null {
  if (cedula.length < 5 || cedula.length > 12) {
    return "La cédula debe tener entre 5 y 12 números.";
  }
  return null;
}

export function clientIp(req: NextRequest): string | null {
  const fwd = req.headers.get("x-forwarded-for");
  return (fwd ? fwd.split(",")[0].trim() : req.headers.get("x-real-ip")) || null;
}

// Decide si la próxima marcación del empleado es entrada o salida. Las
// verificaciones a mitad del turno no cambian el estado (siguen dentro).
export async function nextKindFor(employeeId: string): Promise<{
  kind: "in" | "out";
  lastAt: Date | null; // último registro de cualquier tipo (para el mínimo entre registros)
  openSince: Date | null; // entrada del turno abierto, si lo hay
  hasVerify: boolean; // ya verificó en el turno abierto
}> {
  const { data } = await getSupabaseAdmin()
    .from("att_records")
    .select("kind, recorded_at")
    .eq("employee_id", employeeId)
    .is("voided_at", null)
    .lte("recorded_at", new Date().toISOString())
    .order("recorded_at", { ascending: false })
    .limit(20);

  const rows = data || [];
  if (rows.length === 0) return { kind: "in", lastAt: null, openSince: null, hasVerify: false };

  const lastAt = new Date(rows[0].recorded_at);
  const idx = rows.findIndex((r) => r.kind === "in" || r.kind === "out");
  if (idx < 0) return { kind: "in", lastAt, openSince: null, hasVerify: false };

  const lastIO = rows[idx];
  const inAt = new Date(lastIO.recorded_at);
  const hoursSince = (Date.now() - inAt.getTime()) / 3_600_000;
  const open = lastIO.kind === "in" && hoursSince < MAX_SHIFT_HOURS;
  return {
    kind: open ? "out" : "in",
    lastAt,
    openSince: open ? inAt : null,
    hasVerify: open && rows.slice(0, idx).some((r) => r.kind === "verify"),
  };
}

// Fecha "YYYY-MM-DD" interpretada en hora de Colombia (UTC-5, sin horario de verano).
export function bogotaDayStart(day: string) {
  return `${day}T00:00:00-05:00`;
}
export function bogotaDayEnd(day: string) {
  return `${day}T23:59:59.999-05:00`;
}
export function isValidDay(day: string | null): day is string {
  return !!day && /^\d{4}-\d{2}-\d{2}$/.test(day);
}

// ---------------------------------------------------------------------
// PIN de 4 dígitos (lo asigna y cambia solo la administradora)
// ---------------------------------------------------------------------
export const PIN_MAX_FAILED = 5;
export const PIN_LOCK_MINUTES = 15;

export function validatePin(pin: unknown): string | null {
  if (typeof pin !== "string" || !/^\d{4}$/.test(pin)) return "El PIN debe tener exactamente 4 números.";
  return null;
}

export const EMPLOYEE_COLUMNS =
  "id, cedula, full_name, active, consent_at, created_at, monthly_salary, pin_hash, pin_locked_until, att_employee_sites(site_id)";

// Nunca se envía el hash del PIN al navegador: solo si tiene uno asignado.
export function shapeEmployee(row: any) {
  const { att_employee_sites, pin_hash, ...rest } = row;
  return {
    ...rest,
    hasPin: !!pin_hash,
    siteIds: (att_employee_sites || []).map((s: any) => s.site_id as string),
  };
}

// Valida cédula + PIN. Mensaje genérico para cédula inexistente, bloqueada,
// sin PIN o PIN errado (no revela cuál es). Cuenta los fallos y bloquea.
export async function authenticateEmployee(
  cedula: string,
  pin: unknown
): Promise<
  | { error: NextResponse }
  | { emp: { id: string; full_name: string; consent_at: string | null } }
> {
  const generic = () =>
    fail("Cédula o PIN incorrectos. Si no tienes PIN, pídeselo a la administradora.", 403);

  if (validateCedula(cedula) || validatePin(pin)) return { error: generic() };
  const pinStr = pin as string;

  const supabase = getSupabaseAdmin();
  const { data: emp } = await supabase
    .from("att_employees")
    .select("id, full_name, active, consent_at, pin_hash, pin_failed, pin_locked_until")
    .eq("cedula", cedula)
    .maybeSingle();

  if (!emp || !emp.active || !emp.pin_hash) {
    await verifyAgainstDummy(pinStr);
    return { error: generic() };
  }

  if (emp.pin_locked_until && new Date(emp.pin_locked_until) > new Date()) {
    return {
      error: fail(
        `Demasiados intentos fallidos. Espera ${PIN_LOCK_MINUTES} minutos o pide ayuda a la administradora.`,
        429
      ),
    };
  }

  const ok = await verifyPassword(pinStr, emp.pin_hash);
  if (!ok) {
    const failed = (emp.pin_failed || 0) + 1;
    const lock = failed >= PIN_MAX_FAILED;
    await supabase
      .from("att_employees")
      .update({
        pin_failed: lock ? 0 : failed,
        pin_locked_until: lock ? new Date(Date.now() + PIN_LOCK_MINUTES * 60_000).toISOString() : null,
      })
      .eq("id", emp.id);
    return { error: generic() };
  }

  if (emp.pin_failed > 0 || emp.pin_locked_until) {
    await supabase
      .from("att_employees")
      .update({ pin_failed: 0, pin_locked_until: null })
      .eq("id", emp.id);
  }
  return { emp: { id: emp.id, full_name: emp.full_name, consent_at: emp.consent_at } };
}

// ---------------------------------------------------------------------
// Sedes con ubicación
// ---------------------------------------------------------------------
export const SITE_COLUMNS = "id, name, address, active, created_at, lat, lng, radius_m";

// body.location: "4.6097, -74.0817" o un enlace de Google Maps ("" = quitar).
// body.radius: metros (20 a 5000). Devuelve solo los campos que cambian.
export function parseSiteLocation(body: any): { update: Record<string, any>; error?: string } {
  const update: Record<string, any> = {};
  if (body?.location !== undefined) {
    const text = String(body.location ?? "").trim();
    if (!text) {
      update.lat = null;
      update.lng = null;
    } else {
      const c = parseCoords(text);
      if (!c) return { update, error: 'La ubicación no es válida. Pega las coordenadas así: 4.6097, -74.0817' };
      update.lat = c.lat;
      update.lng = c.lng;
    }
  }
  if (body?.radius !== undefined && body.radius !== "") {
    const r = Math.round(Number(body.radius));
    if (!Number.isFinite(r) || r < 20 || r > 5000) return { update, error: "El radio debe estar entre 20 y 5000 metros." };
    update.radius_m = r;
  }
  return { update };
}

// Fecha + hora escritas por la administradora (hora de Colombia) → ISO.
// Devuelve null si no son válidas.
export function bogotaDateTime(day: unknown, time: unknown): string | null {
  const d = String(day ?? "");
  const t = String(time ?? "");
  if (!isValidDay(d) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(t)) return null;
  const ms = new Date(`${d}T${t}:00-05:00`).getTime();
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

// Nota obligatoria en las correcciones manuales.
export function validateNote(note: unknown): string | null {
  const n = String(note ?? "").trim();
  if (n.length < 4) return "Escribe el motivo de la corrección.";
  if (n.length > 300) return "El motivo es muy largo (máximo 300 caracteres).";
  return null;
}

export function parseSalary(value: unknown): { value: number | null; error?: string } {
  if (value === null || value === undefined || value === "") return { value: null };
  const n = Number(String(value).replace(/[^\d.]/g, ""));
  if (!Number.isFinite(n) || n < 0 || n > 1_000_000_000) {
    return { value: null, error: "El salario no es válido." };
  }
  return { value: n };
}


// ---------------------------------------------------------------------
// Registros para el panel
// ---------------------------------------------------------------------
export function shapeRecord(r: any, photoUrl: string | null) {
  return {
    id: r.id,
    kind: r.kind,
    recordedAt: r.recorded_at,
    lat: r.lat,
    lng: r.lng,
    accuracy: r.accuracy,
    employeeId: r.employee_id,
    siteId: r.site_id,
    employeeName: r.att_employees?.full_name ?? "",
    cedula: r.att_employees?.cedula ?? "",
    siteName: r.att_sites?.name ?? "",
    photoUrl,
    photoDeleted: !!r.photo_deleted_at,
    manual: !!r.manual,
    originalRecordedAt: r.original_recorded_at,
    editedAt: r.edited_at,
    editedBy: r.edited_by,
    editNote: r.edit_note,
    voided: !!r.voided_at,
    distance: r.distance_m,
    outOfRange: !!r.out_of_range,
  };
}

export const RECORD_COLUMNS =
  "id, kind, recorded_at, lat, lng, accuracy, employee_id, site_id, photo_path, photo_deleted_at, manual, original_recorded_at, edited_at, edited_by, edit_note, voided_at, distance_m, out_of_range, att_employees(full_name, cedula), att_sites(name)";
