import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { authenticateEmployee, fail, nextKindFor, normalizeCedula } from "@/lib/asistencia";
import { loadRules } from "@/lib/payroll";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Ruta pública (la usa /marcar). Valida cédula + PIN y devuelve el nombre,
// las sedes habilitadas y si toca entrada o salida.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const cedula = normalizeCedula(body?.cedula);

    const auth = await authenticateEmployee(cedula, body?.pin);
    if ("error" in auth) return auth.error;
    const emp = auth.emp;

    const supabase = getSupabaseAdmin();
    const { data: links } = await supabase
      .from("att_employee_sites")
      .select("att_sites!inner(id, name, active)")
      .eq("employee_id", emp.id);

    const sites = (links || [])
      .map((l: any) => l.att_sites)
      .filter((s: any) => s?.active)
      .map((s: any) => ({ id: s.id as string, name: s.name as string }))
      .sort((a, b) => a.name.localeCompare(b.name, "es"));

    if (sites.length === 0) {
      return fail("No tienes ninguna sede habilitada. Consulta con la administradora.", 403);
    }

    let consentText: string | null = null;
    if (!emp.consent_at) {
      const { data: settings } = await supabase
        .from("att_settings")
        .select("consent_text")
        .eq("id", 1)
        .maybeSingle();
      consentText = settings?.consent_text ?? null;
    }

    const state = await nextKindFor(emp.id);

    // Verificación opcional: solo aplica con un turno abierto.
    let verify: { available: boolean; availableAt: string; done: boolean } | null = null;
    if (state.openSince) {
      const rules = await loadRules();
      if (rules.verifyEnabled) {
        const availableAt = new Date(state.openSince.getTime() + rules.verifyAfterHours * 3_600_000);
        verify = {
          available: Date.now() >= availableAt.getTime(),
          availableAt: availableAt.toISOString(),
          done: state.hasVerify,
        };
      }
    }

    return NextResponse.json({
      fullName: emp.full_name,
      sites,
      nextKind: state.kind,
      verify,
      needsConsent: !emp.consent_at,
      consentText,
    });
  } catch (err: any) {
    return fail(err.message || "Error inesperado.", 500);
  }
}
