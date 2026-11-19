"use client";

import { FormEvent, useEffect, useState } from "react";
import AsistenciaNav from "@/components/AsistenciaNav";
import { Loading } from "@/components/Mascots";

type Site = { id: string; name: string; active: boolean };
type Employee = {
  id: string;
  cedula: string;
  full_name: string;
  active: boolean;
  consent_at: string | null;
  monthly_salary: number | null;
  hasPin: boolean;
  pin_locked_until: string | null;
  siteIds: string[];
};

function randomPin() {
  const n = new Uint32Array(1);
  crypto.getRandomValues(n);
  return String(n[0] % 10000).padStart(4, "0");
}

function toggleId(list: string[], id: string) {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

export default function EmpleadosPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");

  const [cedula, setCedula] = useState("");
  const [fullName, setFullName] = useState("");
  const [newPin, setNewPin] = useState("");
  const [newSalary, setNewSalary] = useState("");
  const [siteIds, setSiteIds] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);

  const [editing, setEditing] = useState<Employee | null>(null);
  const [editCedula, setEditCedula] = useState("");
  const [editName, setEditName] = useState("");
  const [editSites, setEditSites] = useState<string[]>([]);
  const [editSalary, setEditSalary] = useState("");
  const [saving, setSaving] = useState(false);

  const [pinEmployee, setPinEmployee] = useState<Employee | null>(null);
  const [pinValue, setPinValue] = useState("");
  const [savingPin, setSavingPin] = useState(false);
  const [pinError, setPinError] = useState("");
  const [notice, setNotice] = useState("");

  const [consentText, setConsentText] = useState("");
  const [savingConsent, setSavingConsent] = useState(false);
  const [consentNotice, setConsentNotice] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const [empRes, siteRes, setRes] = await Promise.all([
          fetch("/api/asistencia/empleados", { cache: "no-store" }),
          fetch("/api/asistencia/sedes", { cache: "no-store" }),
          fetch("/api/asistencia/ajustes", { cache: "no-store" }),
        ]);
        if (empRes.status === 403) return setForbidden(true);
        const emp = await empRes.json();
        const site = await siteRes.json();
        const set = await setRes.json();
        if (!empRes.ok) throw new Error(emp.error || "No se pudo cargar.");
        setEmployees(emp.employees);
        setSites(site.sites || []);
        setConsentText(set.consentText || "");
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const activeSites = sites.filter((s) => s.active);
  const siteName = (id: string) => sites.find((s) => s.id === id)?.name || "?";

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError("");
    setCreating(true);
    try {
      const res = await fetch("/api/asistencia/empleados", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cedula, fullName, siteIds, pin: newPin, monthlySalary: newSalary }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo crear el empleado.");
      setEmployees((prev) =>
        [...prev, data.employee].sort((a, b) => a.full_name.localeCompare(b.full_name, "es"))
      );
      setCedula("");
      setFullName("");
      setNewPin("");
      setNewSalary("");
      setSiteIds([]);
      setNotice(`Empleado creado. Entrégale su PIN (${newPin}) en persona; después no se puede volver a ver, solo cambiar.`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  }

  async function patch(id: string, body: Record<string, unknown>) {
    const res = await fetch(`/api/asistencia/empleados/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "No se pudo guardar.");
    setEmployees((prev) =>
      prev
        .map((e) => (e.id === id ? data.employee : e))
        .sort((a, b) => a.full_name.localeCompare(b.full_name, "es"))
    );
  }

  async function handleToggle(emp: Employee) {
    const msg = emp.active
      ? `¿Bloquear a ${emp.full_name}? No podrá registrar entrada ni salida.`
      : `¿Permitir de nuevo el acceso a ${emp.full_name}?`;
    if (!confirm(msg)) return;
    setError("");
    setBusyId(emp.id);
    try {
      await patch(emp.id, { active: !emp.active });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusyId("");
    }
  }

  async function handleSaveEdit(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setSaving(true);
    setError("");
    try {
      await patch(editing.id, {
        cedula: editCedula,
        fullName: editName,
        siteIds: editSites,
        monthlySalary: editSalary,
      });
      setEditing(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleSavePin(e: FormEvent) {
    e.preventDefault();
    if (!pinEmployee) return;
    setSavingPin(true);
    setPinError("");
    try {
      await patch(pinEmployee.id, { pin: pinValue });
      setNotice(`PIN de ${pinEmployee.full_name} actualizado (${pinValue}). Entrégaselo en persona.`);
      setPinEmployee(null);
    } catch (err: any) {
      setPinError(err.message);
    } finally {
      setSavingPin(false);
    }
  }

  async function handleSaveConsent(e: FormEvent) {
    e.preventDefault();
    setSavingConsent(true);
    setConsentNotice("");
    setError("");
    try {
      const res = await fetch("/api/asistencia/ajustes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consentText }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo guardar.");
      setConsentNotice("Texto guardado. Lo verán los empleados que aún no han aceptado.");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSavingConsent(false);
    }
  }

  function SiteChecks({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
    if (activeSites.length === 0) {
      return <p className="hint">Primero crea al menos una sede en la pestaña Sedes.</p>;
    }
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
        {activeSites.map((s) => (
          <label key={s.id} style={{ display: "flex", gap: 8, alignItems: "center", margin: 0, fontWeight: 400 }}>
            <input
              type="checkbox"
              style={{ width: "auto" }}
              checked={value.includes(s.id)}
              onChange={() => onChange(toggleId(value, s.id))}
            />
            {s.name}
          </label>
        ))}
      </div>
    );
  }

  if (forbidden) {
    return (
      <main className="page">
        <div className="card">
          <h1>Empleados</h1>
          <div className="error-box">Solo la administradora puede entrar aquí.</div>
        </div>
      </main>
    );
  }

  return (
    <main className="page">
      <h1>Asistencia</h1>
      <p className="module-caption">
        Los empleados entran solo con su cédula. Si no está registrada o está bloqueada, no pueden marcar.
      </p>
      <AsistenciaNav />

      {error && <div className="error-box">{error}</div>}
      {notice && <div className="success-box">{notice}</div>}

      <form className="card" onSubmit={handleCreate}>
        <h2>Nuevo empleado</h2>
        <label>Cédula</label>
        <input
          type="text"
          inputMode="numeric"
          value={cedula}
          onChange={(e) => setCedula(e.target.value)}
          autoComplete="off"
        />
        <label>Nombre completo</label>
        <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="off" />
        <label>PIN de 4 números</label>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            type="text"
            inputMode="numeric"
            maxLength={4}
            value={newPin}
            onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ""))}
            autoComplete="off"
          />
          <button type="button" className="secondary" style={{ whiteSpace: "nowrap" }} onClick={() => setNewPin(randomPin())}>
            Generar
          </button>
        </div>
        <p className="hint">Solo la administradora puede asignarlo o cambiarlo.</p>
        <label>Salario mensual (opcional)</label>
        <input
          type="text"
          inputMode="numeric"
          value={newSalary}
          onChange={(e) => setNewSalary(e.target.value)}
          placeholder="Para calcular el valor de recargos y extras"
          autoComplete="off"
        />
        <label>Sedes donde puede registrarse</label>
        <SiteChecks value={siteIds} onChange={setSiteIds} />
        <div className="toolbar">
          <button type="submit" disabled={creating}>
            {creating ? "Creando..." : "Crear empleado"}
          </button>
        </div>
      </form>

      <div className="card">
        <h2>Empleados registrados</h2>
        {loading ? (
          <Loading />
        ) : employees.length === 0 ? (
          <p className="hint">Todavía no hay empleados.</p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Empleado</th>
                  <th>Sedes</th>
                  <th>Estado</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {employees.map((emp) => (
                  <tr key={emp.id}>
                    <td>
                      {emp.full_name}
                      <div className="hint">CC {emp.cedula}</div>
                      {!emp.hasPin && <div className="hint">Sin PIN: no puede registrar hasta que se le asigne uno</div>}
                      {emp.pin_locked_until && new Date(emp.pin_locked_until) > new Date() && (
                        <div className="hint">Bloqueado por intentos fallidos de PIN (se libera cambiando el PIN)</div>
                      )}
                      {!emp.consent_at && <div className="hint">Aún no acepta la autorización de datos</div>}
                    </td>
                    <td>{emp.siteIds.map(siteName).join(", ") || "—"}</td>
                    <td>
                      <span className={`status-badge ${emp.active ? "status-signed" : "status-returned"}`}>
                        {emp.active ? "Permitido" : "Bloqueado"}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button
                          type="button"
                          className="secondary"
                          style={{ padding: "4px 10px", fontSize: 13 }}
                          disabled={busyId === emp.id}
                          onClick={() => {
                            setEditing(emp);
                            setEditCedula(emp.cedula);
                            setEditName(emp.full_name);
                            setEditSites(emp.siteIds);
                            setEditSalary(emp.monthly_salary != null ? String(emp.monthly_salary) : "");
                          }}
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          className="secondary"
                          style={{ padding: "4px 10px", fontSize: 13 }}
                          disabled={busyId === emp.id}
                          onClick={() => {
                            setPinEmployee(emp);
                            setPinValue("");
                            setPinError("");
                          }}
                        >
                          {emp.hasPin ? "Cambiar PIN" : "Asignar PIN"}
                        </button>
                        <button
                          type="button"
                          className={emp.active ? "btn-cancel-doc" : "secondary"}
                          style={{ padding: "4px 10px", fontSize: 13 }}
                          disabled={busyId === emp.id}
                          onClick={() => handleToggle(emp)}
                        >
                          {emp.active ? "Bloquear" : "Permitir"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <form className="card" onSubmit={handleSaveConsent}>
        <h2>Autorización de datos personales</h2>
        <p className="hint">
          Los empleados ven este texto y lo aceptan la primera vez que registran (Ley 1581 de 2012).
          Debe ser revisado por un abogado.
        </p>
        <textarea
          className="config-textarea"
          rows={7}
          value={consentText}
          onChange={(e) => setConsentText(e.target.value)}
        />
        {consentNotice && <div className="success-box">{consentNotice}</div>}
        <div className="toolbar">
          <button type="submit" disabled={savingConsent}>
            {savingConsent ? "Guardando..." : "Guardar texto"}
          </button>
        </div>
      </form>

      {editing && (
        <div className="modal-backdrop" onClick={() => !saving && setEditing(null)}>
          <form className="modal-card" onClick={(e) => e.stopPropagation()} onSubmit={handleSaveEdit}>
            <h2>Editar empleado</h2>
            <label>Cédula</label>
            <input type="text" inputMode="numeric" value={editCedula} onChange={(e) => setEditCedula(e.target.value)} />
            <label>Nombre completo</label>
            <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} />
            <label>Salario mensual (opcional)</label>
            <input type="text" inputMode="numeric" value={editSalary} onChange={(e) => setEditSalary(e.target.value)} />
            <label>Sedes donde puede registrarse</label>
            <SiteChecks value={editSites} onChange={setEditSites} />
            <div className="toolbar">
              <button type="button" className="secondary" onClick={() => setEditing(null)} disabled={saving}>
                Cancelar
              </button>
              <button type="submit" disabled={saving}>
                {saving ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </form>
        </div>
      )}

      {pinEmployee && (
        <div className="modal-backdrop" onClick={() => !savingPin && setPinEmployee(null)}>
          <form className="modal-card" onClick={(e) => e.stopPropagation()} onSubmit={handleSavePin}>
            <h2>PIN de {pinEmployee.full_name}</h2>
            <p className="hint">
              El PIN no se puede consultar, solo reemplazar. Al guardar uno nuevo también se libera si estaba
              bloqueado por intentos fallidos.
            </p>
            <label>Nuevo PIN (4 números)</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="text"
                inputMode="numeric"
                maxLength={4}
                value={pinValue}
                onChange={(e) => setPinValue(e.target.value.replace(/\D/g, ""))}
                autoComplete="off"
                autoFocus
              />
              <button type="button" className="secondary" style={{ whiteSpace: "nowrap" }} onClick={() => setPinValue(randomPin())}>
                Generar
              </button>
            </div>
            {pinError && <div className="error-box">{pinError}</div>}
            <div className="toolbar">
              <button type="button" className="secondary" onClick={() => setPinEmployee(null)} disabled={savingPin}>
                Cancelar
              </button>
              <button type="submit" disabled={savingPin || pinValue.length !== 4}>
                {savingPin ? "Guardando..." : "Guardar PIN"}
              </button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}
