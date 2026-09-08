import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";

export const runtime = "nodejs";

const SESSION_COOKIE = "ff_session";

// El secreto de firma siempre es ADMIN_PASSWORD (el del usuario 1), sin
// importar cuál de los dos usuarios inició sesión. Así solo necesitamos
// un secreto fijo y garantizado para verificar la cookie.
function sign(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

function safeEqual(a: string, b: string) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

export async function POST(req: NextRequest) {
  const { username, password } = await req.json();
  const u = String(username || "");
  const p = String(password || "");

  const adminUser = process.env.ADMIN_USER;
  const adminPassword = process.env.ADMIN_PASSWORD;
  const adminUser2 = process.env.ADMIN_USER_2;
  const adminPassword2 = process.env.ADMIN_PASSWORD_2;

  if (!adminUser || !adminPassword) {
    return NextResponse.json({ error: "El acceso no está configurado." }, { status: 500 });
  }

  let matchedUsername: string | null = null;

  if (safeEqual(u, adminUser) && safeEqual(p, adminPassword)) {
    matchedUsername = adminUser;
  } else if (
    adminUser2 &&
    adminPassword2 &&
    safeEqual(u, adminUser2) &&
    safeEqual(p, adminPassword2)
  ) {
    matchedUsername = adminUser2;
  }

  if (!matchedUsername) {
    return NextResponse.json({ error: "Usuario o contraseña incorrectos." }, { status: 401 });
  }

  const payload = Buffer.from(matchedUsername, "utf-8").toString("base64url");
  const cookieValue = `${payload}.${sign(payload, adminPassword)}`;

  const res = NextResponse.json({ ok: true, username: matchedUsername });
  res.cookies.set(SESSION_COOKIE, cookieValue, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 días
  });
  return res;
}
