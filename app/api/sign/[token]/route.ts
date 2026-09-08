import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin, DOCUMENTS_BUCKET } from "@/lib/supabaseAdmin";
import { embedSignatureInPdf } from "@/lib/pdf";
import { sendMail, signedEmailHtml } from "@/lib/mailer";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const { signaturePngBase64, dataConsentAccepted, signatureConsentAccepted } =
      await req.json();
    if (!signaturePngBase64) {
      return NextResponse.json(
        { error: "Falta la firma." },
        { status: 400 }
      );
    }
    if (!dataConsentAccepted || !signatureConsentAccepted) {
      return NextResponse.json(
        { error: "Debes aceptar los dos consentimientos antes de firmar." },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();
    const { data: doc, error: fetchError } = await supabase
      .from("documents")
      .select("*")
      .eq("token", params.token)
      .single();

    if (fetchError || !doc) {
      return NextResponse.json(
        { error: "Documento no encontrado." },
        { status: 404 }
      );
    }

    if (doc.signed_at) {
      return NextResponse.json({ ok: true, alreadySigned: true });
    }

    // Descarga el PDF original
    const { data: pdfBlob, error: downloadError } = await supabase.storage
      .from(DOCUMENTS_BUCKET)
      .download(doc.storage_path_original);

    if (downloadError || !pdfBlob) {
      return NextResponse.json(
        { error: "No se pudo leer el documento original." },
        { status: 500 }
      );
    }

    const originalBytes = new Uint8Array(await pdfBlob.arrayBuffer());

    const signedBytes = await embedSignatureInPdf({
      pdfBytes: originalBytes,
      signaturePngBase64,
      page: doc.box_page,
      x: doc.box_x,
      y: doc.box_y,
      width: doc.box_width,
      height: doc.box_height,
    });

    const { data: legalTexts } = await supabase
      .from("legal_texts")
      .select("data_consent_text, signature_consent_text")
      .eq("id", 1)
      .single();

    const signerIp =
      req.headers.get("x-forwarded-for")?.split(",")[0].trim() || null;

    const signedPath = `signed/${doc.token}-${sanitize(doc.original_filename)}`;

    const { error: uploadError } = await supabase.storage
      .from(DOCUMENTS_BUCKET)
      .upload(signedPath, signedBytes, {
        contentType: "application/pdf",
        upsert: true,
      });

    if (uploadError) {
      return NextResponse.json(
        { error: `No se pudo guardar el documento firmado: ${uploadError.message}` },
        { status: 500 }
      );
    }

    const { error: updateError } = await supabase
      .from("documents")
      .update({
        storage_path_signed: signedPath,
        signed_at: new Date().toISOString(),
        status: "signed",
        consent_data_text: legalTexts?.data_consent_text || null,
        consent_signature_text: legalTexts?.signature_consent_text || null,
        signer_ip: signerIp,
      })
      .eq("token", params.token);

    if (updateError) {
      return NextResponse.json(
        { error: `No se pudo actualizar el documento: ${updateError.message}` },
        { status: 500 }
      );
    }

    const signedBuffer = Buffer.from(signedBytes);
    const ownerEmail = process.env.OWNER_EMAIL;

    const recipients = [doc.recipient_email, ownerEmail].filter(
      Boolean
    ) as string[];

    try {
      await sendMail({
        to: recipients,
        subject: `Documento firmado: ${doc.original_filename}`,
        html: signedEmailHtml({
          recipientName: doc.recipient_name,
          documentName: doc.original_filename,
          forSigner: true,
        }),
        attachments: [
          {
            filename: doc.original_filename.replace(/\.pdf$/i, "") + "-firmado.pdf",
            content: signedBuffer,
            contentType: "application/pdf",
          },
        ],
      });
    } catch (mailErr: any) {
      // El documento ya quedó firmado y guardado; el correo es
      // secundario en este punto.
      return NextResponse.json({
        ok: true,
        warning: `El documento se firmó pero el correo no se pudo enviar: ${mailErr.message}`,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Error inesperado." },
      { status: 500 }
    );
  }
}

function sanitize(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}
