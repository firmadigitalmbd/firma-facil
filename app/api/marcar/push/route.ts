import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { authenticateEmployee, fail, normalizeCedula } from "@/lib/asistencia";
import { pushReady } from "@/lib/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Ruta pública (la usa /marcar). Guarda el permiso de notificaciones del
// celular del empleado para avisarle cuando le toque la verificación.
export async function POST(req: NextRequest) {
  try {
    if (!pushReady()) return fail("Los avisos al celular no están configurados.", 503);

    const body = await req.json().catch(() => ({}));
    const auth = await authenticateEmployee(normalizeCedula(body?.cedula), body?.pin);
    if ("error" in auth) return auth.error;

    const sub = body?.subscription;
    const endpoint = String(sub?.endpoint || "");
    const p256dh = String(sub?.keys?.p256dh || "");
    const authKey = String(sub?.keys?.auth || "");
    if (!/^https:\/\//.test(endpoint) || endpoint.length > 1000 || !p256dh || !authKey) {
      return fail("El permiso de notificaciones no es válido.", 400);
    }

    const { error } = await getSupabaseAdmin()
      .from("att_push_subscriptions")
      .upsert(
        {
          employee_id: auth.emp.id,
          endpoint,
          p256dh,
          auth: authKey,
          user_agent: (req.headers.get("user-agent") || "").slice(0, 300),
        },
        { onConflict: "endpoint" }
      );
    if (error) return fail(error.message, 500);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return fail(err.message || "Error inesperado.", 500);
  }
}
