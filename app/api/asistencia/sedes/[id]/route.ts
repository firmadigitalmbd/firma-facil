import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { SITE_COLUMNS, fail, parseSiteLocation, requireAttendanceAdmin } from "@/lib/asistencia";

export const runtime = "nodejs";

// Editar nombre/dirección o activar/desactivar una sede.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await requireAttendanceAdmin(req);
    if (auth.error) return auth.error;

    const body = await req.json().catch(() => ({}));
    const update: Record<string, any> = {};

    if (body?.name !== undefined) {
      const name = String(body.name).trim();
      if (name.length < 2 || name.length > 80) return fail("Escribe el nombre de la sede.", 400);
      update.name = name;
    }
    if (body?.address !== undefined) update.address = String(body.address).trim() || null;
    if (typeof body?.active === "boolean") update.active = body.active;
    const loc = parseSiteLocation(body);
    if (loc.error) return fail(loc.error, 400);
    Object.assign(update, loc.update);
    if (Object.keys(update).length === 0) return fail("No hay cambios para guardar.", 400);

    const { data, error } = await getSupabaseAdmin()
      .from("att_sites")
      .update(update)
      .eq("id", params.id)
      .select(SITE_COLUMNS)
      .maybeSingle();
    if (error) {
      if (error.code === "23505") return fail("Ya existe una sede con ese nombre.", 409);
      return fail(error.message, 500);
    }
    if (!data) return fail("Sede no encontrada.", 404);
    return NextResponse.json({ site: data });
  } catch (err: any) {
    return fail(err.message || "Error inesperado.", 500);
  }
}
