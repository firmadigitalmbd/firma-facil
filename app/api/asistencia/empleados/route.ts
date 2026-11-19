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
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAttendanceAdmin(req);
    if (auth.error) return auth.error;

    const { data, error } = await getSupabaseAdmin()
      .from("att_employees")
      .select(EMPLOYEE_COLUMNS)
      .order("full_name", { ascending: true });
    if (error) return fail(error.message, 500);
    return NextResponse.json({ employees: (data || []).map(shapeEmployee) });
  } catch (err: any) {
    return fail(err.message || "Error inesperado.", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAttendanceAdmin(req);
    if (auth.error) return auth.error;

    const body = await req.json().catch(() => ({}));
    const cedula = normalizeCedula(body?.cedula);
    const invalid = validateCedula(cedula);
    if (invalid) return fail(invalid, 400);
    const fullName = String(body?.fullName || "").trim();
    if (fullName.length < 3 || fullName.length > 120) return fail("Escribe el nombre completo.", 400);
    const invalidPin = validatePin(body?.pin);
    if (invalidPin) return fail(invalidPin, 400);
    const siteIds: string[] = Array.isArray(body?.siteIds) ? body.siteIds.map(String) : [];
    if (siteIds.length === 0) return fail("Elige al menos una sede.", 400);
    const salary = parseSalary(body?.monthlySalary);
    if (salary.error) return fail(salary.error, 400);

    const supabase = getSupabaseAdmin();
    const { data: emp, error } = await supabase
      .from("att_employees")
      .insert({
        cedula,
        full_name: fullName,
        pin_hash: await hashPassword(body.pin),
        monthly_salary: salary.value,
      })
      .select("id")
      .single();
    if (error) {
      if (error.code === "23505") return fail("Ya existe un empleado con esa cédula.", 409);
      return fail(error.message, 500);
    }

    const { error: linkError } = await supabase
      .from("att_employee_sites")
      .insert(siteIds.map((site_id) => ({ employee_id: emp.id, site_id })));
    if (linkError) {
      await supabase.from("att_employees").delete().eq("id", emp.id);
      return fail("No se pudieron asignar las sedes.", 500);
    }

    const { data: full } = await supabase
      .from("att_employees")
      .select(EMPLOYEE_COLUMNS)
      .eq("id", emp.id)
      .single();
    return NextResponse.json({ employee: shapeEmployee(full) });
  } catch (err: any) {
    return fail(err.message || "Error inesperado.", 500);
  }
}
