import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { fail, isValidDay, requireAttendanceAdmin } from "@/lib/asistencia";
import { colombianHolidays } from "@/lib/holidays";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAttendanceAdmin(req);
    if (auth.error) return auth.error;

    const year = parseInt(req.nextUrl.searchParams.get("year") || "", 10);
    let q = getSupabaseAdmin().from("att_holidays").select("day, name").order("day", { ascending: true });
    if (Number.isInteger(year)) q = q.gte("day", `${year}-01-01`).lte("day", `${year}-12-31`);
    const { data, error } = await q;
    if (error) return fail(error.message, 500);
    return NextResponse.json({ holidays: data });
  } catch (err: any) {
    return fail(err.message || "Error inesperado.", 500);
  }
}

// POST { year } genera los festivos de Colombia de ese año (sin borrar los
// que ya existan); POST { day, name } agrega uno manual.
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAttendanceAdmin(req);
    if (auth.error) return auth.error;

    const body = await req.json().catch(() => ({}));
    const supabase = getSupabaseAdmin();

    if (body?.year !== undefined) {
      const year = Number(body.year);
      if (!Number.isInteger(year) || year < 2020 || year > 2100) return fail("Año no válido.", 400);
      const { error } = await supabase
        .from("att_holidays")
        .upsert(colombianHolidays(year), { onConflict: "day" });
      if (error) return fail(error.message, 500);
      return NextResponse.json({ ok: true });
    }

    const day = String(body?.day || "");
    const name = String(body?.name || "").trim();
    if (!isValidDay(day)) return fail("Elige una fecha válida.", 400);
    if (name.length < 2 || name.length > 80) return fail("Escribe el nombre del festivo.", 400);
    const { error } = await supabase.from("att_holidays").upsert({ day, name }, { onConflict: "day" });
    if (error) return fail(error.message, 500);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return fail(err.message || "Error inesperado.", 500);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const auth = await requireAttendanceAdmin(req);
    if (auth.error) return auth.error;

    const day = req.nextUrl.searchParams.get("day");
    if (!isValidDay(day)) return fail("Fecha no válida.", 400);
    const { error } = await getSupabaseAdmin().from("att_holidays").delete().eq("day", day);
    if (error) return fail(error.message, 500);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return fail(err.message || "Error inesperado.", 500);
  }
}
