import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { fail, requireAttendanceAdmin } from "@/lib/asistencia";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Ajustes del módulo. Por ahora: texto de autorización de datos personales.
export async function GET(req: NextRequest) {
  try {
    const auth = await requireAttendanceAdmin(req);
    if (auth.error) return auth.error;

    const { data, error } = await getSupabaseAdmin()
      .from("att_settings")
      .select("consent_text")
      .eq("id", 1)
      .maybeSingle();
    if (error) return fail(error.message, 500);
    return NextResponse.json({ consentText: data?.consent_text ?? "" });
  } catch (err: any) {
    return fail(err.message || "Error inesperado.", 500);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const auth = await requireAttendanceAdmin(req);
    if (auth.error) return auth.error;

    const body = await req.json().catch(() => ({}));
    const consentText = String(body?.consentText || "").trim();
    if (consentText.length < 20) return fail("El texto de autorización no puede quedar vacío.", 400);

    const { error } = await getSupabaseAdmin()
      .from("att_settings")
      .upsert({ id: 1, consent_text: consentText, updated_at: new Date().toISOString() });
    if (error) return fail(error.message, 500);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return fail(err.message || "Error inesperado.", 500);
  }
}
