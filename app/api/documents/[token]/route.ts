import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin, DOCUMENTS_BUCKET } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store, no-cache, must-revalidate" };

function json(body: any, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

// Devuelve la información pública del documento a partir del token del
// enlace de firma, y marca la primera vez que se abre.
export async function GET(
  _req: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const supabase = getSupabaseAdmin();
    const { data: doc, error } = await supabase
      .from("documents")
      .select("*")
      .eq("token", params.token)
      .single();

    if (error || !doc) {
      return json({ error: "Documento no encontrado." }, 404);
    }

    if (doc.status === "returned") {
      return json(
        { error: "Este enlace ya no está disponible: el documento fue devuelto sin firmar." },
        410
      );
    }

    if (doc.status === "cancelled") {
      return json(
        { error: "Este enlace ya no está disponible: quien te lo envió canceló este documento." },
        410
      );
    }

    if (doc.status === "signed") {
      return json(
        {
          error:
            "Este enlace ya no está disponible: el documento ya fue firmado. Revisa tu correo para ver la copia firmada.",
        },
        410
      );
    }

    if (doc.expires_at && new Date(doc.expires_at) < new Date()) {
      return json(
        { error: "Este enlace ya venció y no está disponible." },
        410
      );
    }

    if (!doc.opened_at) {
      await supabase
        .from("documents")
        .update({ opened_at: new Date().toISOString(), status: "opened" })
        .eq("token", params.token);
      doc.opened_at = new Date().toISOString();
      doc.status = "opened";
    }

    const path = doc.signed_at
      ? doc.storage_path_signed
      : doc.storage_path_original;

    const { data: signedUrlData, error: urlError } = await supabase.storage
      .from(DOCUMENTS_BUCKET)
      .createSignedUrl(path, 60 * 60); // 1 hora

    if (urlError) {
      return json({ error: `No se pudo generar el enlace del archivo: ${urlError.message}` }, 500);
    }

    const { data: legalTexts } = await supabase
      .from("legal_texts")
      .select("data_consent_text, signature_consent_text, data_policy_full_text")
      .eq("id", 1)
      .single();

    return json({
      document: {
        originalFilename: doc.original_filename,
        recipientName: doc.recipient_name,
        boxPage: doc.box_page,
        boxX: doc.box_x,
        boxY: doc.box_y,
        boxWidth: doc.box_width,
        boxHeight: doc.box_height,
        signedAt: doc.signed_at,
        status: doc.status,
        dataConsentText: legalTexts?.data_consent_text || "",
        signatureConsentText: legalTexts?.signature_consent_text || "",
        dataPolicyFullText: legalTexts?.data_policy_full_text || "",
      },
      fileUrl: signedUrlData.signedUrl,
    });
  } catch (err: any) {
    return json({ error: err.message || "Error inesperado." }, 500);
  }
}
