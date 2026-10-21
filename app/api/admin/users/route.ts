import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import {
  getSessionUser,
  hashPassword,
  validateEmail,
  validateNewPassword,
  validateUsername,
} from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PUBLIC_COLUMNS = "id, username, email, role, active, must_change_password, created_at";

async function requireAdmin(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) {
    return { error: NextResponse.json({ error: "No has iniciado sesión." }, { status: 401 }) };
  }
  if (user.role !== "admin") {
    return {
      error: NextResponse.json(
        { error: "Solo la administradora puede gestionar usuarios." },
        { status: 403 }
      ),
    };
  }
  return { user };
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdmin(req);
    if (auth.error) return auth.error;

    const { data, error } = await getSupabaseAdmin()
      .from("app_users")
      .select(PUBLIC_COLUMNS)
      .order("created_at", { ascending: true });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ users: data, currentUserId: auth.user!.id });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Error inesperado." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdmin(req);
    if (auth.error) return auth.error;

    const body = await req.json();
    const username = String(body?.username || "");
    const role = body?.role === "admin" ? "admin" : "user";

    const invalidUsername = validateUsername(username);
    if (invalidUsername) return NextResponse.json({ error: invalidUsername }, { status: 400 });
    const invalid = validateNewPassword(body?.password);
    if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

    const rawEmail = String(body?.email || "").trim().toLowerCase();
    if (rawEmail) {
      const invalidEmail = validateEmail(rawEmail);
      if (invalidEmail) return NextResponse.json({ error: invalidEmail }, { status: 400 });
    }

    const { data, error } = await getSupabaseAdmin()
      .from("app_users")
      .insert({
        username,
        email: rawEmail || null,
        password_hash: await hashPassword(body.password),
        role,
        must_change_password: true,
      })
      .select(PUBLIC_COLUMNS)
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "Ya existe un usuario con ese nombre." },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ user: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Error inesperado." }, { status: 500 });
  }
}
