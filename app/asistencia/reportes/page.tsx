"use client";

import { useEffect, useState } from "react";
import AsistenciaNav from "@/components/AsistenciaNav";
import { Loading } from "@/components/Mascots";
import { CONCEPTS, type ConceptKey } from "@/lib/payrollCore";
import { buildZip, type ZipEntry } from "@/lib/zipStore";

type Option = { id: string; label: string };
type Row = {
  id: string;
  name: string;
  cedula: string;
  monthlySalary: number | null;
  minutes: Record<ConceptKey, number>;
  totalMinutes: number;
  pay: { hourly: number; total: number } | null;
  shiftCount: number;
  missingVerify: number;
  manualShifts: number;
  outOfRangeShifts: number;
  incomplete: { at: string; siteName: string; kind: "in" | "out" }[];
};

type Period = {
  id: string;
  from: string;
  to: string;
  closedAt: string;
  closedBy: string | null;
  photosDeleted: number;
  employees: number;
  totalPay: number;
};

type ZipState = { status: "idle" | "working" | "done" | "error"; done: number; total: number; message?: string };

function bogotaToday() {
  return new Date(Date.now() - 5 * 3_600_000).toISOString().slice(0, 10);
}

const hours = (min: number) => (min / 60).toFixed(2);
const money = (n: number) => `$ ${n.toLocaleString("es-CO")}`;

