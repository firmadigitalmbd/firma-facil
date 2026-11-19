import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { hashPassword } from "@/lib/auth";
import {
  EMPLOYEE_COLUMNS,
  fail,
  normalizeCedula,
  parseSalary,
  requireAttendanceAdmin,
  shapeEmployee,
  validateCedula,
  validatePin,
} from "@/lib/asistencia";

export const runtime = "nodejs";

// Editar nombre, cédula, salario, sedes, PIN, o bloquear/permitir el acceso.
// El PIN solo lo cambia la administradora desde aquí (el empleado no puede).
// Los empleados no se borran (tienen registros); se bloquean.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await requireAttendanceAdmin(req);
    if (auth.error) return auth.error;

    const body = await req.json().catch(() => ({}));
    const supabase = getSupabaseAdmin();
    const update: Record<string, any> = {};

    if (body?.fullName !== undefined) {
      const fullName = String(body.fullName).trim();
      if (fullName.length < 3 || fullName.length > 120) return fail("Escribe el nombre completo.", 400);
      update.full_name = fullName;
    }
    if (body?.cedula !== undefined) {
      const cedula = normalizeCedula(body.cedula);
      const invalid = validateCedula(cedula);
      if (invalid) return fail(invalid, 400);
      update.cedula = cedula;
    }
    if (typeof body?.active === "boolean") update.active = body.active;
    if (body?.monthlySalary !== undefined) {
      const salary = parseSalary(body.monthlySalary);
      if (salary.error) return fail(salary.error, 400);
      update.monthly_salary = salary.value;
    }
    if (body?.pin !== undefined && body.pin !== "") {
      const invalidPin = validatePin(body.pin);
      if (invalidPin) return fail(invalidPin, 400);
      update.pin_hash = await hashPassword(body.pin);
      // Un PIN nuevo también desbloquea al empleado.
      update.pin_failed = 0;
      update.pin_locked_until = null;
    }

    if (Object.keys(update).length > 0) {
      const { error } = await supabase.from("att_employees").update(update).eq("id", params.id);
      if (error) {
        if (error.code === "23505") return fail("Ya existe un empleado con esa cédula.", 409);
        return fail(error.message, 500);
      }
    }

    if (Array.isArray(body?.siteIds)) {
      const siteIds: string[] = body.siteIds.map(String);
      if (siteIds.length === 0) return fail("Elige al menos una sede.", 400);
      await supabase.from("att_employee_sites").delete().eq("employee_id", params.id);
      const { error } = await supabase
        .from("att_employee_sites")
        .insert(siteIds.map((site_id) => ({ employee_id: params.id, site_id })));
      if (error) return fail("No se pudieron asignar las sedes.", 500);
    }

    const { data, error } = await supabase
      .from("att_employees")
      .select(EMPLOYEE_COLUMNS)
      .eq("id", params.id)
      .maybeSingle();
    if (error) return fail(error.message, 500);
    if (!data) return fail("Empleado no encontrado.", 404);

    return NextResponse.json({ employee: shapeEmployee(data) });
  } catch (err: any) {
    return fail(err.message || "Error inesperado.", 500);
  }
}
