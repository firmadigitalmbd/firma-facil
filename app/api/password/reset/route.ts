import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { deleteUserSessions, hashPassword, hashToken, validateNewPassword } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const INVALID = "Este enlace no es válido o ya venció. Pide uno nuevo desde \"¿Olvidaste tu contraseña?\".";

// Verifica que un enlace siga vigente (para mostrar el formulario o el aviso).
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") || "";
  if (!token) return NextResponse.json({ valid: false });

  const { data } = await getSupabaseAdmin()
    .from("password_resets")
    .select("expires_at")
    .eq("token_hash", hashToken(token))
    .maybeSingle();

  return NextResponse.json({ valid: !!data && new Date(data.expires_at) > new Date() });
}

export async function POST(req: NextRequest) {
  try {
    const { token, newPassword } = await req.json();

    const invalidPassword = validateNewPassword(newPassword);
    if (invalidPassword) return NextResponse.json({ error: invalidPassword }, { status: 400 });

    const supabase = getSupabaseAdmin();
    const tokenHash = hashToken(String(token || ""));

    // El borrado devuelve la fila: solo una petición puede usar el enlace.
    const { data: used, error } = await supabase
      .from("password_resets")
      .delete()
      .eq("token_hash", tokenHash)
      .select("user_id, expires_at")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!used || new Date(used.expires_at) < new Date()) {
      return NextResponse.json({ error: INVALID }, { status: 400 });
    }

    const { error: updateError } = await supabase
      .from("app_users")
      .update({
        password_hash: await hashPassword(newPassword),
        must_change_password: false,
        failed_attempts: 0,
        locked_until: null,
      })
      .eq("id", used.user_id);
    if (updateError) throw new Error(updateError.message);

    await deleteUserSessions(used.user_id);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Error inesperado." }, { status: 500 });
  }
}
