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
  signed_at: string | null;
  status: "sent" | "opened" | "signed" | "returned";
};

const PAGE_SIZE = 10;

export default function DocumentosFirmadosPage() {
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());

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

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllOnPage() {
    const allSelected = pageDocs.every((d) => selected.has(d.id));
    setSelected((prev) => {
      const next = new Set(prev);
      pageDocs.forEach((d) => (allSelected ? next.delete(d.id) : next.add(d.id)));
      return next;
    });
  }

  async function handleBulkDelete() {
    if (selected.size === 0) return;
    if (
      !confirm(
        `¿Eliminar ${selected.size} documento(s) firmado(s)? Esta acción no se puede deshacer y borra tanto el registro como los archivos.`
      )
    ) {
      return;
    }
    setError("");
    setDeleting(true);
    try {
      const res = await fetch("/api/documents", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selected), allowSigned: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo eliminar.");
      setDocs((prev) => prev.filter((d) => !selected.has(d.id)));
      setSelected(new Set());
    } catch (err: any) {
      setError(err.message);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <main className="page">
      <div className="toolbar" style={{ justifyContent: "space-between" }}>
        <h1>Documentos firmados</h1>
        <Link href="/" className="btn-link secondary">
          Volver
        </Link>
      </div>
      <p className="module-caption">
        Aquí puedes borrar documentos ya firmados para liberar espacio de almacenamiento. Al
        borrarlos se elimina el registro y los archivos (original y firmado) de forma
        permanente.
      </p>

      <LogoutButton />

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
          <p>Todavía no hay documentos firmados.</p>
        ) : filteredDocs.length === 0 ? (
          <p>No se encontraron documentos que coincidan con la búsqueda.</p>
        ) : (
          <>
            <div className="toolbar" style={{ justifyContent: "space-between" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 400 }}>
                <input
                  type="checkbox"
                  checked={pageDocs.length > 0 && pageDocs.every((d) => selected.has(d.id))}
                  onChange={toggleAllOnPage}
                />
                Seleccionar todos en esta página
              </label>
              <button
                type="button"
                disabled={selected.size === 0 || deleting}
                onClick={handleBulkDelete}
              >
                {deleting
                  ? "Eliminando..."
                  : `Borrar seleccionados (${selected.size})`}
              </button>
            </div>

            <table>
              <thead>
                <tr>
                  <th></th>
                  <th>Documento</th>
                  <th>Firmante</th>
                  <th>Firmado</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {pageDocs.map((d) => (
                  <tr key={d.id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selected.has(d.id)}
                        onChange={() => toggle(d.id)}
                      />
                    </td>
                    <td>{d.original_filename}</td>
                    <td>
                      {d.recipient_name}
                      <br />
                      <span className="hint">
                        CC {d.recipient_cedula} · {d.recipient_email}
                      </span>
                    </td>
                    <td>{formatDate(d.signed_at)}</td>
                    <td>
                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                        <a href={`/api/admin/download/${d.id}?view=1`} target="_blank" rel="noreferrer">
                          Ver
                        </a>
                        <a href={`/api/admin/download/${d.id}`}>Descargar</a>
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
