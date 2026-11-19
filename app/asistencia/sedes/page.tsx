"use client";

import { FormEvent, useEffect, useState } from "react";
import AsistenciaNav from "@/components/AsistenciaNav";
import { Loading } from "@/components/Mascots";
import { parseCoords } from "@/lib/geo";

type Site = {
  id: string;
  name: string;
  address: string | null;
  active: boolean;
  lat: number | null;
  lng: number | null;
  radius_m: number;
};

const DEFAULT_RADIUS = "150";

function coordsText(s: { lat: number | null; lng: number | null }) {
  return s.lat != null && s.lng != null ? `${s.lat}, ${s.lng}` : "";
}

// Campos de ubicación: pegar coordenadas o tomarlas del GPS del celular
// estando en la sede.
function LocationFields(props: {
  location: string;
  radius: string;
  onLocation: (v: string) => void;
  onRadius: (v: string) => void;
}) {
  const [gps, setGps] = useState<"idle" | "waiting" | "error">("idle");
  const [gpsInfo, setGpsInfo] = useState("");

  function takeMyLocation() {
    if (!navigator.geolocation) return setGps("error");
    setGps("waiting");
    setGpsInfo("");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        props.onLocation(`${pos.coords.latitude.toFixed(6)}, ${pos.coords.longitude.toFixed(6)}`);
        setGpsInfo(`Tomada con precisión de ±${Math.round(pos.coords.accuracy)} m.`);
        setGps("idle");
      },
      () => setGps("error"),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
  }

  const parsed = parseCoords(props.location);
  return (
    <>
      <label>Ubicación de la sede (opcional)</label>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input
          type="text"
          value={props.location}
          onChange={(e) => props.onLocation(e.target.value)}
          placeholder="4.6097, -74.0817"
          style={{ flex: "2 1 200px" }}
        />
        <button type="button" className="secondary" onClick={takeMyLocation} disabled={gps === "waiting"}>
          {gps === "waiting" ? "Ubicando..." : "Usar mi ubicación actual"}
        </button>
      </div>
      <p className="hint" style={{ marginBottom: 0 }}>
        Pega las coordenadas desde Google Maps (clic derecho sobre la sede → copiar las coordenadas), o párate en
        la sede con el celular y usa el botón.
        {gpsInfo && ` ${gpsInfo}`}
        {gps === "error" && " No se pudo obtener la ubicación del celular."}
        {props.location.trim() && !parsed && " Las coordenadas no son válidas."}
        {parsed && (
          <>
            {" "}
            <a href={`https://www.google.com/maps?q=${parsed.lat},${parsed.lng}`} target="_blank" rel="noreferrer">
              Ver en el mapa
            </a>
          </>
        )}
      </p>
      <label>Radio permitido (metros)</label>
      <input
        type="text"
        inputMode="numeric"
        value={props.radius}
        onChange={(e) => props.onRadius(e.target.value.replace(/\D/g, ""))}
        style={{ maxWidth: 140 }}
      />
    </>
  );
}

