"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { SignaturePadHandle } from "@/components/SignaturePad";

const SignaturePad = dynamic(() => import("@/components/SignaturePad"), {
  ssr: false,
});
const PdfSignatureViewer = dynamic(
  () => import("@/components/PdfSignatureViewer"),
  { ssr: false }
);

type DocInfo = {
  originalFilename: string;
  recipientName: string;
  boxPage: number;
  boxX: number;
  boxY: number;
  boxWidth: number;
  boxHeight: number;
  signedAt: string | null;
  status: string;
  dataConsentText: string;
  signatureConsentText: string;
};

export default function FirmarPage({
  params,
}: {
  params: { token: string };
}) {
  const [doc, setDoc] = useState<DocInfo | null>(null);
  const [fileUrl, setFileUrl] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [dataConsent, setDataConsent] = useState(false);
  const [signatureConsent, setSignatureConsent] = useState(false);
  const padRef = useRef<SignaturePadHandle>(null);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/documents/${params.token}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo cargar el documento.");
      setDoc(data.document);
      setFileUrl(data.fileUrl);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function handleBoxClick() {
    if (alreadySigned) return;
    if (!dataConsent || !signatureConsent) {
      setError("Debes aceptar los dos consentimientos antes de firmar.");
      return;
    }
    setError("");
    setShowModal(true);
  }

  async function handleSign() {
    setError("");
    console.log("[debug] padRef.current:", padRef.current);
    console.log("[debug] isEmpty:", padRef.current?.isEmpty());
    if (!padRef.current || padRef.current.isEmpty()) {
      setError("Dibuja tu firma antes de continuar.");
      return;
    }

    setSubmitting(true);
    try {
      const signatureDataUrl = padRef.current.toDataUrl();
      const res = await fetch(`/api/sign/${params.token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          signaturePngBase64: signatureDataUrl,
          dataConsentAccepted: dataConsent,
          signatureConsentAccepted: signatureConsent,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo firmar el documento.");
      if (data.warning) setError(data.warning);
      setShowModal(false);
      setDone(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <main className="page">
        <p>Cargando documento...</p>
      </main>
    );
  }

  if (error && !doc) {
    return (
      <main className="page">
        <div className="error-box">{error}</div>
      </main>
    );
  }

  if (!doc) return null;

  const alreadySigned = !!doc.signedAt || done;

  return (
    <main className="page">
      <h1>Firmar documento</h1>
      <p>
        Hola {doc.recipientName}, revisa el documento <strong>{doc.originalFilename}</strong>.
        {!alreadySigned && " Cuando estés listo, toca el recuadro de firma sobre el documento."}
      </p>

      <div className="card">
        <h2>Documento</h2>
        {fileUrl && (
          <PdfSignatureViewer
            fileUrl={fileUrl}
            boxPage={doc.boxPage}
            boxX={doc.boxX}
            boxY={doc.boxY}
            boxWidth={doc.boxWidth}
            boxHeight={doc.boxHeight}
            boxDisabled={!dataConsent || !signatureConsent}
            boxDone={alreadySigned}
            onBoxClick={handleBoxClick}
          />
        )}
      </div>

      {alreadySigned ? (
        <div className="success-box">
          Este documento ya fue firmado. Se envió una copia por correo a ambas partes. ¡Gracias!
        </div>
      ) : (
        <div className="card">
          <h2>Antes de firmar</h2>
          <label className="consent-check">
            <input
              type="checkbox"
              checked={dataConsent}
              onChange={(e) => setDataConsent(e.target.checked)}
            />
            <span>{doc.dataConsentText}</span>
          </label>
          <label className="consent-check">
            <input
              type="checkbox"
              checked={signatureConsent}
              onChange={(e) => setSignatureConsent(e.target.checked)}
            />
            <span>{doc.signatureConsentText}</span>
          </label>
          <p className="hint">
            Marca los dos casilleros y luego toca el recuadro de firma sobre el documento.
          </p>
        </div>
      )}

      {error && !showModal && <div className="error-box">{error}</div>}

      {showModal && (
        <div className="modal-backdrop" onClick={() => !submitting && setShowModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h2>Tu firma</h2>
            <p className="hint">Dibuja tu firma con el dedo (celular) o el mouse (computador).</p>
            <SignaturePad ref={padRef} />
            <div className="toolbar">
              <button
                type="button"
                className="secondary"
                onClick={() => padRef.current?.clear()}
              >
                Borrar
              </button>
              <button type="button" onClick={handleSign} disabled={submitting}>
                {submitting ? "Firmando..." : "Firmar y enviar"}
              </button>
            </div>
            {error && <div className="error-box">{error}</div>}
          </div>
        </div>
      )}
    </main>
  );
}
