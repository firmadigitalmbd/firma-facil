import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BRAND_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFE4032E" },
};

export async function GET(req: NextRequest) {
  try {
    const from = req.nextUrl.searchParams.get("from");
    const to = req.nextUrl.searchParams.get("to");

    const supabase = getSupabaseAdmin();
    let query = supabase
      .from("documents")
      .select(
        "original_filename, recipient_name, recipient_cedula, recipient_email, created_at, signed_at"
      )
      .eq("status", "signed")
      .order("signed_at", { ascending: true });

    if (from) query = query.gte("signed_at", `${from}T00:00:00.000Z`);
    if (to) query = query.lte("signed_at", `${to}T23:59:59.999Z`);

    const { data: rows, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Más Baratas Droguerías";
    workbook.created = new Date();

    const sheet = workbook.addWorksheet("Documentos firmados", {
      views: [{ state: "frozen", ySplit: 4 }],
    });

    sheet.mergeCells("A1:F1");
    const titleCell = sheet.getCell("A1");
    titleCell.value = "Informe de documentos firmados - Más Baratas Droguerías";
    titleCell.font = { bold: true, size: 14, color: { argb: "FFE4032E" } };
    sheet.getRow(1).height = 26;

    sheet.mergeCells("A2:F2");
    const subtitleCell = sheet.getCell("A2");
    subtitleCell.value = `Rango: ${from || "inicio"} a ${to || "hoy"} — generado el ${new Date().toLocaleString("es-CO")}`;
    subtitleCell.font = { italic: true, size: 10, color: { argb: "FF6B7280" } };

    const headerRowNumber = 4;
    const headers = [
      "Documento",
      "Firmante",
      "Cédula",
      "Correo",
      "Fecha de envío",
      "Fecha de firma",
    ];
    const headerRow = sheet.getRow(headerRowNumber);
    headers.forEach((h, i) => {
      const cell = headerRow.getCell(i + 1);
      cell.value = h;
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = BRAND_FILL;
      cell.alignment = { vertical: "middle" };
    });
    headerRow.height = 22;

    sheet.columns = [
      { key: "documento", width: 32 },
      { key: "firmante", width: 26 },
      { key: "cedula", width: 16 },
      { key: "correo", width: 30 },
      { key: "enviado", width: 20 },
      { key: "firmado", width: 20 },
    ];

    (rows || []).forEach((r, idx) => {
      const row = sheet.addRow({
        documento: r.original_filename,
        firmante: r.recipient_name,
        cedula: r.recipient_cedula,
        correo: r.recipient_email,
        enviado: r.created_at ? new Date(r.created_at).toLocaleString("es-CO") : "",
        firmado: r.signed_at ? new Date(r.signed_at).toLocaleString("es-CO") : "",
      });
      if (idx % 2 === 1) {
        row.eachCell((cell) => {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF9FAFB" } };
        });
      }
      row.eachCell((cell) => {
        cell.border = { bottom: { style: "thin", color: { argb: "FFE5E7EB" } } };
      });
    });

    sheet.mergeCells(`A3:F3`);

    const buffer = await workbook.xlsx.writeBuffer();

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="informe-firmados.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Error inesperado." }, { status: 500 });
  }
}
