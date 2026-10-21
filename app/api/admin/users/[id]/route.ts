import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import {
  deleteUserSessions,
  getSessionUser,
  hashPassword,
  validateNewPassword,
} from "@/lib/auth";

export const runtime = "nodejs";

const PUBLIC_COLUMNS = "id, username, role, active, must_change_password, created_at";

function fail(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

// Cambios sobre un usuario: role, active y/o newPassword (clave temporal).
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const me = await getSessionUser(req);
    if (!me) return fail("No has iniciado sesión.", 401);
    if (me.role !== "admin") return fail("Solo la administradora puede gestionar usuarios.", 403);

    const body = await req.json();
    const supabase = getSupabaseAdmin();

    const { data: target, error: fetchError } = await supabase
      .from("app_users")
      .select("id, role, active")
      .eq("id", params.id)
      .maybeSingle();
    if (fetchError) return fail(fetchError.message, 500);
    if (!target) return fail("Usuario no encontrado.", 404);

    const update: Record<string, any> = {};

    const nextRole = body?.role === "admin" || body?.role === "user" ? body.role : target.role;
    const nextActive = typeof body?.active === "boolean" ? body.active : target.active;

    if (nextActive === false && target.id === me.id) {
      return fail("No puedes inactivar tu propio usuario.", 400);
    }
    if (nextRole === "admin" && !nextActive) {
      return fail("Un usuario inactivo no puede ser administrador.", 400);
    }

    // Siempre debe quedar al menos una administradora activa.
    const losesAdmin = target.role === "admin" && target.active && (nextRole !== "admin" || !nextActive);
    if (losesAdmin) {
      const { count, error: countError } = await supabase
        .from("app_users")
        .select("id", { count: "exact", head: true })
        .eq("role", "admin")
        .eq("active", true)
        .neq("id", target.id);
      if (countError) return fail(countError.message, 500);
      if (!count) {
        return fail(
          "Debe quedar al menos una administradora activa. Asigna el rol a otra persona primero.",
          400
        );
      }
    }

    if (nextRole !== target.role) update.role = nextRole;
    if (nextActive !== target.active) {
      update.active = nextActive;
      if (nextActive) {
        update.failed_attempts = 0;
        update.locked_until = null;
      }
    }

    if (body?.newPassword !== undefined) {
      if (target.id === me.id) {
        return fail("Para tu propio usuario usa la opción \"Cambiar contraseña\".", 400);
      }
      const invalid = validateNewPassword(body.newPassword);
      if (invalid) return fail(invalid, 400);
      update.password_hash = await hashPassword(body.newPassword);
      update.must_change_password = true;
      update.failed_attempts = 0;
      update.locked_until = null;
    }

    if (Object.keys(update).length === 0) return fail("No hay cambios para guardar.", 400);

    const { data, error } = await supabase
      .from("app_users")
      .update(update)
      .eq("id", target.id)
      .select(PUBLIC_COLUMNS)
      .single();
    if (error) return fail(error.message, 500);

    // Inactivar o restablecer la clave cierra todas sus sesiones abiertas.
    if (update.active === false || update.password_hash) {
      await deleteUserSessions(target.id);
    }

    return NextResponse.json({ user: data });
  } catch (err: any) {
    return fail(err.message || "Error inesperado.", 500);
  }
}
