import { randomBytes, createHash, scrypt as scryptCb, timingSafeEqual } from "crypto";
import type { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const SESSION_COOKIE = "ff_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 días
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_FAILED_ATTEMPTS = 5;
export const LOCK_MINUTES = 15;

export type Role = "admin" | "user";

export type SessionUser = {
  id: string;
  username: string;
  role: Role;
  mustChangePassword: boolean;
  tokenHash: string;
};

function scrypt(password: string, salt: Buffer, keylen: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(password, salt, keylen, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltB64, keyB64] = stored.split("$");
  if (scheme !== "scrypt" || !saltB64 || !keyB64) return false;
  const expected = Buffer.from(keyB64, "base64");
  const actual = await scrypt(password, Buffer.from(saltB64, "base64"), expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

// Hash de relleno: se compara contra él cuando el usuario no existe, para
// que responder "usuario inexistente" tarde lo mismo que "clave mala".
let dummyHash: Promise<string> | null = null;
export function verifyAgainstDummy(password: string) {
  dummyHash ??= hashPassword("relleno-sin-usuario");
  return dummyHash.then((h) => verifyPassword(password, h));
}

// Los nombres de usuario no pueden llevar espacios en ninguna posición.
export function validateUsername(username: unknown): string | null {
  if (typeof username !== "string" || username.length < 3 || username.length > 60) {
    return "El nombre de usuario debe tener entre 3 y 60 caracteres.";
  }
  if (/\s/.test(username)) {
    return "El nombre de usuario no puede tener espacios. Ejemplo: AnaRivera.";
  }
  return null;
}

// Al iniciar sesión se ignoran los espacios que escriba la persona, para
// que quien antes entraba con "Kata Vanegas" siga entrando.
export function stripSpaces(value: string) {
  return value.replace(/\s+/g, "");
}

export function validateNewPassword(password: unknown): string | null {
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
    return `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`;
  }
  if (password.length > 200) return "La contraseña es demasiado larga.";
  return null;
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: string): Promise<string> {
  const supabase = getSupabaseAdmin();
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000).toISOString();

  const { error } = await supabase
    .from("app_sessions")
    .insert({ token_hash: hashToken(token), user_id: userId, expires_at: expiresAt });
  if (error) throw new Error(`No se pudo crear la sesión: ${error.message}`);

  // Limpieza oportunista de sesiones vencidas.
  await supabase.from("app_sessions").delete().lt("expires_at", new Date().toISOString());
  return token;
}

export async function deleteSessionByToken(token: string) {
  await getSupabaseAdmin().from("app_sessions").delete().eq("token_hash", hashToken(token));
}

export async function deleteUserSessions(userId: string, exceptTokenHash?: string) {
  let q = getSupabaseAdmin().from("app_sessions").delete().eq("user_id", userId);
  if (exceptTokenHash) q = q.neq("token_hash", exceptTokenHash);
  await q;
}

export async function getSessionUser(req: NextRequest): Promise<SessionUser | null> {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const tokenHash = hashToken(token);
  const { data, error } = await getSupabaseAdmin()
    .from("app_sessions")
    .select("expires_at, app_users!inner(id, username, role, active, must_change_password)")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (error || !data) return null;
  if (new Date(data.expires_at) < new Date()) return null;

  const u = data.app_users as any;
  if (!u || !u.active) return null;

  return {
    id: u.id,
    username: u.username,
    role: u.role,
    mustChangePassword: !!u.must_change_password,
    tokenHash,
  };
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}

// Migración desde las variables de entorno: si todavía no hay ningún
// usuario en la base de datos, se crean (con la contraseña ya cifrada) los
// que estén en ADMIN_USER / ADMIN_USER_2 con las mismas claves que tenían.
// El usuario 1 queda como administrador y el 2 como usuario normal.
export async function seedUsersFromEnvIfEmpty() {
  const supabase = getSupabaseAdmin();
  const { count, error } = await supabase
    .from("app_users")
    .select("id", { count: "exact", head: true });
  if (error) throw new Error(error.message);
  if ((count || 0) > 0) return;

  const seeds: { username?: string; password?: string; role: Role }[] = [
    { username: process.env.ADMIN_USER, password: process.env.ADMIN_PASSWORD, role: "admin" },
    { username: process.env.ADMIN_USER_2, password: process.env.ADMIN_PASSWORD_2, role: "user" },
  ];

  for (const s of seeds) {
    if (!s.username || !s.password) continue;
    const { error: insertError } = await supabase.from("app_users").insert({
      username: stripSpaces(s.username),
      password_hash: await hashPassword(s.password),
      role: s.role,
    });
    // 23505 = ya existe (otro inicio de sesión simultáneo lo creó primero).
    if (insertError && insertError.code !== "23505") throw new Error(insertError.message);
  }
}
