import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const cookie = req.cookies.get("ff_session")?.value;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!cookie || !adminPassword) {
    return NextResponse.json({ username: null });
  }

  const [payload, sig] = cookie.split(".");
  if (!payload || !sig) {
    return NextResponse.json({ username: null });
  }

  const expected = createHmac("sha256", adminPassword).update(payload).digest("hex");
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);

  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    return NextResponse.json({ username: null });
  }

  try {
    const username = Buffer.from(payload, "base64url").toString("utf-8");
    return NextResponse.json({ username });
  } catch {
    return NextResponse.json({ username: null });
  }
}
