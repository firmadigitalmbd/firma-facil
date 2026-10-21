import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const user = await getSessionUser(req);
    if (!user) return NextResponse.json({ username: null });
    return NextResponse.json({
      username: user.username,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
    });
  } catch {
    return NextResponse.json({ username: null });
  }
}
