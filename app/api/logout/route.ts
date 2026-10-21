import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, deleteSessionByToken } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (token) {
    try {
      await deleteSessionByToken(token);
    } catch {
      // Aunque falle el borrado en la base, igual se limpia la cookie.
    }
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
