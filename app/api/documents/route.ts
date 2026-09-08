import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getSupabaseAdmin, DOCUMENTS_BUCKET } from "@/lib/supabaseAdmin";
import { sendMail, linkEmailHtml } from "@/lib/mailer";

export const runtime = "nodejs";

// Crea un documento: sube el PDF original, guarda el registro en la
// base de datos y envía el correo con el enlace de firma.
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const recipientName = String(formData.get("recipientName") || "");
    const recipientCedula = String(formData.get("recipientCedula") || "");
    const recipientEmail = String(formData.get("recipientEmail") || "");
    const boxPage = Number(formData.get("boxPage") || 1);
    const boxX = Number(formData.get("boxX") || 0);
    const boxY = Number(formData.get("boxY") || 0);
    const boxWidth = Number(formData.get("boxWidth") || 0.2);
    const boxHeight = Number(formData.get("boxHeight") || 0.08);

    if (!file || !recipientName || !recipientCedula || !recipientEmail) {
      return NextResponse.json(
        { error: "Faltan datos obligatorios." },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();
    const token = randomUUID();
    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);

    const storagePath = `originals/${token}-${sanitizeFilename(file.name)}`;

    const { error: uploadError } = await supabase.storage
      .from(DOCUMENTS_BUCKET)
      .upload(storagePath, bytes, {
        contentType: "application/pdf",
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json(
        { error: `No se pudo subir el archivo: ${uploadError.message}` },
        { status: 500 }
      );
    }

    const { error: insertError } = await supabase.from("documents").insert({
      original_filename: file.name,
      storage_path_original: storagePath,
      recipient_name: recipientName,
      recipient_cedula: recipientCedula,
      recipient_email: recipientEmail,
      box_page: boxPage,
      box_x: boxX,
      box_y: boxY,
      box_width: boxWidth,
      box_height: boxHeight,
      token,
      status: "sent",
    });

    if (insertError) {
      return NextResponse.json(
        { error: `No se pudo guardar el documento: ${insertError.message}` },
        { status: 500 }
      );
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
    const signUrl = `${appUrl}/firmar/${token}`;

    try {
      await sendMail({
        to: recipientEmail,
        subject: `Documento para firmar: ${file.name}`,
        html: linkEmailHtml({
          recipientName,
          documentName: file.name,
          signUrl,
        }),
      });
    } catch (mailErr: any) {
      // El documento ya quedó creado; avisamos igual si el correo falla,
      // para que puedas copiar el enlace manualmente.
      return NextResponse.json({
        signUrl,
        warning: `El documento se creó pero el correo no se pudo enviar: ${mailErr.message}`,
      });
    }

    return NextResponse.json({ signUrl });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Error inesperado." },
      { status: 500 }
    );
  }
}

function sanitizeFilename(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

// Lista todos los documentos, para el panel de seguimiento.
export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("documents")
      .select(
        "id, created_at, original_filename, recipient_name, recipient_email, token, opened_at, signed_at, status"
      )
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ documents: data });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Error inesperado." },
      { status: 500 }
    );
  }
}
