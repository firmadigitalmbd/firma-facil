import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { fail, isValidDay, requireAttendanceAdmin } from "@/lib/asistencia";
import { CONCEPTS, buildReport, localDate, localTime, reportContext } from "@/lib/payroll";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BRAND = "FFE4032E";
const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND } };
const hours = (min: number) => Math.round((min / 60) * 100) / 100;

function styleHeader(row: ExcelJS.Row) {
  row.font = { bold: true, color: { argb: "FFFFFFFF" } };
  row.fill = HEADER_FILL;
  row.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  row.height = 36;
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAttendanceAdmin(req);
    if (auth.error) return auth.error;

    const sp = req.nextUrl.searchParams;
    const from = sp.get("from");
    const to = sp.get("to");
    if (!isValidDay(from) || !isValidDay(to)) return fail("Elige las fechas desde y hasta.", 400);
    if (from > to) return fail("La fecha inicial no puede ser posterior a la final.", 400);

    const ctx = await reportContext(from, to);
    const report = await buildReport({
      from,
      to,
      employeeId: sp.get("employeeId"),
      siteId: sp.get("siteId"),
      rules: ctx.rules,
      holidays: ctx.holidays,
    });
    const { rules } = report;

    const wb = new ExcelJS.Workbook();
    wb.creator = "Más Baratas Droguerías";
    wb.created = new Date();

    // ---------------- Resumen ----------------
    const sum = wb.addWorksheet("Resumen", { views: [{ state: "frozen", ySplit: 4, xSplit: 2 }] });
    const hoursEnd = 2 + CONCEPTS.length + 1; // última columna de horas (Total horas)
    const lastCol = hoursEnd + 3;
    sum.mergeCells(1, 1, 1, lastCol);
    sum.getCell("A1").value = "Reporte de asistencia y recargos - Más Baratas Droguerías";
    sum.getCell("A1").font = { bold: true, size: 14, color: { argb: BRAND } };
    sum.mergeCells(2, 1, 2, lastCol);
    sum.getCell("A2").value =
      `Periodo: ${from} a ${to} — generado el ${new Date().toLocaleString("es-CO", { timeZone: "America/Bogota" })}` +
      (ctx.closed
        ? ctx.closed.savedRules
          ? " — periodo cerrado: calculado con las reglas guardadas al cerrarlo"
          : " — periodo cerrado (sin reglas guardadas: se usan las actuales)"
        : ctx.partial.length > 0
        ? " — OJO: incluye parte de un periodo cerrado; calculado con las reglas actuales"
        : "");
    sum.getCell("A2").font = { italic: true, size: 10, color: { argb: "FF6B7280" } };

    const header = sum.getRow(4);
    header.values = [
      "Empleado",
      "Cédula",
      ...CONCEPTS.map((c) => `${c.label} (h)`),
      "Total horas",
      "Salario mensual",
      "Valor hora",
      "Recargos y extras a pagar",
    ];
    styleHeader(header);

    let r = 5;
    for (const e of report.employees) {
      sum.getRow(r++).values = [
        e.name,
        e.cedula,
        ...CONCEPTS.map((c) => hours(e.minutes[c.key])),
        hours(e.totalMinutes),
        e.monthlySalary ?? "",
        e.pay?.hourly ?? "",
        e.pay?.total ?? "",
      ];
    }
    const first = 5;
    const last = r - 1;
    if (last >= first) {
      const totalRow = sum.getRow(r);
      totalRow.getCell(1).value = "TOTAL";
      for (let c = 3; c <= hoursEnd; c++) {
        const col = sum.getColumn(c).letter;
        totalRow.getCell(c).value = { formula: `SUM(${col}${first}:${col}${last})` };
      }
      const payCol = sum.getColumn(lastCol).letter;
      totalRow.getCell(lastCol).value = { formula: `SUM(${payCol}${first}:${payCol}${last})` };
      totalRow.font = { bold: true };
      r++;
    }
    sum.getColumn(1).width = 30;
    sum.getColumn(2).width = 14;
    for (let c = 3; c <= hoursEnd; c++) {
      sum.getColumn(c).width = 14;
      sum.getColumn(c).numFmt = "0.00";
    }
    for (let c = hoursEnd + 1; c <= lastCol; c++) {
      sum.getColumn(c).width = 18;
      sum.getColumn(c).numFmt = "#,##0";
    }

    r += 1;
    const notes = [
      "Ordinarias (diurna, nocturna, dominical/festiva): solo se paga el recargo, porque la hora base ya está en el salario.",
      "Extras: se paga la hora completa más su recargo.",
      `Valor hora = salario mensual / ${rules.monthlyHours} horas. Sin salario registrado, solo se muestran las horas.`,
      "Los porcentajes y horarios vienen de Asistencia > Reglas; confírmalos con tu contador antes de pagar.",
    ];
    for (const n of notes) {
      sum.mergeCells(r, 1, r, lastCol);
      sum.getCell(r, 1).value = n;
      sum.getCell(r, 1).font = { italic: true, size: 10, color: { argb: "FF6B7280" } };
      r++;
    }

    // ---------------- Detalle ----------------
    const det = wb.addWorksheet("Detalle de turnos", { views: [{ state: "frozen", ySplit: 1 }] });
    const dh = det.getRow(1);
    dh.values = [
      "Empleado",
      "Cédula",
      "Sede",
      "Fecha entrada",
      "Hora entrada",
      "Fecha salida",
      "Hora salida",
      "Total horas",
      ...CONCEPTS.map((c) => `${c.label} (h)`),
      "Verificación a mitad del turno",
      "Corregido a mano",
      "Lejos de la sede",
    ];
    styleHeader(dh);
    for (const e of report.employees) {
      for (const s of e.shifts) {
        det.addRow([
          e.name,
          e.cedula,
          s.siteName,
          localDate(s.startIso),
          localTime(s.startIso),
          localDate(s.endIso),
          localTime(s.endIso),
          hours(s.totalMinutes),
          ...CONCEPTS.map((c) => hours(s.minutes[c.key])),
          s.needsVerify ? (s.verifies ? "Sí" : "NO la hizo") : "No se exigía",
          s.manual ? "Sí" : "",
          s.outOfRange ? "Sí" : "",
        ]);
      }
    }
    det.columns.forEach((col, i) => {
      col.width = i === 0 ? 30 : 14;
      if (i >= 7 && i < 7 + 1 + CONCEPTS.length) col.numFmt = "0.00";
      if (i === 7 + 1 + CONCEPTS.length) col.width = 24;
      if (i > 7 + 1 + CONCEPTS.length) col.width = 16;
    });

    // ---------------- Incompletas ----------------
    const inc = wb.addWorksheet("Marcaciones incompletas");
    const ih = inc.getRow(1);
    ih.values = ["Empleado", "Cédula", "Sede", "Fecha", "Hora", "Problema"];
    styleHeader(ih);
    for (const e of report.employees) {
      for (const i of e.incomplete) {
        inc.addRow([
          e.name,
          e.cedula,
          i.siteName,
          localDate(i.at),
          localTime(i.at),
          i.kind === "in" ? "Entrada sin salida (no se contó)" : "Salida sin entrada (no se contó)",
        ]);
      }
    }
    inc.columns.forEach((col, i) => (col.width = i === 0 ? 30 : i === 5 ? 38 : 14));

    // ---------------- Reglas usadas ----------------
    const rl = wb.addWorksheet("Reglas usadas");
    rl.addRow(["Jornada nocturna", `${rules.nightStart} a ${rules.nightEnd}`]);
    rl.addRow(["Jornada máxima diaria (h)", rules.dailyLimitHours]);
    rl.addRow(["Jornada máxima semanal (h)", rules.weeklyLimitHours || "sin límite"]);
    rl.addRow(["Horas del mes para valor hora", rules.monthlyHours]);
    rl.addRow([]);
    styleHeader(rl.addRow(["Concepto", "Recargo (%)"]));
    for (const c of CONCEPTS) rl.addRow([c.label, rules.rates[c.key]]);
    rl.getColumn(1).width = 38;
    rl.getColumn(2).width = 20;

    const buffer = await wb.xlsx.writeBuffer();
    return new NextResponse(buffer as ArrayBuffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="asistencia_${from}_a_${to}.xlsx"`,
      },
    });
  } catch (err: any) {
    return fail(err.message || "Error inesperado.", 500);
  }
}
