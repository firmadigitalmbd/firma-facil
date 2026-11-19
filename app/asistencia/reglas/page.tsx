"use client";

import { FormEvent, useEffect, useState } from "react";
import AsistenciaNav from "@/components/AsistenciaNav";
import { Loading } from "@/components/Mascots";
import { CONCEPTS, type ConceptKey, type Rules } from "@/lib/payrollCore";

type Holiday = { day: string; name: string };

function formatDay(day: string) {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("es-CO", {
    timeZone: "UTC",
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
}

export default function ReglasPage() {
  const [rules, setRules] = useState<Rules | null>(null);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);

  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [busyHolidays, setBusyHolidays] = useState(false);
  const [newDay, setNewDay] = useState("");
  const [newName, setNewName] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/asistencia/reglas", { cache: "no-store" });
        const data = await res.json();
        if (res.status === 403) return setForbidden(true);
        if (!res.ok) throw new Error(data.error || "No se pudo cargar.");
        setRules(data.rules);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function loadHolidays(y: number) {
    try {
      const res = await fetch(`/api/asistencia/festivos?year=${y}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudieron cargar los festivos.");
      setHolidays(data.holidays);
    } catch (err: any) {
      setError(err.message);
    }
  }

  useEffect(() => {
    if (!forbidden) void loadHolidays(year);
  }, [year, forbidden]);

  function setRate(key: ConceptKey, value: string) {
    setRules((r) => (r ? { ...r, rates: { ...r.rates, [key]: value as unknown as number } } : r));
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (!rules) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/asistencia/reglas", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rules),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo guardar.");
      setNotice(
        "Reglas guardadas. Se aplican a los reportes de periodos abiertos; los periodos ya cerrados conservan las reglas con que se cerraron."
      );
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function holidayCall(init: RequestInit, url = "/api/asistencia/festivos") {
    setBusyHolidays(true);
    setError("");
    try {
      const res = await fetch(url, init);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo guardar.");
      await loadHolidays(year);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusyHolidays(false);
    }
  }

  const generate = () =>
    holidayCall({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ year }),
    });

  async function addHoliday(e: FormEvent) {
    e.preventDefault();
    await holidayCall({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ day: newDay, name: newName }),
    });
    setNewDay("");
    setNewName("");
  }

  const removeHoliday = (day: string) => {
    if (!confirm("¿Quitar este festivo?")) return;
    void holidayCall({ method: "DELETE" }, `/api/asistencia/festivos?day=${day}`);
  };

  if (forbidden) {
    return (
      <main className="page">
        <div className="card">
          <h1>Reglas</h1>
          <div className="error-box">Solo la administradora puede entrar aquí.</div>
        </div>
      </main>
    );
  }

  return (
    <main className="page">
      <h1>Asistencia</h1>
      <p className="module-caption">
        Parámetros para calcular horas extras y recargos. Los valores iniciales siguen la normativa colombiana
        vigente; confírmalos con tu contador.
      </p>
      <AsistenciaNav />

      {error && <div className="error-box">{error}</div>}
      {notice && <div className="success-box">{notice}</div>}

      {loading || !rules ? (
        <Loading />
      ) : (
        <form onSubmit={handleSave}>
          <div className="card">
            <h2>Jornada</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
              <div>
                <label>Empieza la jornada nocturna</label>
                <input
                  type="time"
                  value={rules.nightStart}
                  onChange={(e) => setRules({ ...rules, nightStart: e.target.value })}
                  style={{ width: "100%", padding: "10px 12px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 15 }}
                />
              </div>
              <div>
                <label>Termina la jornada nocturna</label>
                <input
                  type="time"
                  value={rules.nightEnd}
                  onChange={(e) => setRules({ ...rules, nightEnd: e.target.value })}
                  style={{ width: "100%", padding: "10px 12px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 15 }}
                />
              </div>
              <div>
                <label>Jornada máxima diaria (horas)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={rules.dailyLimitHours}
                  onChange={(e) => setRules({ ...rules, dailyLimitHours: e.target.value as unknown as number })}
                />
              </div>
              <div>
                <label>Jornada máxima semanal (horas)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={rules.weeklyLimitHours}
                  onChange={(e) => setRules({ ...rules, weeklyLimitHours: e.target.value as unknown as number })}
                />
              </div>
              <div>
                <label>Horas del mes para el valor de la hora</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={rules.monthlyHours}
                  onChange={(e) => setRules({ ...rules, monthlyHours: e.target.value as unknown as number })}
                />
              </div>
            </div>
            <p className="hint">
              Lo que pase de la jornada diaria, o de la semanal, se cuenta como hora extra. Semanal en 0 = sin
              límite semanal. Valor de la hora = salario mensual ÷ horas del mes. Los domingos y los festivos de la
              lista de abajo se pagan con recargo dominical/festivo.
            </p>
          </div>

          <div className="card">
            <h2>Verificación durante el turno</h2>
            <label style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 400, marginTop: 0 }}>
              <input
                type="checkbox"
                style={{ width: "auto" }}
                checked={rules.verifyEnabled}
                onChange={(e) => setRules({ ...rules, verifyEnabled: e.target.checked })}
              />
              Pedir un segundo registro (con foto) unas horas después de la entrada
            </label>
            {rules.verifyEnabled && (
              <div style={{ maxWidth: 260 }}>
                <label>Horas después de la entrada</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={rules.verifyAfterHours}
                  onChange={(e) => setRules({ ...rules, verifyAfterHours: e.target.value as unknown as number })}
                />
              </div>
            )}
            <p className="hint">
              Con esta opción activa, el empleado ve en /marcar el botón “Registrar verificación” cuando pasan esas
              horas desde su entrada. No cambia sus horas; en el reporte y el Excel aparecen los turnos donde no la
              hizo. Aplica a los turnos que empiecen desde que la activas. Desmárcala para dejar de pedirla.
            </p>
          </div>

          <div className="card">
            <h2>Ubicación de la sede</h2>
            <label style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 400, marginTop: 0 }}>
              <input
                type="checkbox"
                style={{ width: "auto" }}
                checked={rules.geofenceBlock}
                onChange={(e) => setRules({ ...rules, geofenceBlock: e.target.checked })}
              />
              No dejar registrar a quien esté lejos de la sede
            </label>
            <p className="hint">
              Solo aplica a las sedes que tienen su ubicación guardada (en Sedes). Desmarcada, el registro se
              guarda igual pero queda señalado como “Lejos” en Registros, el reporte y el Excel. Se da un margen
              extra según la precisión del GPS del celular (hasta 100 m).
            </p>
          </div>

          <div className="card">
            <h2>Recargos (% sobre el valor de la hora)</h2>
            <p className="hint">
              En las ordinarias se paga solo el recargo; en las extras se paga la hora completa más el recargo.
              Los recargos combinados ya suman los dos porcentajes (por ejemplo, extra nocturna dominical = 75% +
              90%).
            </p>
            <div className="table-scroll">
              <table>
                <tbody>
                  {CONCEPTS.map((c) => (
                    <tr key={c.key}>
                      <td>
                        {c.label}
                        <div className="hint">{c.extra ? "Hora extra" : "Hora ordinaria"}</div>
                      </td>
                      <td style={{ width: 130 }}>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={rules.rates[c.key]}
                          onChange={(e) => setRate(c.key, e.target.value)}
                          aria-label={`Porcentaje ${c.label}`}
                        />
                      </td>
                      <td style={{ width: 20 }}>%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="toolbar">
              <button type="submit" disabled={saving}>
                {saving ? "Guardando..." : "Guardar reglas"}
              </button>
            </div>
          </div>
        </form>
      )}

      <div className="card">
        <h2>Festivos</h2>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div>
            <label style={{ marginTop: 0 }}>Año</label>
            <select value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {[thisYear - 1, thisYear, thisYear + 1].map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
          <button type="button" onClick={generate} disabled={busyHolidays}>
            {busyHolidays ? "Procesando..." : `Generar festivos de Colombia ${year}`}
          </button>
        </div>
        <p className="hint">
          Los domingos se detectan solos. Aquí solo van los festivos entre semana; puedes agregar o quitar días.
          Los periodos ya cerrados usan los festivos que había al cerrarlos.
        </p>

        {holidays.length === 0 ? (
          <p className="hint">No hay festivos cargados para {year}.</p>
        ) : (
          <div className="table-scroll">
            <table>
              <tbody>
                {holidays.map((h) => (
                  <tr key={h.day}>
                    <td style={{ whiteSpace: "nowrap" }}>{formatDay(h.day)}</td>
                    <td>{h.name}</td>
                    <td style={{ width: 90 }}>
                      <button
                        type="button"
                        className="secondary"
                        style={{ padding: "4px 10px", fontSize: 13 }}
                        disabled={busyHolidays}
                        onClick={() => removeHoliday(h.day)}
                      >
                        Quitar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <form onSubmit={addHoliday}>
          <label>Agregar un festivo</label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input type="date" value={newDay} onChange={(e) => setNewDay(e.target.value)} style={{ flex: "1 1 150px" }} />
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Nombre"
              style={{ flex: "2 1 180px" }}
            />
            <button type="submit" className="secondary" disabled={busyHolidays || !newDay || !newName.trim()}>
              Agregar
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
