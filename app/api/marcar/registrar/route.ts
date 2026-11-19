import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import {
  ATTENDANCE_BUCKET,
  MAX_PHOTO_BYTES,
  MIN_SECONDS_BETWEEN_RECORDS,
  authenticateEmployee,
  clientIp,
  fail,
  nextKindFor,
  normalizeCedula,
  type RecordKind,
} from "@/lib/asistencia";
import { loadRules, localTime } from "@/lib/payroll";
import { distanceMeters, gpsSlack } from "@/lib/geo";
import { pushPublicKey, pushReady } from "@/lib/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Ruta pública (la usa /marcar). Guarda una marcación: la hora la pone la
// base de datos y el tipo (entrada/salida) lo decide el servidor.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const cedula = normalizeCedula(body?.cedula);

    const auth = await authenticateEmployee(cedula, body?.pin);
    if ("error" in auth) return auth.error;
    const emp = auth.emp;

    const siteId = String(body?.siteId || "");
    const lat = Number(body?.lat);
    const lng = Number(body?.lng);
    const accuracy = body?.accuracy == null ? null : Number(body.accuracy);
    if (
      !Number.isFinite(lat) || !Number.isFinite(lng) ||
      lat < -90 || lat > 90 || lng < -180 || lng > 180
    ) {
      return fail("No se pudo obtener tu ubicación. Activa el GPS e inténtalo de nuevo.", 400);
    }

    const match = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(String(body?.photo || ""));
    if (!match) return fail("Falta la foto.", 400);
    const photo = Buffer.from(match[1], "base64");
    if (photo.length < 1024 || photo.length > MAX_PHOTO_BYTES || photo[0] !== 0xff || photo[1] !== 0xd8) {
      return fail("La foto no es válida. Vuelve a tomarla.", 400);
    }

    const supabase = getSupabaseAdmin();

    const { data: link } = await supabase
      .from("att_employee_sites")
      .select("site_id, att_sites!inner(active, name, lat, lng, radius_m)")
      .eq("employee_id", emp.id)
      .eq("site_id", siteId)
      .maybeSingle();
    if (!link || !(link as any).att_sites?.active) {
      return fail("Esa sede no está habilitada para ti.", 403);
    }

    const rules = await loadRules();

    // Distancia a la sede (solo si la sede tiene su ubicación guardada).
    const site = (link as any).att_sites;
    let distance: number | null = null;
    let outOfRange = false;
    if (site.lat != null && site.lng != null) {
      distance = distanceMeters(lat, lng, Number(site.lat), Number(site.lng));
      outOfRange = distance > Number(site.radius_m || 150) + gpsSlack(accuracy);
      if (outOfRange && rules.geofenceBlock) {
        return fail(
          `Estás a unos ${Math.round(distance)} m de ${site.name}. Debes registrar desde la sede. ` +
            "Si estás allí, espera a que el GPS se ajuste e inténtalo de nuevo.",
          403
        );
      }
    }

    if (!emp.consent_at) {
      if (body?.acceptConsent !== true) {
        return fail("Debes aceptar la autorización de datos personales.", 400);
      }
      const { data: settings } = await supabase
        .from("att_settings")
        .select("consent_text")
        .eq("id", 1)
        .maybeSingle();
      await supabase
        .from("att_employees")
        .update({ consent_at: new Date().toISOString(), consent_text: settings?.consent_text ?? null })
        .eq("id", emp.id);
    }

    const state = await nextKindFor(emp.id);
    const lastAt = state.lastAt;
    let kind: RecordKind = state.kind;

    if (body?.action === "verify") {
      if (!rules.verifyEnabled) return fail("La verificación no está activa.", 400);
      if (!state.openSince) return fail("No tienes un turno abierto para verificar.", 400);
      if (state.hasVerify) return fail("Ya registraste la verificación de este turno.", 400);
      const availableAt = new Date(state.openSince.getTime() + rules.verifyAfterHours * 3_600_000);
      if (Date.now() < availableAt.getTime()) {
        return fail(`La verificación estará disponible desde las ${localTime(availableAt.toISOString())}.`, 400);
      }
      kind = "verify";
    }

    if (lastAt && Date.now() - lastAt.getTime() < MIN_SECONDS_BETWEEN_RECORDS * 1000) {
      return fail("Ya registraste hace un momento. Espera un minuto.", 429);
    }

    const month = new Date().toISOString().slice(0, 7);
    const photoPath = `${emp.id}/${month}/${randomUUID()}.jpg`;
    const { error: uploadError } = await supabase.storage
      .from(ATTENDANCE_BUCKET)
      .upload(photoPath, photo, { contentType: "image/jpeg", upsert: false });
    if (uploadError) return fail(`No se pudo guardar la foto: ${uploadError.message}`, 500);

    const { data: rec, error: insertError } = await supabase
      .from("att_records")
      .insert({
        employee_id: emp.id,
        site_id: siteId,
        kind,
        lat,
        lng,
        accuracy: accuracy != null && Number.isFinite(accuracy) ? accuracy : null,
        photo_path: photoPath,
        ip: clientIp(req),
        user_agent: (req.headers.get("user-agent") || "").slice(0, 300),
        distance_m: distance,
        out_of_range: outOfRange,
      })
      .select("recorded_at")
      .single();

    if (insertError || !rec) {
      await supabase.storage.from(ATTENDANCE_BUCKET).remove([photoPath]);
      return fail(insertError?.message || "No se pudo guardar el registro.", 500);
    }

    const verifyAt =
      kind === "in" && rules.verifyEnabled
        ? new Date(new Date(rec.recorded_at).getTime() + rules.verifyAfterHours * 3_600_000).toISOString()
        : null;

    return NextResponse.json({
      ok: true,
      kind,
      fullName: emp.full_name,
      siteName: (link as any).att_sites.name,
      recordedAt: rec.recorded_at,
      outOfRange,
      // Hora a la que le tocará la verificación y clave para ofrecerle el aviso.
      verifyAt,
      pushKey: verifyAt && pushReady() ? pushPublicKey() : null,
    });
  } catch (err: any) {
    return fail(err.message || "Error inesperado.", 500);
  }
}
