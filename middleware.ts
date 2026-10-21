import { NextRequest, NextResponse } from "next/server";

// Rutas públicas: el enlace que recibe la persona que firma, las llamadas
// de API que ese enlace necesita, y la pantalla de login. Todo lo demás
// (envío, panel, configuración) queda protegido con sesión.
const PUBLIC_PREFIXES = [
  "/firmar",
  "/api/documents/",
  "/api/sign",
  "/api/return",
  "/login",
  "/api/login",
  "/api/whoami",
  "/olvide-clave",
  "/restablecer",
  "/api/password",
  "/logo.jpg",
  "/icon",
  "/favicon",
];

// Con "debe cambiar la contraseña" activo solo se permite esto.
const PASSWORD_CHANGE_ALLOWED = [
  "/cambiar-clave",
  "/api/account/password",
  "/api/logout",
  "/api/whoami",
];

const SESSION_COOKIE = "ff_session";

function isPublic(pathname: string) {
  return PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
}

async function sha256Hex(message: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(message));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// La cookie guarda un token aleatorio; la sesión vive en la tabla
// app_sessions de Supabase. Se consulta por REST (el middleware corre en
// el runtime Edge, sin las APIs de Node). Si el usuario fue inactivado o
// la sesión se borró, el acceso se corta en la siguiente petición.
async function lookupSession(token: string): Promise<{ mustChange: boolean } | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;

  const hash = await sha256Hex(token);
  try {
    const res = await fetch(
      `${url}/rest/v1/app_sessions?select=expires_at,app_users!inner(active,must_change_password)&token_hash=eq.${hash}`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: "no-store" }
    );
    if (!res.ok) return null;
    const rows = await res.json();
    const row = rows?.[0];
    if (!row || new Date(row.expires_at) < new Date()) return null;
    const user = row.app_users;
    if (!user?.active) return null;
    return { mustChange: !!user.must_change_password };
  } catch {
    return null;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (isPublic(pathname) || pathname.startsWith("/_next")) {
    return NextResponse.next();
  }

  const isApi = pathname.startsWith("/api/");
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await lookupSession(token) : null;

  if (!session) {
    if (isApi) {
      return NextResponse.json({ error: "Tu sesión terminó. Inicia sesión de nuevo." }, { status: 401 });
    }
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (session.mustChange && !PASSWORD_CHANGE_ALLOWED.some((p) => pathname.startsWith(p))) {
    if (isApi) {
      return NextResponse.json(
        { error: "Debes cambiar tu contraseña antes de continuar." },
        { status: 403 }
      );
    }
    return NextResponse.redirect(new URL("/cambiar-clave", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
