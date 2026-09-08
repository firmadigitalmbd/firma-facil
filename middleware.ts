import { NextRequest, NextResponse } from "next/server";

// Rutas públicas: el enlace que recibe la persona que firma, las llamadas
// de API que ese enlace necesita, y la pantalla de login. Todo lo demás
// (envío, panel, configuración) queda protegido con sesión de admin.
const PUBLIC_PREFIXES = [
  "/firmar",
  "/api/documents/",
  "/api/sign",
  "/api/return",
  "/login",
  "/api/login",
  "/logo.jpg",
  "/icon",
  "/favicon",
];

const SESSION_COOKIE = "ff_session";

function isPublic(pathname: string) {
  return PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
}

// Recalcula el mismo token HMAC que genera /api/login, usando Web Crypto
// (la API de Node "crypto" no está disponible en el runtime de middleware).
async function expectedSessionToken(secret: string) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode("authenticated"));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (isPublic(pathname) || pathname.startsWith("/_next")) {
    return NextResponse.next();
  }

  const user = process.env.ADMIN_USER;
  const pass = process.env.ADMIN_PASSWORD;

  // Si no se configuraron credenciales, no bloquea (para desarrollo local).
  if (!user || !pass) {
    return NextResponse.next();
  }

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const expected = await expectedSessionToken(pass);

  if (token === expected) {
    return NextResponse.next();
  }

  const loginUrl = new URL("/login", req.url);
  loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
