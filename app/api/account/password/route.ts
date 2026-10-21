import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import {
  deleteUserSessions,
  getSessionUser,
  hashPassword,
  validateNewPassword,
  verifyPassword,
} from "@/lib/auth";

export const runtime = "nodejs";

// Cambio de contraseña del propio usuario con sesión iniciada. Cierra sus
// otras sesiones abiertas (por ejemplo en otro computador) y deja esta.
export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser(req);
    if (!user) return NextResponse.json({ error: "No has iniciado sesión." }, { status: 401 });

    const { currentPassword, newPassword } = await req.json();

    const invalid = validateNewPassword(newPassword);
    if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });
    if (newPassword === currentPassword) {
      return NextResponse.json(
        { error: "La contraseña nueva debe ser distinta a la actual." },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();
    const { data: row, error } = await supabase
      .from("app_users")
      .select("password_hash")
      .eq("id", user.id)
      .single();
    if (error || !row) {
      return NextResponse.json({ error: "No se encontró el usuario." }, { status: 404 });
    }

    if (!(await verifyPassword(String(currentPassword || ""), row.password_hash))) {
      return NextResponse.json({ error: "La contraseña actual no es correcta." }, { status: 400 });
    }

    const { error: updateError } = await supabase
      .from("app_users")
      .update({ password_hash: await hashPassword(newPassword), must_change_password: false })
      .eq("id", user.id);
    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    await deleteUserSessions(user.id, user.tokenHash);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Error inesperado." }, { status: 500 });
  }
}