function isoDay(d: Date) {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

function bogotaDateTime(iso: string) {
  return new Date(iso).toLocaleString("es-CO", {
    timeZone: "America/Bogota",
    dateStyle: "short",
    timeStyle: "short",
  });
}

export default function ReportesPage() {
  const today = new Date();
  const [from, setFrom] = useState(isoDay(new Date(today.getFullYear(), today.getMonth(), 1)));
  const [to, setTo] = useState(isoDay(today));
  const [employeeId, setEmployeeId] = useState("");
  const [siteId, setSiteId] = useState("");
  const [employees, setEmployees] = useState<Option[]>([]);
  const [sites, setSites] = useState<Option[]>([]);

  const [rows, setRows] = useState<Row[] | null>(null);
  const [ctxInfo, setCtxInfo] = useState<{
    closed: { from: string; to: string; savedRules: boolean } | null;
    partial: { from: string; to: string }[];
  }>({ closed: null, partial: [] });
  const [loading, setLoading] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState("");

  // Cierre de periodo
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);
  const [excelDone, setExcelDone] = useState(false);
  const [zip, setZip] = useState<ZipState>({ status: "idle", done: 0, total: 0 });
  const [confirmText, setConfirmText] = useState("");
  const [closing, setClosing] = useState(false);
  const [closeNotice, setCloseNotice] = useState("");
  const [periods, setPeriods] = useState<Period[]>([]);

  async function loadPeriods() {
    try {
      const res = await fetch("/api/asistencia/periodos", { cache: "no-store" });
      const data = await res.json();
      if (res.ok) setPeriods(data.periods);
    } catch {
      /* la lista queda vacía */
    }
  }

  useEffect(() => {
    void loadPeriods();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [e, s] = await Promise.all([
          fetch("/api/asistencia/empleados", { cache: "no-store" }),
          fetch("/api/asistencia/sedes", { cache: "no-store" }),
        ]);
        if (e.status === 403) return setForbidden(true);
        const ed = await e.json();
        const sd = await s.json();
        setEmployees((ed.employees || []).map((x: any) => ({ id: x.id, label: x.full_name })));
        setSites((sd.sites || []).map((x: any) => ({ id: x.id, label: x.name })));
      } catch {
        /* filtros vacíos */
      }
    })();
  }, []);

  function query() {
    const p = new URLSearchParams({ from, to });
    if (employeeId) p.set("employeeId", employeeId);
    if (siteId) p.set("siteId", siteId);
    return p.toString();
  }

  async function generate() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/asistencia/reportes?${query()}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo generar el reporte.");
      setRows(data.employees);
      setCtxInfo({ closed: data.closed ?? null, partial: data.partial ?? [] });
      setRange({ from, to });
      setExcelDone(false);
      setZip({ status: "idle", done: 0, total: 0 });
      setConfirmText("");
      setCloseNotice("");
    } catch (err: any) {
      setError(err.message);
      setRows(null);
    } finally {
      setLoading(false);
    }
  }

  // Las fotos se descargan en el navegador y se arman en un ZIP aquí mismo.
  async function downloadPhotos() {
    if (!range) return;
    setZip({ status: "working", done: 0, total: 0 });
    try {
      const res = await fetch(`/api/asistencia/periodos/fotos?from=${range.from}&to=${range.to}`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo listar las fotos.");
      const files: { name: string; url: string }[] = data.files;

      if (files.length === 0) {
        setZip({ status: "done", done: 0, total: 0, message: "No hay fotos en este periodo." });
        return;
      }

      const entries: ZipEntry[] = new Array(files.length);
      let next = 0;
      let done = 0;
      setZip({ status: "working", done: 0, total: files.length });

      async function worker() {
        while (next < files.length) {
          const i = next++;
          const r = await fetch(files[i].url);
          if (!r.ok) throw new Error(`No se pudo descargar la foto ${files[i].name} (${r.status}).`);
          entries[i] = { name: files[i].name, data: new Uint8Array(await r.arrayBuffer()) };
          done += 1;
          setZip({ status: "working", done, total: files.length });
        }
      }
      await Promise.all(Array.from({ length: 6 }, worker));

      const blob = buildZip(entries);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `fotos_asistencia_${range.from}_a_${range.to}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setZip({ status: "done", done: files.length, total: files.length });
    } catch (err: any) {
      setZip({ status: "error", done: 0, total: 0, message: err.message });
    }
  }

  async function closePeriod() {
    if (!range) return;
    setClosing(true);
    setError("");
    setCloseNotice("");
    try {
      const res = await fetch("/api/asistencia/periodos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...range, confirm: confirmText }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo cerrar el periodo.");
      setCloseNotice(
        data.failed > 0
          ? `Periodo cerrado, pero ${data.failed} foto(s) no se pudieron borrar. Vuelve a cerrar el mismo rango para reintentar.`
          : `Periodo cerrado. Se borraron ${data.deleted} foto(s); el resumen quedó guardado.`
      );
      setExcelDone(false);
      setZip({ status: "idle", done: 0, total: 0 });
      setConfirmText("");
      await loadPeriods();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setClosing(false);
    }
  }

  if (forbidden) {
    return (
      <main className="page">
        <div className="card">
          <h1>Reportes</h1>
          <div className="error-box">Solo la administradora puede entrar aquí.</div>
        </div>
      </main>
    );
  }

  const totalPay = (rows || []).reduce((sum, r) => sum + (r.pay?.total || 0), 0);
  const incompleteCount = (rows || []).reduce((sum, r) => sum + r.incomplete.length, 0);

  return (
    <main className="page" style={{ maxWidth: 1100 }}>
      <h1>Asistencia</h1>
      <p className="module-caption">Horas trabajadas por tipo de recargo, para liquidar extras y recargos.</p>
      <AsistenciaNav />

      <div className="card">
        <h2>Periodo</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
          <div>
            <label>Desde</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label>Hasta</label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div>
            <label>Empleado</label>
            <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
              <option value="">Todos</option>
              {employees.map((o) => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label>Sede</label>
            <select value={siteId} onChange={(e) => setSiteId(e.target.value)}>
              <option value="">Todas</option>
              {sites.map((o) => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="toolbar">
          <button type="button" onClick={generate} disabled={loading || !from || !to}>
            {loading ? "Calculando..." : "Ver reporte"}
          </button>
          <a
            className="btn-link secondary"
            href={`/api/asistencia/reportes/export?${query()}`}
            aria-disabled={!from || !to}
          >
            Descargar Excel
          </a>
        </div>
      </div>

      {error && <div className="error-box">{error}</div>}

      {loading && <Loading />}

      {rows && !loading && (
        <div className="card">
          <h2>Resumen del {from} al {to}</h2>
          {ctxInfo.closed && (
            <div className="success-box" style={{ marginTop: 0, marginBottom: 12 }}>
              Este periodo ya está cerrado.{" "}
              {ctxInfo.closed.savedRules
                ? "Se calcula con las reglas y festivos guardados al cerrarlo, aunque después se hayan cambiado."
                : "Se cerró antes de guardar las reglas, así que se calcula con las reglas actuales."}
            </div>
          )}
          {ctxInfo.partial.length > 0 && (
            <div className="error-box" style={{ marginTop: 0, marginBottom: 12 }}>
              Este rango incluye parte de un periodo ya cerrado (
              {ctxInfo.partial.map((p) => `${p.from} al ${p.to}`).join(", ")}) y se calcula con las reglas
              actuales. Para ver lo que se cerró, consulta con las fechas exactas de ese periodo.
            </div>
          )}
          {incompleteCount > 0 && (
            <div className="error-box" style={{ marginTop: 0, marginBottom: 12 }}>
              Hay {incompleteCount} marcación(es) incompleta(s) (entrada sin salida o salida sin entrada). No se
              cuentan en las horas. Están en el Excel, hoja “Marcaciones incompletas”; corrígelas en Registros con
              “Agregar registro”.
            </div>
          )}
          {rows.length === 0 ? (
            <p className="hint">No hay turnos completos en este periodo.</p>
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Empleado</th>
                    {CONCEPTS.map((c) => (
                      <th key={c.key} style={{ textAlign: "right" }}>{c.label}</th>
                    ))}
                    <th style={{ textAlign: "right" }}>Total h</th>
                    <th style={{ textAlign: "right" }}>A pagar</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td>
                        {r.name}
                        <div className="hint">
                          CC {r.cedula} · {r.shiftCount} turno(s)
                          {r.incomplete.length > 0 && ` · ${r.incomplete.length} incompleta(s)`}
                          {r.missingVerify > 0 && ` · ${r.missingVerify} sin verificación`}
                          {r.manualShifts > 0 && ` · ${r.manualShifts} corregido(s) a mano`}
                          {r.outOfRangeShifts > 0 && ` · ${r.outOfRangeShifts} lejos de la sede`}
                        </div>
                      </td>
                      {CONCEPTS.map((c) => (
                        <td key={c.key} style={{ textAlign: "right" }}>{hours(r.minutes[c.key])}</td>
                      ))}
                      <td style={{ textAlign: "right" }}><strong>{hours(r.totalMinutes)}</strong></td>
                      <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                        {r.pay ? money(r.pay.total) : <span className="hint">sin salario</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
                {totalPay > 0 && (
                  <tfoot>
                    <tr>
                      <td colSpan={CONCEPTS.length + 2}><strong>Total recargos y extras</strong></td>
                      <td style={{ textAlign: "right", whiteSpace: "nowrap" }}><strong>{money(totalPay)}</strong></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
          <p className="hint">
            Calculado con las reglas de la pestaña Reglas, hora de Colombia. El Excel trae además el detalle turno
            por turno. Generado {bogotaDateTime(new Date().toISOString())}.
          </p>
        </div>
      )}

      {range && rows && !loading && (
        <div className="card">
          <h2>Cerrar periodo {range.from} al {range.to}</h2>
          <p className="hint" style={{ marginTop: 0 }}>
            Al cerrar se guarda una copia del resumen y se <strong>borran las fotos</strong> de este rango para
            liberar espacio. Los registros (hora, sede y ubicación) se conservan. Antes debes descargar el Excel y
            las fotos. El cierre usa todos los empleados y sedes, sin los filtros de arriba.
          </p>

          {range.to >= bogotaToday() ? (
            <div className="error-box">
              Solo se pueden cerrar periodos que ya terminaron. Elige un rango que termine ayer o antes.
            </div>
          ) : (
            <>
              <ol style={{ paddingLeft: 20, lineHeight: 1.9 }}>
                <li>
                  <a
                    className="btn-link secondary"
                    href={`/api/asistencia/reportes/export?from=${range.from}&to=${range.to}`}
                    onClick={() => setExcelDone(true)}
                  >
                    Descargar Excel
                  </a>{" "}
                  {excelDone && <span className="status-badge status-signed">Descargado</span>}
                </li>
                <li>
                  <button type="button" className="secondary" onClick={downloadPhotos} disabled={zip.status === "working"}>
                    {zip.status === "working"
                      ? `Descargando fotos ${zip.done}/${zip.total}...`
                      : "Descargar fotos (ZIP)"}
                  </button>{" "}
                  {zip.status === "done" && (
                    <span className="status-badge status-signed">
                      {zip.message || `${zip.total} foto(s) descargadas`}
                    </span>
                  )}
                  {zip.status === "error" && <div className="error-box">{zip.message}</div>}
                </li>
                <li>
                  Escribe <strong>CERRAR</strong> para confirmar:
                  <input
                    type="text"
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    autoComplete="off"
                    style={{ maxWidth: 200, marginLeft: 8 }}
                  />
                </li>
              </ol>
              {incompleteCount > 0 && (
                <p className="hint">
                  Ojo: hay {incompleteCount} marcación(es) incompleta(s) que no se están contando. Revísalas antes
                  de cerrar.
                </p>
              )}
              <div className="toolbar">
                <button
                  type="button"
                  className="btn-cancel-doc"
                  onClick={closePeriod}
                  disabled={closing || !excelDone || zip.status !== "done" || confirmText !== "CERRAR"}
                >
                  {closing ? "Cerrando..." : "Cerrar periodo y borrar fotos"}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {closeNotice && <div className="success-box">{closeNotice}</div>}

      <div className="card">
        <h2>Periodos cerrados</h2>
        {periods.length === 0 ? (
          <p className="hint">Todavía no has cerrado ningún periodo.</p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Periodo</th>
                  <th>Cerrado</th>
                  <th style={{ textAlign: "right" }}>Empleados</th>
                  <th style={{ textAlign: "right" }}>Fotos borradas</th>
                  <th style={{ textAlign: "right" }}>Recargos y extras</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {periods.map((pd) => (
                  <tr key={pd.id}>
                    <td style={{ whiteSpace: "nowrap" }}>{pd.from} al {pd.to}</td>
                    <td>
                      {bogotaDateTime(pd.closedAt)}
                      {pd.closedBy && <div className="hint">{pd.closedBy}</div>}
                    </td>
                    <td style={{ textAlign: "right" }}>{pd.employees}</td>
                    <td style={{ textAlign: "right" }}>{pd.photosDeleted}</td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      {pd.totalPay > 0 ? money(pd.totalPay) : "—"}
                    </td>
                    <td>
                      <a
                        className="btn-link secondary"
                        style={{ padding: "4px 10px", fontSize: 13 }}
                        href={`/api/asistencia/reportes/export?from=${pd.from}&to=${pd.to}`}
                      >
                        Excel
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="hint">
          El Excel de un periodo cerrado se genera con las reglas y festivos que había al cerrarlo. Los registros
          de un periodo cerrado ya no se pueden corregir.
        </p>
      </div>
    </main>
  );
}
