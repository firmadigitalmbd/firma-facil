import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { sendMail, returnedEmailHtml } from "@/lib/mailer";

export const runtime = "nodejs";

// La persona que firma puede devolver el documento sin firmarlo, dejando
// una observación. El enlace deja de funcionar después de esto.
export async function POST(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const { reason } = await req.json();
    if (!reason || !String(reason).trim()) {
      return NextResponse.json(
        { error: "Debes indicar el motivo de la devolución." },
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

    const expired = doc.expires_at && new Date(doc.expires_at) < new Date();

    if (doc.signed_at || doc.status === "returned" || doc.status === "cancelled" || expired) {
      return NextResponse.json(
        { error: "Este documento ya no se puede devolver." },
        { status: 400 }
      );
    }

    const { error: updateError } = await supabase
      .from("documents")
      .update({
        status: "returned",
        returned_at: new Date().toISOString(),
        return_reason: String(reason).trim(),
      })
      .eq("token", params.token);

    if (updateError) {
      return NextResponse.json(
        { error: `No se pudo registrar la devolución: ${updateError.message}` },
        { status: 500 }
      );
    }

    const ownerEmail = process.env.OWNER_EMAIL;
    if (ownerEmail) {
      try {
        await sendMail({
          to: ownerEmail,
          subject: `Documento devuelto sin firmar: ${doc.original_filename}`,
          html: returnedEmailHtml({
            recipientName: doc.recipient_name,
            recipientEmail: doc.recipient_email,
            documentName: doc.original_filename,
            reason: String(reason).trim(),
          }),
        });
      } catch {
        // La devolución ya quedó registrada; el correo es secundario aquí.
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Error inesperado." },
      { status: 500 }
    );
  }
}
