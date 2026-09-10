"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import LogoutButton from "@/components/LogoutButton";

type DocRow = {
  id: string;
  created_at: string;
  original_filename: string;
  recipient_name: string;
  recipient_cedula: string;
  recipient_email: string;
  token: string;
  opened_at: string | null;
  signed_at: string | null;
  status: "sent" | "opened" | "signed" | "returned" | "cancelled";
  return_reason: string | null;
  expires_at: string | null;
};

function isExpired(d: DocRow) {
  return (
    (d.status === "sent" || d.status === "opened") &&
    !!d.expires_at &&
    new Date(d.expires_at) < new Date()
  );
}

const STATUS_LABEL: Record<DocRow["status"], string> = {
  sent: "Enviado",
  opened: "Abierto",
  signed: "Firmado",
  returned: "Devuelto",
  cancelled: "Cancelado",
};

const PAGE_SIZE = 10;

type StorageUsage = { usedBytes: number; limitBytes: number; percent: number };

export default function PanelPage() {
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState("");
  const [cancelingId, setCancelingId] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [storage, setStorage] = useState<StorageUsage | null>(null);

  useEffect(() => {
    load();
    loadStorage();
  }, []);

  async function loadStorage() {
    try {
      const res = await fetch("/api/admin/storage-usage", { cache: "no-store" });
      const data = await res.json();
      if (res.ok) setStorage(data);
    } catch {
      // El indicador de espacio es informativo; si falla, no bloquea la página.
    }
  }

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
        body: JSON.stringify({ ids: [id] }),
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

  async function handleCancel(id: string) {
    if (
      !confirm(
        "¿Cancelar este documento? El enlace que se envió por correo dejará de funcionar."
      )
    ) {
      return;
    }
    setError("");
    setCancelingId(id);
    try {
      const res = await fetch(`/api/admin/cancel/${id}`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo cancelar el documento.");
      setDocs((prev) =>
        prev.map((d) => (d.id === id ? { ...d, status: "cancelled" } : d))
      );
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCancelingId("");
    }
  }

  const filteredDocs = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return docs;
    return docs.filter((d) =>
      [d.original_filename, d.recipient_name, d.recipient_cedula, d.recipient_email]
        .filter(Boolean)
        .some((field) => field.toLowerCase().includes(q))
    );
  }, [docs, search]);

  const totalPages = Math.max(1, Math.ceil(filteredDocs.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageDocs = filteredDocs.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );

  return (
    <main className="page">
      <div className="toolbar" style={{ justifyContent: "space-between" }}>
        <h1>Documentos enviados</h1>
        <Link href="/" className="btn-link secondary">
          Volver
        </Link>
      </div>
      <p className="module-caption">
        Aquí puedes ver el estado de todos los documentos que has enviado para firma.
      </p>

      {storage && (
        <div className="card">
          <div className="toolbar" style={{ justifyContent: "space-between" }}>
            <strong>Espacio usado en Supabase Storage</strong>
            <span>
              {formatMB(storage.usedBytes)} MB de {formatMB(storage.limitBytes)} MB (
              {storage.percent}%)
            </span>
          </div>
          <div className="storage-bar">
            <div
              className={`storage-bar-fill${storage.percent >= 90 ? " storage-bar-danger" : ""}`}
              style={{ width: `${storage.percent}%` }}
            />
          </div>
          {storage.percent >= 90 && (
            <div className="toolbar">
              <span className="hint" style={{ marginTop: 0 }}>
                Te estás quedando sin espacio.
              </span>
              <Link href="/panel/firmados" className="btn-link">
                Liberar espacio →
              </Link>
            </div>
          )}
        </div>
      )}

      {error && <div className="error-box">{error}</div>}

      <div className="card">
        <form
          onSubmit={(e) => e.preventDefault()}
          style={{ display: "flex", gap: 10, marginBottom: 16 }}
        >
          <input
            type="text"
            placeholder="Buscar por documento, nombre, cédula o correo..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
          <button type="submit">Buscar</button>
        </form>

        {loading ? (
          <p>Cargando...</p>
        ) : docs.length === 0 ? (
          <p>Todavía no has enviado ningún documento.</p>
        ) : filteredDocs.length === 0 ? (
          <p>No se encontraron documentos que coincidan con la búsqueda.</p>
        ) : (
          <>
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
                {pageDocs.map((d) => (
                  <tr key={d.id}>
                    <td>{d.original_filename}</td>
                    <td>
                      {d.recipient_name}
                      <br />
                      <span className="hint">
                        CC {d.recipient_cedula} · {d.recipient_email}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`status-badge status-${
                          isExpired(d) ? "expired" : d.status
                        }`}
                      >
                        {isExpired(d) ? "Vencido" : STATUS_LABEL[d.status]}
                      </span>
                      {d.status === "returned" && d.return_reason && (
                        <div className="hint" style={{ maxWidth: 220 }}>
                          {d.return_reason}
                        </div>
                      )}
                      {!isExpired(d) &&
                        d.expires_at &&
                        (d.status === "sent" || d.status === "opened") && (
                          <div className="hint" style={{ maxWidth: 220 }}>
                            Vence: {formatDate(d.expires_at)}
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
                        {(d.status === "sent" || d.status === "opened") && !isExpired(d) && (
                          <button
                            type="button"
                            className="btn-cancel-doc"
                            disabled={cancelingId === d.id}
                            onClick={() => handleCancel(d.id)}
                          >
                            {cancelingId === d.id ? "Cancelando..." : "Cancelar doc."}
                          </button>
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

            {totalPages > 1 && (
              <div className="toolbar">
                <button
                  type="button"
                  className="secondary"
                  disabled={currentPage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  ← Anterior
                </button>
                <span>
                  Página {currentPage} de {totalPages}
                </span>
                <button
                  type="button"
                  className="secondary"
                  disabled={currentPage >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Siguiente →
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <div className="bottom-toolbar">
        <LogoutButton />
      </div>
    </main>
  );
}

function formatMB(bytes: number) {
  return Math.round(bytes / (1024 * 1024));
}

function formatDate(value: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  return d.toLocaleString("es-CO", {
    dateStyle: "short",
    timeStyle: "short",
  });
}
