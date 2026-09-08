"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type DocRow = {
  id: string;
  created_at: string;
  original_filename: string;
  recipient_name: string;
  recipient_email: string;
  token: string;
  opened_at: string | null;
  signed_at: string | null;
  status: "sent" | "opened" | "signed";
};

const STATUS_LABEL: Record<DocRow["status"], string> = {
  sent: "Enviado",
  opened: "Abierto",
  signed: "Firmado",
};

export default function PanelPage() {
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/documents");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo cargar la lista.");
      setDocs(data.documents);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="page">
      <div className="toolbar" style={{ justifyContent: "space-between" }}>
        <h1>Documentos enviados</h1>
        <Link href="/">← Enviar nuevo documento</Link>
      </div>

      {error && <div className="error-box">{error}</div>}

      <div className="card">
        {loading ? (
          <p>Cargando...</p>
        ) : docs.length === 0 ? (
          <p>Todavía no has enviado ningún documento.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Documento</th>
                <th>Firmante</th>
                <th>Estado</th>
                <th>Enviado</th>
                <th>Abierto</th>
                <th>Firmado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {docs.map((d) => (
                <tr key={d.id}>
                  <td>{d.original_filename}</td>
                  <td>
                    {d.recipient_name}
                    <br />
                    <span className="hint">{d.recipient_email}</span>
                  </td>
                  <td>
                    <span className={`status-badge status-${d.status}`}>
                      {STATUS_LABEL[d.status]}
                    </span>
                  </td>
                  <td>{formatDate(d.created_at)}</td>
                  <td>{formatDate(d.opened_at)}</td>
                  <td>{formatDate(d.signed_at)}</td>
                  <td>
                    <a
                      href={`/firmar/${d.token}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Ver enlace
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
}

function formatDate(value: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  return d.toLocaleString("es-CO", {
    dateStyle: "short",
    timeStyle: "short",
  });
}
