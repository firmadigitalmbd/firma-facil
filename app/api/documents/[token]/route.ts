import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin, DOCUMENTS_BUCKET } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

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
      return NextResponse.json(
        { error: "Documento no encontrado." },
        { status: 404 }
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
      return NextResponse.json(
        { error: `No se pudo generar el enlace del archivo: ${urlError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
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
      },
      fileUrl: signedUrlData.signedUrl,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Error inesperado." },
      { status: 500 }
    );
  }
}
