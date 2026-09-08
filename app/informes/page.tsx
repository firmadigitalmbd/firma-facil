"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import LogoutButton from "@/components/LogoutButton";

type DocRow = {
  id: string;
  original_filename: string;
  recipient_name: string;
  recipient_cedula: string;
  recipient_email: string;
  created_at: string;
  signed_at: string | null;
  status: string;
};

export default function InformesPage() {
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/documents", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo cargar la lista.");
      setDocs((data.documents as DocRow[]).filter((d) => d.status === "signed"));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const filtered = useMemo(() => {
    return docs.filter((d) => {
      if (!d.signed_at) return false;
      const signedDate = d.signed_at.slice(0, 10);
      if (from && signedDate < from) return false;
      if (to && signedDate > to) return false;
      return true;
    });
  }, [docs, from, to]);

  const exportUrl = `/api/admin/reports/export?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;

  return (
    <main className="page">
      <div className="toolbar" style={{ justifyContent: "space-between" }}>
        <h1>Informes</h1>
        <Link href="/" className="btn-link secondary">
          Volver
        </Link>
      </div>
      <p className="module-caption">
        Filtra los documentos firmados por rango de fechas y descárgalos como Excel.
      </p>

      {error && <div className="error-box">{error}</div>}

      <div className="card">
        <div className="toolbar">
          <div>
            <label>Desde</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label>Hasta</label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>

        <div className="toolbar">
          <a href={exportUrl} className="btn-link">
            Descargar Excel
          </a>
          {(from || to) && (
            <button
              type="button"
              className="secondary"
              onClick={() => {
                setFrom("");
                setTo("");
              }}
            >
              Limpiar filtro
            </button>
          )}
        </div>

        {loading ? (
          <p>Cargando...</p>
        ) : filtered.length === 0 ? (
          <p style={{ marginTop: 16 }}>No hay documentos firmados en ese rango.</p>
        ) : (
          <table style={{ marginTop: 16 }}>
            <thead>
              <tr>
                <th>Documento</th>
                <th>Firmante</th>
                <th>Cédula</th>
                <th>Fecha de firma</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((d) => (
                <tr key={d.id}>
                  <td>{d.original_filename}</td>
                  <td>{d.recipient_name}</td>
                  <td>{d.recipient_cedula}</td>
                  <td>{formatDate(d.signed_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="bottom-toolbar">
        <LogoutButton />
      </div>
    </main>
  );
}

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" });
}
