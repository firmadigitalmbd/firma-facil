import { createClient } from "@supabase/supabase-js";

// Este cliente SOLO se usa en el servidor (rutas /api/*).
// Usa la Service Role Key, que tiene acceso total y NUNCA debe
// exponerse al navegador.
export function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Faltan las variables de entorno de Supabase (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)."
    );
  }

  return createClient(url, key, {
    auth: { persistSession: false },
  });
}

export const DOCUMENTS_BUCKET = "documents";
