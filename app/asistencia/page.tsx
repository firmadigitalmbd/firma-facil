"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import AsistenciaNav from "@/components/AsistenciaNav";
import { Loading } from "@/components/Mascots";
import { localDate, localTime } from "@/lib/payrollCore";

type Kind = "in" | "out" | "verify";
type RecordRow = {
  id: string;
  kind: Kind;
  recordedAt: string;
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
  employeeId: string;
  siteId: string;
  employeeName: string;
  cedula: string;
  siteName: string;
  photoUrl: string | null;
  photoDeleted: boolean;
  manual: boolean;
  originalRecordedAt: string | null;
  editedAt: string | null;
  editedBy: string | null;
  editNote: string | null;
  voided: boolean;
  distance: number | null;
  outOfRange: boolean;
};

const KIND_TEXT = { in: "Entrada", out: "Salida", verify: "Verificación" } as const;
const KIND_CLASS = { in: "status-signed", out: "status-opened", verify: "status-sent" } as const;
type Option = { id: string; label: string };

// Formulario del modal: agregar (record = null) o corregir un registro.
type EditForm = {
  record: RecordRow | null;
  employeeId: string;
  siteId: string;
  kind: Kind;
  day: string;
  time: string;
  note: string;
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("es-CO", {
    timeZone: "America/Bogota",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function nowParts() {
  const iso = new Date().toISOString();
  return { day: localDate(iso), time: localTime(iso) };
}

export default function RegistrosPage() {
  const [records, setRecords] = useState<RecordRow[]>([]);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [employees, setEmployees] = useState<Option[]>([]);
  const [sites, setSites] = useState<Option[]>([]);
  const [employeeId, setEmployeeId] = useState("");
  const [siteId, setSiteId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [only, setOnly] = useState("");
  const [photo, setPhoto] = useState<RecordRow | null>(null);

  const [form, setForm] = useState<EditForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const fetchRecords = useCallback(
    async (offset: number) => {
      const params = new URLSearchParams({ offset: String(offset) });
      if (employeeId) params.set("employeeId", employeeId);
      if (siteId) params.set("siteId", siteId);
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      if (only) params.set("only", only);
      const res = await fetch(`/api/asistencia/registros?${params}`, { cache: "no-store" });
      const data = await res.json();
      if (res.status === 403) {
        setForbidden(true);
        return null;
      }
      if (!res.ok) throw new Error(data.error || "No se pudo cargar.");
      return data as { total: number; pageSize: number; records: RecordRow[] };
    },
    [employeeId, siteId, from, to, only]
  );

  // Carga las listas de los filtros una sola vez.
  useEffect(() => {
    (async () => {
      try {
        const [e, s] = await Promise.all([
          fetch("/api/asistencia/empleados", { cache: "no-store" }).then((r) => r.json()),
          fetch("/api/asistencia/sedes", { cache: "no-store" }).then((r) => r.json()),
        ]);
        setEmployees((e.employees || []).map((x: any) => ({ id: x.id, label: x.full_name })));
        setSites((s.sites || []).map((x: any) => ({ id: x.id, label: x.name })));
      } catch {
        /* los filtros quedan vacíos */
      }
    })();
  }, []);

  // Recarga la lista cuando cambia un filtro.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    fetchRecords(0)
      .then((data) => {
        if (cancelled || !data) return;
        setRecords(data.records);
        setTotal(data.total);
        setPageSize(data.pageSize);
      })
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [fetchRecords]);

  async function loadMore() {
    setLoadingMore(true);
    try {
      const data = await fetchRecords(records.length);
      if (data) setRecords((prev) => [...prev, ...data.records]);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoadingMore(false);
    }
  }

  function openNew() {
    const n = nowParts();
    setFormError("");
    setForm({ record: null, employeeId: employeeId, siteId: siteId, kind: "out", day: n.day, time: n.time, note: "" });
  }

  function openEdit(r: RecordRow) {
    setFormError("");
    setForm({
      record: r,
      employeeId: r.employeeId,
      siteId: r.siteId,
      kind: r.kind,
      day: localDate(r.recordedAt),
      time: localTime(r.recordedAt),
      note: "",
    });
  }

  async function send(url: string, method: string, body: Record<string, unknown>) {
    setSaving(true);
    setFormError("");
    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo guardar.");
      const saved: RecordRow = data.record;
      if (method === "POST") {
        setRecords((prev) =>
          [saved, ...prev].sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))
        );
        setTotal((t) => t + 1);
        setNotice(`Registro agregado: ${KIND_TEXT[saved.kind]} de ${saved.employeeName}.`);
      } else {
        setRecords((prev) =>
          prev
            .map((r) => (r.id === saved.id ? { ...saved, photoUrl: r.photoUrl } : r))
            .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))
        );
        setNotice("Registro actualizado.");
      }
      setForm(null);
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function handleSave(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    const base = { day: form.day, time: form.time, kind: form.kind, siteId: form.siteId, note: form.note };
    if (form.record) void send(`/api/asistencia/registros/${form.record.id}`, "PATCH", base);
    else void send("/api/asistencia/registros", "POST", { ...base, employeeId: form.employeeId });
  }

  function handleVoid(restore: boolean) {
    if (!form?.record) return;
    if (!restore && !confirm("¿Anular este registro? Deja de contar en los reportes, pero queda guardado.")) return;
    void send(`/api/asistencia/registros/${form.record.id}`, "PATCH", {
      [restore ? "restore" : "void"]: true,
      note: form.note,
    });
  }

  if (forbidden) {
    return (
      <main className="page">
        <div className="card">
          <h1>Asistencia</h1>
          <div className="error-box">Solo la administradora puede entrar aquí.</div>
        </div>
      </main>
    );
  }

  return (
    <main className="page">
      <h1>Asistencia</h1>
      <p className="module-caption">Entradas y salidas registradas por los empleados. Horas en hora de Colombia.</p>
      <AsistenciaNav />

      <div className="card">
        <h2>Filtros</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
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
          <div>
            <label>Desde</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label>Hasta</label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div>
            <label>Mostrar</label>
            <select value={only} onChange={(e) => setOnly(e.target.value)}>
              <option value="">Todos</option>
              <option value="manual">Solo corregidos o anulados</option>
              <option value="far">Solo lejos de la sede</option>
            </select>
          </div>
        </div>
      </div>

      {error && <div className="error-box">{error}</div>}
      {notice && <div className="success-box">{notice}</div>}

      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <h2 style={{ margin: 0 }}>Registros {!loading && <span className="hint">({total})</span>}</h2>
          <button type="button" onClick={openNew}>
            Agregar registro
          </button>
        </div>
        <p className="hint">
          Si alguien olvidó marcar, agrega el registro con la hora real. Para corregir o anular uno, usa
          “Corregir”. Todo cambio queda anotado con su motivo.
        </p>
        {loading ? (
          <Loading />
        ) : records.length === 0 ? (
          <p className="hint">No hay registros con estos filtros.</p>
        ) : (
          <>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Foto</th>
                    <th>Empleado</th>
                    <th>Tipo</th>
                    <th>Fecha y hora</th>
                    <th>Sede</th>
                    <th>Ubicación</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((r) => (
                    <tr key={r.id} style={r.voided ? { opacity: 0.55 } : undefined}>
                      <td>
                        {r.photoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={r.photoUrl}
                            alt={`Foto de ${r.employeeName}`}
                            width={56}
                            height={56}
                            style={{ objectFit: "cover", borderRadius: 8, cursor: "pointer" }}
                            onClick={() => setPhoto(r)}
                          />
                        ) : (
                          <span className="hint">
                            {r.manual ? "Sin foto (manual)" : r.photoDeleted ? "Borrada (periodo cerrado)" : "—"}
                          </span>
                        )}
                      </td>
                      <td>
                        {r.employeeName}
                        <div className="hint">CC {r.cedula}</div>
                      </td>
                      <td>
                        <span className={`status-badge ${KIND_CLASS[r.kind]}`}>{KIND_TEXT[r.kind]}</span>
                        {r.voided && (
                          <div>
                            <span className="status-badge status-returned">Anulado</span>
                          </div>
                        )}
                        {!r.voided && (r.manual || r.editedAt) && (
                          <div>
                            <span className="status-badge status-pending">{r.manual ? "Manual" : "Corregido"}</span>
                          </div>
                        )}
                      </td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        {formatDate(r.recordedAt)}
                        {r.originalRecordedAt && (
                          <div className="hint">Antes: {formatDate(r.originalRecordedAt)}</div>
                        )}
                        {r.editNote && (
                          <div className="hint" style={{ whiteSpace: "normal", maxWidth: 240 }}>
                            {r.editedBy ? `${r.editedBy}: ` : ""}
                            {r.editNote}
                          </div>
                        )}
                      </td>
                      <td>{r.siteName}</td>
                      <td>
                        {r.lat != null && r.lng != null ? (
                          <a
                            href={`https://www.google.com/maps?q=${r.lat},${r.lng}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Ver mapa
                          </a>
                        ) : (
                          "—"
                        )}
                        {r.accuracy != null && <div className="hint">±{Math.round(r.accuracy)} m</div>}
                        {r.distance != null && (
                          <div>
                            {r.outOfRange ? (
                              <span className="status-badge status-returned">
                                Lejos: {Math.round(r.distance)} m
                              </span>
                            ) : (
                              <span className="hint">A {Math.round(r.distance)} m de la sede</span>
                            )}
                          </div>
                        )}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="secondary"
                          style={{ padding: "4px 10px", fontSize: 13 }}
                          onClick={() => openEdit(r)}
                        >
                          Corregir
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {records.length < total && (
              <div className="toolbar">
                <button type="button" className="secondary" onClick={loadMore} disabled={loadingMore}>
                  {loadingMore ? "Cargando..." : `Cargar ${Math.min(pageSize, total - records.length)} más`}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {photo && photo.photoUrl && (
        <div className="modal-backdrop" onClick={() => setPhoto(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo.photoUrl} alt={photo.employeeName} style={{ width: "100%", borderRadius: 8 }} />
            <p style={{ marginBottom: 0 }}>
              <strong>{photo.employeeName}</strong> · {KIND_TEXT[photo.kind]} ·{" "}
              {formatDate(photo.recordedAt)}
            </p>
            <div className="toolbar">
              <button type="button" className="secondary" onClick={() => setPhoto(null)}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {form && (
        <div className="modal-backdrop" onClick={() => !saving && setForm(null)}>
          <form className="modal-card" onClick={(e) => e.stopPropagation()} onSubmit={handleSave}>
            <h2>{form.record ? "Corregir registro" : "Agregar registro"}</h2>
            {form.record ? (
              <p className="hint" style={{ marginTop: 0 }}>
                {form.record.employeeName} · {KIND_TEXT[form.record.kind]} · {formatDate(form.record.recordedAt)}
                {form.record.voided && " · ANULADO"}
              </p>
            ) : (
              <>
                <label style={{ marginTop: 0 }}>Empleado</label>
                <select value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })}>
                  <option value="">Elige el empleado</option>
                  {employees.map((o) => (
                    <option key={o.id} value={o.id}>{o.label}</option>
                  ))}
                </select>
              </>
            )}

            {!form.record?.voided && (
              <>
                <label>Tipo</label>
                <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as Kind })}>
                  <option value="in">Entrada</option>
                  <option value="out">Salida</option>
                  <option value="verify">Verificación</option>
                </select>
                <label>Sede</label>
                <select value={form.siteId} onChange={(e) => setForm({ ...form, siteId: e.target.value })}>
                  <option value="">Elige la sede</option>
                  {sites.map((o) => (
                    <option key={o.id} value={o.id}>{o.label}</option>
                  ))}
                </select>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <div style={{ flex: "1 1 140px" }}>
                    <label>Fecha</label>
                    <input type="date" value={form.day} onChange={(e) => setForm({ ...form, day: e.target.value })} />
                  </div>
                  <div style={{ flex: "1 1 110px" }}>
                    <label>Hora (Colombia)</label>
                    <input
                      type="time"
                      value={form.time}
                      onChange={(e) => setForm({ ...form, time: e.target.value })}
                      style={{ width: "100%", padding: "10px 12px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 15 }}
                    />
                  </div>
                </div>
              </>
            )}

            <label>Motivo (obligatorio)</label>
            <input
              type="text"
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
              placeholder="Ej: olvidó marcar la salida, confirmado con el jefe de sede"
              maxLength={300}
            />

            {formError && <div className="error-box">{formError}</div>}

            <div className="toolbar">
              <button type="button" className="secondary" onClick={() => setForm(null)} disabled={saving}>
                Cancelar
              </button>
              {form.record &&
                (form.record.voided ? (
                  <button type="button" className="secondary" onClick={() => handleVoid(true)} disabled={saving}>
                    Restaurar registro
                  </button>
                ) : (
                  <button type="button" className="btn-cancel-doc" onClick={() => handleVoid(false)} disabled={saving}>
                    Anular
                  </button>
                ))}
              {!form.record?.voided && (
                <button
                  type="submit"
                  disabled={saving || (!form.record && !form.employeeId) || !form.siteId || !form.day || !form.time}
                >
                  {saving ? "Guardando..." : "Guardar"}
                </button>
              )}
            </div>
          </form>
        </div>
      )}
    </main>
  );
}
