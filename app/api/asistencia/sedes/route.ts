import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { SITE_COLUMNS, fail, parseSiteLocation, requireAttendanceAdmin } from "@/lib/asistencia";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAttendanceAdmin(req);
    if (auth.error) return auth.error;

    const { data, error } = await getSupabaseAdmin()
      .from("att_sites")
      .select(SITE_COLUMNS)
      .order("name", { ascending: true });
    if (error) return fail(error.message, 500);
    return NextResponse.json({ sites: data });
  } catch (err: any) {
    return fail(err.message || "Error inesperado.", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAttendanceAdmin(req);
    if (auth.error) return auth.error;

    const body = await req.json().catch(() => ({}));
    const name = String(body?.name || "").trim();
    const address = String(body?.address || "").trim();
    if (name.length < 2 || name.length > 80) return fail("Escribe el nombre de la sede.", 400);
    const loc = parseSiteLocation(body);
    if (loc.error) return fail(loc.error, 400);

    const { data, error } = await getSupabaseAdmin()
      .from("att_sites")
      .insert({ name, address: address || null, ...loc.update })
      .select(SITE_COLUMNS)
      .single();
    if (error) {
      if (error.code === "23505") return fail("Ya existe una sede con ese nombre.", 409);
      return fail(error.message, 500);
    }
    return NextResponse.json({ site: data });
  } catch (err: any) {
    return fail(err.message || "Error inesperado.", 500);
  }
}
