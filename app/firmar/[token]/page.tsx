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
  dataPolicyFullText: string;
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
  const [returned, setReturned] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [showPolicyModal, setShowPolicyModal] = useState(false);
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [returnReason, setReturnReason] = useState("");
  const [returning, setReturning] = useState(false);
  const [dataConsent, setDataConsent] = useState(false);
  const [signatureConsent, setSignatureConsent] = useState(false);
  const padRef = useRef<SignaturePadHandle | null>(null);
  const consentCardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    load();
    // Si el navegador restaura esta página desde su caché de "atrás/adelante"
    // (bfcache), el estado quedaría congelado con datos viejos (por ejemplo,
    // un documento ya devuelto mostrando todavía el formulario de firma).
    // Forzamos una recarga real de los datos cada vez que eso pasa.
    function onPageShow(e: PageTransitionEvent) {
      if (e.persisted) {
        load();
      }
    }
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/documents/${params.token}`, { cache: "no-store" });
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
      consentCardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setError("");
    setShowModal(true);
  }

  async function handleSign() {
    setError("");
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

  async function handleReturn() {
    if (!returnReason.trim()) {
      setError("Escribe el motivo antes de enviar.");
      return;
    }
    setError("");
    setReturning(true);
    try {
      const res = await fetch(`/api/return/${params.token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: returnReason }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo devolver el documento.");
      setShowReturnModal(false);
      setReturned(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setReturning(false);
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

  if (returned) {
    return (
      <main className="page">
        <h1>Documento devuelto</h1>
        <div className="success-box">
          Devolviste este documento sin firmar. Ya avisamos a quien te lo envió. Gracias por tu
          observación.
        </div>
      </main>
    );
  }

  return (
    <main className="page">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo.jpg" alt="Más Baratas Droguerías" className="brand-logo" />
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
        <div className="card" ref={consentCardRef}>
          <h2>Antes de firmar</h2>
          <label className="consent-check">
            <input
              type="checkbox"
              checked={dataConsent}
              onChange={(e) => setDataConsent(e.target.checked)}
            />
            <span>
              {doc.dataConsentText}{" "}
              <button
                type="button"
                className="link-btn"
                onClick={(e) => {
                  e.preventDefault();
                  setShowPolicyModal(true);
                }}
              >
                Ver política
              </button>
            </span>
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
          <div className="toolbar">
            <button
              type="button"
              className="secondary"
              onClick={() => setShowReturnModal(true)}
            >
              No quiero firmar / Devolver documento
            </button>
          </div>
        </div>
      )}

      {error && !showModal && !showReturnModal && <div className="error-box">{error}</div>}

      {showModal && (
        <div className="modal-backdrop" onClick={() => !submitting && setShowModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h2>Tu firma</h2>
            <p className="hint">Dibuja tu firma con el dedo (celular) o el mouse (computador).</p>
            <SignaturePad onReady={(handle) => (padRef.current = handle)} />
            <div className="toolbar">
              <button
                type="button"
                className="secondary"
                onClick={() => padRef.current?.clear()}
              >
                Borrar
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => setShowModal(false)}
                disabled={submitting}
              >
                Cerrar
              </button>
              <button type="button" onClick={handleSign} disabled={submitting}>
                {submitting ? "Firmando..." : "Firmar y enviar"}
              </button>
            </div>
            {error && <div className="error-box">{error}</div>}
          </div>
        </div>
      )}

      {showPolicyModal && (
        <div className="modal-backdrop" onClick={() => setShowPolicyModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h2>Política de tratamiento de datos</h2>
            <p style={{ whiteSpace: "pre-wrap", fontSize: 14 }}>{doc.dataPolicyFullText}</p>
            <div className="toolbar">
              <button type="button" onClick={() => setShowPolicyModal(false)}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {showReturnModal && (
        <div
          className="modal-backdrop"
          onClick={() => !returning && setShowReturnModal(false)}
        >
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h2>Devolver documento sin firmar</h2>
            <p className="hint">
              Cuéntanos por qué no vas a firmar este documento. Se le avisará a quien te lo
              envió, y este enlace dejará de funcionar.
            </p>
            <label>Motivo</label>
            <textarea
              value={returnReason}
              onChange={(e) => setReturnReason(e.target.value)}
              rows={4}
              style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid #d1d5db" }}
            />
            <div className="toolbar">
              <button
                type="button"
                className="secondary"
                onClick={() => setShowReturnModal(false)}
                disabled={returning}
              >
                Cancelar
              </button>
              <button type="button" onClick={handleReturn} disabled={returning}>
                {returning ? "Enviando..." : "Enviar y devolver"}
              </button>
            </div>
            {error && <div className="error-box">{error}</div>}
          </div>
        </div>
      )}
    </main>
  );
}
