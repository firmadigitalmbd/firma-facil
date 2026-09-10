import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Cancela un documento desde el panel (solo admin: esta ruta no está en
// los prefijos públicos del middleware, así que exige sesión). El enlace
// que se envió por correo deja de funcionar de inmediato, igual que
// cuando el firmante lo devuelve.
export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = getSupabaseAdmin();
    const { data: doc, error: fetchError } = await supabase
      .from("documents")
      .select("id, status")
      .eq("id", params.id)
      .single();

    if (fetchError || !doc) {
      return NextResponse.json({ error: "Documento no encontrado." }, { status: 404 });
    }

    if (doc.status === "signed") {
      return NextResponse.json(
        { error: "No se puede cancelar: este documento ya fue firmado." },
        { status: 400 }
      );
    }

    if (doc.status === "cancelled" || doc.status === "returned") {
      return NextResponse.json(
        { error: "Este documento ya no está activo." },
        { status: 400 }
      );
    }

    const { error: updateError } = await supabase
      .from("documents")
      .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
      .eq("id", params.id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Error inesperado." },
      { status: 500 }
    );
  }
}
