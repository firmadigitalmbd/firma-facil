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
  status: "sent" | "opened" | "signed" | "returned";
  return_reason: string | null;
};

const STATUS_LABEL: Record<DocRow["status"], string> = {
  sent: "Enviado",
  opened: "Abierto",
  signed: "Firmado",
  returned: "Devuelto",
};

export default function PanelPage() {
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState("");

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

  async function handleDelete(id: string) {
    if (!confirm("¿Eliminar este documento? Esta acción no se puede deshacer.")) {
      return;
    }
    setError("");
    setDeletingId(id);
    try {
      const res = await fetch("/api/documents", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo eliminar el documento.");
      setDocs((prev) => prev.filter((d) => d.id !== id));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setDeletingId("");
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
                    {d.status === "returned" && d.return_reason && (
                      <div className="hint" style={{ maxWidth: 220 }}>
                        {d.return_reason}
                      </div>
                    )}
                  </td>
                  <td>{formatDate(d.created_at)}</td>
                  <td>{formatDate(d.opened_at)}</td>
                  <td>{formatDate(d.signed_at)}</td>
                  <td>
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                      {d.status === "signed" && (
                        <>
                          <a
                            href={`/api/admin/download/${d.id}?view=1`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Ver
                          </a>
                          <a href={`/api/admin/download/${d.id}`}>Descargar</a>
                        </>
                      )}
                      {d.status !== "signed" && (
                        <button
                          type="button"
                          className="secondary"
                          style={{ padding: "4px 10px", fontSize: 13 }}
                          disabled={deletingId === d.id}
                          onClick={() => handleDelete(d.id)}
                        >
                          {deletingId === d.id ? "Eliminando..." : "Eliminar"}
                        </button>
                      )}
                    </div>
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
