import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin, DOCUMENTS_BUCKET } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

// Descarga del PDF firmado desde el panel. Ruta solo para admin: no
// empieza con ninguno de los prefijos públicos del middleware, así que
// exige usuario/clave automáticamente.
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const view = req.nextUrl.searchParams.get("view") === "1";

    const supabase = getSupabaseAdmin();
    const { data: doc, error } = await supabase
      .from("documents")
      .select("status, storage_path_signed, original_filename")
      .eq("id", params.id)
      .single();

    if (error || !doc) {
      return NextResponse.json({ error: "Documento no encontrado." }, { status: 404 });
    }

    if (doc.status !== "signed" || !doc.storage_path_signed) {
      return NextResponse.json(
        { error: "Este documento todavía no está firmado." },
        { status: 400 }
      );
    }

    const { data: signedUrlData, error: urlError } = await supabase.storage
      .from(DOCUMENTS_BUCKET)
      .createSignedUrl(
        doc.storage_path_signed,
        60,
        view
          ? undefined
          : { download: doc.original_filename.replace(/\.pdf$/i, "") + "-firmado.pdf" }
      );

    if (urlError || !signedUrlData) {
      return NextResponse.json(
        { error: `No se pudo generar el enlace de descarga: ${urlError?.message}` },
        { status: 500 }
      );
    }

    return NextResponse.redirect(signedUrlData.signedUrl);
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Error inesperado." },
      { status: 500 }
    );
  }
}
