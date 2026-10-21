import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import {
  LOCK_MINUTES,
  MAX_FAILED_ATTEMPTS,
  SESSION_COOKIE,
  createSession,
  seedUsersFromEnvIfEmpty,
  sessionCookieOptions,
  stripSpaces,
  verifyAgainstDummy,
  verifyPassword,
} from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const USER_COLUMNS =
  "id, username, password_hash, role, active, must_change_password, failed_attempts, locked_until";

async function findUser(username: string) {
  const { data, error } = await getSupabaseAdmin()
    .from("app_users")
    .select(USER_COLUMNS)
    .eq("username_key", username.toLowerCase())
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const username = stripSpaces(String(body?.username || ""));
    const password = String(body?.password || "");

    let user = username ? await findUser(username) : null;

    // Primera vez con la tabla vacía: se migran los usuarios de las
    // variables de entorno y se vuelve a buscar.
    if (!user && username) {
      await seedUsersFromEnvIfEmpty();
      user = await findUser(username);
    }

    if (!user) {
      await verifyAgainstDummy(password);
      return NextResponse.json({ error: "Usuario o contraseña incorrectos." }, { status: 401 });
    }

    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      return NextResponse.json(
        { error: `Demasiados intentos fallidos. Intenta de nuevo en ${LOCK_MINUTES} minutos.` },
        { status: 429 }
      );
    }

    const supabase = getSupabaseAdmin();

    if (!(await verifyPassword(password, user.password_hash))) {
      const attempts = (user.failed_attempts || 0) + 1;
      const lock = attempts >= MAX_FAILED_ATTEMPTS;
      await supabase
        .from("app_users")
        .update({
          failed_attempts: lock ? 0 : attempts,
          locked_until: lock
            ? new Date(Date.now() + LOCK_MINUTES * 60 * 1000).toISOString()
            : null,
        })
        .eq("id", user.id);
      return NextResponse.json({ error: "Usuario o contraseña incorrectos." }, { status: 401 });
    }

    // Se revisa después de validar la clave para no revelar qué usuarios existen.
    if (!user.active) {
      return NextResponse.json(
        { error: "Tu usuario está inactivo. Habla con la administradora." },
        { status: 403 }
      );
    }

    if (user.failed_attempts || user.locked_until) {
      await supabase
        .from("app_users")
        .update({ failed_attempts: 0, locked_until: null })
        .eq("id", user.id);
    }

    const token = await createSession(user.id);
    const res = NextResponse.json({
      ok: true,
      username: user.username,
      mustChangePassword: user.must_change_password,
    });
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
    return res;
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "No se pudo iniciar sesión." },
      { status: 500 }
    );
  }
}