export default function SedesPage() {
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");

  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [location, setLocation] = useState("");
  const [radius, setRadius] = useState(DEFAULT_RADIUS);
  const [creating, setCreating] = useState(false);

  const [editing, setEditing] = useState<Site | null>(null);
  const [editName, setEditName] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editLocation, setEditLocation] = useState("");
  const [editRadius, setEditRadius] = useState(DEFAULT_RADIUS);
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/asistencia/sedes", { cache: "no-store" });
        const data = await res.json();
        if (res.status === 403) return setForbidden(true);
        if (!res.ok) throw new Error(data.error || "No se pudo cargar.");
        setSites(data.sites);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function patch(id: string, body: Record<string, unknown>) {
    const res = await fetch(`/api/asistencia/sedes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "No se pudo guardar.");
    setSites((prev) =>
      prev.map((s) => (s.id === id ? data.site : s)).sort((a, b) => a.name.localeCompare(b.name, "es"))
    );
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError("");
    setCreating(true);
    try {
      const res = await fetch("/api/asistencia/sedes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, address, location, radius }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo crear la sede.");
      setSites((prev) => [...prev, data.site].sort((a, b) => a.name.localeCompare(b.name, "es")));
      setName("");
      setAddress("");
      setLocation("");
      setRadius(DEFAULT_RADIUS);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  }

  async function handleToggle(site: Site) {
    const msg = site.active
      ? `¿Desactivar la sede "${site.name}"? Los empleados ya no podrán registrarse allí.`
      : `¿Reactivar la sede "${site.name}"?`;
    if (!confirm(msg)) return;
    setError("");
    setBusyId(site.id);
    try {
      await patch(site.id, { active: !site.active });
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
    setEditError("");
    try {
      await patch(editing.id, {
        name: editName,
        address: editAddress,
        location: editLocation,
        radius: editRadius,
      });
      setEditing(null);
    } catch (err: any) {
      setEditError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (forbidden) {
    return (
      <main className="page">
        <div className="card">
          <h1>Sedes</h1>
          <div className="error-box">Solo la administradora puede entrar aquí.</div>
        </div>
      </main>
    );
  }

  return (
    <main className="page">
      <h1>Asistencia</h1>
      <p className="module-caption">Crea las sedes donde los empleados registran su entrada y salida.</p>
      <AsistenciaNav />

      {error && <div className="error-box">{error}</div>}

      <form className="card" onSubmit={handleCreate}>
        <h2>Nueva sede</h2>
        <label>Nombre</label>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Sede Centro" />
        <label>Dirección (opcional)</label>
        <input type="text" value={address} onChange={(e) => setAddress(e.target.value)} />
        <LocationFields location={location} radius={radius} onLocation={setLocation} onRadius={setRadius} />
        <div className="toolbar">
          <button type="submit" disabled={creating}>
            {creating ? "Creando..." : "Crear sede"}
          </button>
        </div>
      </form>

      <div className="card">
        <h2>Sedes registradas</h2>
        {loading ? (
          <Loading />
        ) : sites.length === 0 ? (
          <p className="hint">Todavía no hay sedes. Crea la primera arriba.</p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Sede</th>
                  <th>Ubicación</th>
                  <th>Estado</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {sites.map((s) => (
                  <tr key={s.id}>
                    <td>
                      {s.name}
                      {s.address && <div className="hint">{s.address}</div>}
                    </td>
                    <td>
                      {s.lat != null && s.lng != null ? (
                        <>
                          <a href={`https://www.google.com/maps?q=${s.lat},${s.lng}`} target="_blank" rel="noreferrer">
                            Ver mapa
                          </a>
                          <div className="hint">Radio {s.radius_m} m</div>
                        </>
                      ) : (
                        <span className="hint">Sin ubicación</span>
                      )}
                    </td>
                    <td>
                      <span className={`status-badge ${s.active ? "status-signed" : "status-returned"}`}>
                        {s.active ? "Activa" : "Inactiva"}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button
                          type="button"
                          className="secondary"
                          style={{ padding: "4px 10px", fontSize: 13 }}
                          disabled={busyId === s.id}
                          onClick={() => {
                            setEditing(s);
                            setEditName(s.name);
                            setEditAddress(s.address || "");
                            setEditLocation(coordsText(s));
                            setEditRadius(String(s.radius_m ?? DEFAULT_RADIUS));
                            setEditError("");
                          }}
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          className={s.active ? "btn-cancel-doc" : "secondary"}
                          style={{ padding: "4px 10px", fontSize: 13 }}
                          disabled={busyId === s.id}
                          onClick={() => handleToggle(s)}
                        >
                          {s.active ? "Desactivar" : "Reactivar"}
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

      {editing && (
        <div className="modal-backdrop" onClick={() => !saving && setEditing(null)}>
          <form className="modal-card" onClick={(e) => e.stopPropagation()} onSubmit={handleSaveEdit}>
            <h2>Editar sede</h2>
            <label>Nombre</label>
            <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} autoFocus />
            <label>Dirección</label>
            <input type="text" value={editAddress} onChange={(e) => setEditAddress(e.target.value)} />
            <LocationFields
              location={editLocation}
              radius={editRadius}
              onLocation={setEditLocation}
              onRadius={setEditRadius}
            />
            {editError && <div className="error-box">{editError}</div>}
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
    </main>
  );
}
