import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import {
  RECORD_COLUMNS,
  bogotaDateTime,
  fail,
  requireAttendanceAdmin,
  shapeRecord,
  validateNote,
} from "@/lib/asistencia";
import { closedPeriodForDay, localDate } from "@/lib/payroll";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KINDS = ["in", "out", "verify"];

// Corrige un registro (fecha/hora, tipo o sede), lo anula o lo restaura.
// Siempre con motivo. La hora original queda guardada. No se permite tocar
// registros de un periodo cerrado.
//   { day, time, kind?, siteId?, note }  -> corregir
//   { void: true, note }                 -> anular (no cuenta para nada)
//   { restore: true, note }              -> deshacer la anulación
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await requireAttendanceAdmin(req);
    if (auth.error) return auth.error;

    const body = await req.json().catch(() => ({}));
    const noteError = validateNote(body?.note);
    if (noteError) return fail(noteError, 400);

    const supabase = getSupabaseAdmin();
    const { data: rec } = await supabase
      .from("att_records")
      .select("id, recorded_at, original_recorded_at, kind, site_id")
      .eq("id", params.id)
      .maybeSingle();
    if (!rec) return fail("Registro no encontrado.", 404);

    const closedNow = await closedPeriodForDay(localDate(rec.recorded_at));
    if (closedNow) {
      return fail(`Ese registro está en el periodo cerrado del ${closedNow.from} al ${closedNow.to}; ya no se puede modificar.`, 409);
    }

    const update: Record<string, any> = {
      edited_at: new Date().toISOString(),
      edited_by: auth.user!.username,
      edit_note: String(body.note).trim(),
    };

    if (body?.void === true) {
      update.voided_at = new Date().toISOString();
    } else if (body?.restore === true) {
      update.voided_at = null;
    } else {
      const at = bogotaDateTime(body?.day, body?.time);
      if (!at) return fail("Escribe la fecha y la hora.", 400);
      if (new Date(at).getTime() > Date.now()) return fail("La hora no puede ser en el futuro.", 400);
      if (localDate(at) !== localDate(rec.recorded_at)) {
        const closedNew = await closedPeriodForDay(localDate(at));
        if (closedNew) {
          return fail(`La nueva fecha está en el periodo cerrado del ${closedNew.from} al ${closedNew.to}.`, 409);
        }
      }
      if (body?.kind !== undefined) {
        if (!KINDS.includes(String(body.kind))) return fail("Tipo de registro no válido.", 400);
        update.kind = body.kind;
      }
      if (body?.siteId) {
        const { data: site } = await supabase.from("att_sites").select("id").eq("id", body.siteId).maybeSingle();
        if (!site) return fail("Sede no encontrada.", 404);
        update.site_id = body.siteId;
      }
      update.recorded_at = at;
      if (!rec.original_recorded_at && at !== new Date(rec.recorded_at).toISOString()) {
        update.original_recorded_at = rec.recorded_at;
      }
    }

    const { data, error } = await supabase
      .from("att_records")
      .update(update)
      .eq("id", params.id)
      .select(RECORD_COLUMNS)
      .single();
    if (error || !data) return fail(error?.message || "No se pudo guardar.", 500);

    return NextResponse.json({ record: shapeRecord(data, null) });
  } catch (err: any) {
    return fail(err.message || "Error inesperado.", 500);
  }
}
