import webpush from "web-push";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

// Notificaciones al celular (Web Push). Necesita en Vercel:
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:correo)
// Se generan una sola vez con: npx web-push generate-vapid-keys

let configured: boolean | null = null;

export function pushPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY || null;
}

export function pushReady(): boolean {
  if (configured !== null) return configured;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:admin@example.com";
  if (!pub || !priv) return (configured = false);
  try {
    webpush.setVapidDetails(subject, pub, priv);
    configured = true;
  } catch {
    configured = false;
  }
  return configured;
}

export type PushPayload = { title: string; body: string; url: string };

// Envía a todos los celulares suscritos del empleado. Borra las
// suscripciones que ya no existen (el empleado quitó el permiso o la app).
export async function sendToEmployee(employeeId: string, payload: PushPayload): Promise<number> {
  if (!pushReady()) return 0;
  const supabase = getSupabaseAdmin();
  const { data: subs } = await supabase
    .from("att_push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("employee_id", employeeId);

  let sent = 0;
  for (const s of subs || []) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(payload),
        { TTL: 60 * 60, urgency: "high" }
      );
      sent += 1;
    } catch (err: any) {
      if (err?.statusCode === 404 || err?.statusCode === 410) {
        await supabase.from("att_push_subscriptions").delete().eq("id", s.id);
      }
    }
  }
  return sent;
}
