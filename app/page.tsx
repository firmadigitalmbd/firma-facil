"use client";

import { useState, FormEvent } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import type { SignatureBox } from "@/components/PdfSignaturePlacer";

// react-pdf usa el DOM del navegador, así que se carga solo en cliente.
const PdfSignaturePlacer = dynamic(
  () => import("@/components/PdfSignaturePlacer"),
  { ssr: false }
);

export default function HomePage() {
  const [file, setFile] = useState<File | null>(null);
  const [box, setBox] = useState<SignatureBox | null>(null);
  const [name, setName] = useState("");
  const [cedula, setCedula] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successUrl, setSuccessUrl] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    if (!file) {
      setError("Sube un documento en PDF.");
      return;
    }
    if (!box) {
      setError("Coloca el recuadro de la firma sobre el documento.");
      return;
    }
    if (!name || !cedula || !email) {
      setError("Completa el nombre, la cédula y el correo del firmante.");
      return;
    }

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("recipientName", name);
      formData.append("recipientCedula", cedula);
      formData.append("recipientEmail", email);
      formData.append("boxPage", String(box.page));
      formData.append("boxX", String(box.xFrac));
      formData.append("boxY", String(box.yFrac));
      formData.append("boxWidth", String(box.widthFrac));
      formData.append("boxHeight", String(box.heightFrac));

      const res = await fetch("/api/documents", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "No se pudo enviar el documento.");
      }

      setSuccessUrl(data.signUrl);
      setFile(null);
      setBox(null);
      setName("");
      setCedula("");
      setEmail("");
    } catch (err: any) {
      setError(err.message || "Ocurrió un error inesperado.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="page">
      <div className="toolbar" style={{ justifyContent: "space-between" }}>
        <h1>Firma Fácil</h1>
        <Link href="/panel">Ver documentos enviados →</Link>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="card">
          <h2>1. Sube el documento</h2>
          <input
            type="file"
            accept="application/pdf"
            onChange={(e) => {
              const f = e.target.files?.[0] || null;
              setFile(f);
              setBox(null);
            }}
          />
        </div>

        {file && (
          <div className="card">
            <h2>2. Ubica el recuadro de la firma</h2>
            <PdfSignaturePlacer file={file} onChange={setBox} />
          </div>
        )}

        <div className="card">
          <h2>3. Datos de la persona que firma</h2>
          <label>Nombre completo</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ej: María Pérez"
          />
          <label>Cédula</label>
          <input
            type="text"
            value={cedula}
            onChange={(e) => setCedula(e.target.value)}
            placeholder="Ej: 1234567890"
          />
          <label>Correo electrónico</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="correo@ejemplo.com"
          />
        </div>

        {error && <div className="error-box">{error}</div>}
        {successUrl && (
          <div className="success-box">
            Documento enviado correctamente. Enlace de firma:{" "}
            <a href={successUrl} target="_blank" rel="noreferrer">
              {successUrl}
            </a>
          </div>
        )}

        <div className="toolbar">
          <button type="submit" disabled={loading}>
            {loading ? "Enviando..." : "Enviar para firma"}
          </button>
        </div>
      </form>
    </main>
  );
}
