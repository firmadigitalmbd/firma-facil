import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Ruta solo para admin (no empieza con ningún prefijo público del
// middleware): lee y edita los textos legales que ve el firmante.
export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("legal_texts")
      .select("data_consent_text, signature_consent_text, data_policy_full_text")
      .eq("id", 1)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: "No se pudieron cargar los textos." }, { status: 500 });
    }

    return NextResponse.json({
      dataConsentText: data.data_consent_text,
      signatureConsentText: data.signature_consent_text,
      dataPolicyFullText: data.data_policy_full_text,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Error inesperado." }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { dataConsentText, signatureConsentText, dataPolicyFullText } = await req.json();

    if (!dataConsentText?.trim() || !signatureConsentText?.trim() || !dataPolicyFullText?.trim()) {
      return NextResponse.json({ error: "Ningún campo puede quedar vacío." }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from("legal_texts")
      .update({
        data_consent_text: dataConsentText,
        signature_consent_text: signatureConsentText,
        data_policy_full_text: dataPolicyFullText,
        updated_at: new Date().toISOString(),
      })
      .eq("id", 1);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Error inesperado." }, { status: 500 });
  }
}
