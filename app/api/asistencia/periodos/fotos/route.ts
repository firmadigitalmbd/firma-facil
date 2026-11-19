import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import {
  ATTENDANCE_BUCKET,
  bogotaDayEnd,
  bogotaDayStart,
  fail,
  isValidDay,
  requireAttendanceAdmin,
} from "@/lib/asistencia";
import { localDate, localTime } from "@/lib/payroll";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const KIND_LABEL: Record<string, string> = { in: "entrada", out: "salida", verify: "verificacion" };

function safe(text: string) {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

// Lista las fotos de un rango con enlaces temporales. El navegador las
// descarga y arma el ZIP (así no hay límite de tamaño de respuesta).
export async function GET(req: NextRequest) {
  try {
    const auth = await requireAttendanceAdmin(req);
    if (auth.error) return auth.error;

    const from = req.nextUrl.searchParams.get("from");
    const to = req.nextUrl.searchParams.get("to");
    if (!isValidDay(from) || !isValidDay(to)) return fail("Elige las fechas desde y hasta.", 400);
    if (from > to) return fail("La fecha inicial no puede ser posterior a la final.", 400);

    const supabase = getSupabaseAdmin();
    const rows: any[] = [];
    const PAGE = 1000;
    for (let offset = 0; ; offset += PAGE) {
      const { data, error } = await supabase
        .from("att_records")
        .select("id, kind, recorded_at, photo_path, att_employees(full_name, cedula)")
        .not("photo_path", "is", null)
        .gte("recorded_at", bogotaDayStart(from))
        .lte("recorded_at", bogotaDayEnd(to))
        .order("recorded_at", { ascending: true })
        .range(offset, offset + PAGE - 1);
      if (error) return fail(error.message, 500);
      rows.push(...(data || []));
      if (!data || data.length < PAGE) break;
    }

    const urlByPath = new Map<string, string>();
    const paths = rows.map((r) => r.photo_path as string);
    for (let i = 0; i < paths.length; i += 200) {
      const { data: signed, error } = await supabase.storage
        .from(ATTENDANCE_BUCKET)
        .createSignedUrls(paths.slice(i, i + 200), 60 * 60);
      if (error) return fail(error.message, 500);
      for (const s of signed || []) if (s.path && s.signedUrl) urlByPath.set(s.path, s.signedUrl);
    }

    const used = new Set<string>();
    const files = rows
      .filter((r) => urlByPath.has(r.photo_path))
      .map((r) => {
        const base = `${localDate(r.recorded_at)}_${localTime(r.recorded_at).replace(":", "")}_${KIND_LABEL[r.kind] || r.kind}_${safe(r.att_employees?.full_name || "empleado")}_CC${r.att_employees?.cedula || ""}`;
        let name = `${base}.jpg`;
        for (let n = 2; used.has(name); n++) name = `${base}_${n}.jpg`;
        used.add(name);
        return { name, url: urlByPath.get(r.photo_path)! };
      });

    return NextResponse.json({ files });
  } catch (err: any) {
    return fail(err.message || "Error inesperado.", 500);
  }
}
