"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import LogoutButton from "@/components/LogoutButton";

export default function ConfiguracionPage() {
  const [dataConsentText, setDataConsentText] = useState("");
  const [signatureConsentText, setSignatureConsentText] = useState("");
  const [dataPolicyFullText, setDataPolicyFullText] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/legal-texts", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo cargar la configuración.");
      setDataConsentText(data.dataConsentText);
      setSignatureConsentText(data.signatureConsentText);
      setDataPolicyFullText(data.dataPolicyFullText);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    setError("");
    setSaved(false);
    setSaving(true);
    try {
      const res = await fetch("/api/admin/legal-texts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataConsentText, signatureConsentText, dataPolicyFullText }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo guardar.");
      setSaved(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="page">
      <div className="toolbar" style={{ justifyContent: "space-between" }}>
        <h1>Configuración legal</h1>
        <Link href="/" className="btn-link secondary">
          Volver
        </Link>
      </div>
      <p className="module-caption">
        Aquí puedes editar los textos legales (checks y política de datos) que ve el firmante
        antes de firmar, sin tocar Supabase.
      </p>

      <LogoutButton />

      {loading ? (
        <p>Cargando...</p>
      ) : (
        <>
          <div className="card">
            <h2>Casilla de tratamiento de datos</h2>
            <p className="hint">Texto corto que aparece junto al primer check.</p>
            <textarea
              value={dataConsentText}
              onChange={(e) => setDataConsentText(e.target.value)}
              rows={4}
              className="config-textarea"
            />
          </div>

          <div className="card">
            <h2>Política completa de tratamiento de datos</h2>
            <p className="hint">
              Texto largo que se muestra en el modal "Ver política". Recomendado: que lo revise
              un abogado antes de usarlo en producción.
            </p>
            <textarea
              value={dataPolicyFullText}
              onChange={(e) => setDataPolicyFullText(e.target.value)}
              rows={14}
              className="config-textarea"
            />
          </div>

          <div className="card">
            <h2>Casilla de validez de la firma electrónica</h2>
            <p className="hint">Texto corto que aparece junto al segundo check.</p>
            <textarea
              value={signatureConsentText}
              onChange={(e) => setSignatureConsentText(e.target.value)}
              rows={4}
              className="config-textarea"
            />
          </div>

          {error && <div className="error-box">{error}</div>}
          {saved && <div className="success-box">Cambios guardados correctamente.</div>}

          <div className="toolbar">
            <button type="button" onClick={handleSave} disabled={saving}>
              {saving ? "Guardando..." : "Guardar cambios"}
            </button>
          </div>
        </>
      )}
    </main>
  );
}
