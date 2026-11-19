"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

type Site = { id: string; name: string };
type Lookup = {
  fullName: string;
  sites: Site[];
  nextKind: "in" | "out";
  verify: { available: boolean; availableAt: string; done: boolean } | null;
  needsConsent: boolean;
  consentText: string | null;
};
type Step = "cedula" | "capture" | "done";

const PHOTO_WIDTH = 480;
const PHOTO_QUALITY = 0.6;

type Kind = "in" | "out" | "verify";

function kindLabel(kind: Kind) {
  return kind === "in" ? "ENTRADA" : kind === "out" ? "SALIDA" : "VERIFICACIÓN";
}

export default function MarcarPage() {
  const [step, setStep] = useState<Step>("cedula");
  const [cedula, setCedula] = useState("");
  const [pin, setPin] = useState("");
  const [info, setInfo] = useState<Lookup | null>(null);
  const [siteId, setSiteId] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [photo, setPhoto] = useState<string | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [coords, setCoords] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [gpsStatus, setGpsStatus] = useState<"idle" | "waiting" | "ok" | "error">("idle");

  const [action, setAction] = useState<"auto" | "verify">("auto");
  const [result, setResult] = useState<{
    kind: Kind;
    fullName: string;
    siteName: string;
    recordedAt: string;
    outOfRange?: boolean;
    verifyAt?: string | null;
    pushKey?: string | null;
  } | null>(null);
  const [pushState, setPushState] = useState<"idle" | "working" | "done" | "error" | "ios">("idle");
  const [pushError, setPushError] = useState("");

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraReady(false);
  }, []);

  useEffect(() => stopCamera, [stopCamera]);

  // Solo cámara en vivo: no hay selector de archivos ni galería.
  async function startCamera() {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 640 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraReady(true);
    } catch {
      setError("No se pudo abrir la cámara. Permite el acceso a la cámara en tu navegador e inténtalo de nuevo.");
    }
  }

  function requestLocation() {
    if (!navigator.geolocation) {
      setGpsStatus("error");
      return;
    }
    setGpsStatus("waiting");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy });
        setGpsStatus("ok");
      },
      () => setGpsStatus("error"),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
  }

  async function handleLookup(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/marcar/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cedula, pin }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo validar la cédula.");
      setInfo(data);
      setSiteId(data.sites.length === 1 ? data.sites[0].id : "");
    } catch (err: any) {
      setInfo(null);
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function goToCapture(act: "auto" | "verify" = "auto") {
    if (!info) return;
    setAction(act);
    if (!siteId) return setError("Elige la sede donde estás.");
    if (info.needsConsent && !consent) return setError("Debes aceptar la autorización de datos personales.");
    setError("");
    setPhoto(null);
    setCoords(null);
    setStep("capture");
    requestLocation();
    void startCamera();
  }

  function takePhoto() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const scale = PHOTO_WIDTH / video.videoWidth;
    const canvas = document.createElement("canvas");
    canvas.width = PHOTO_WIDTH;
    canvas.height = Math.round(video.videoHeight * scale);
    canvas.getContext("2d")!.drawImage(video, 0, 0, canvas.width, canvas.height);
    setPhoto(canvas.toDataURL("image/jpeg", PHOTO_QUALITY));
  }

  async function handleSubmit() {
    if (!photo || !coords || !info) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/marcar/registrar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cedula,
          pin,
          action,
          siteId,
          photo,
          lat: coords.lat,
          lng: coords.lng,
          accuracy: coords.accuracy,
          acceptConsent: info.needsConsent ? consent : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo guardar el registro.");
      stopCamera();
      setResult(data);
      setStep("done");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  // Pide permiso de notificaciones y lo guarda para avisarle cuando le toque
  // la verificación. En iPhone solo funciona desde la pantalla de inicio.
  async function enablePush() {
    if (!result?.pushKey) return;
    setPushError("");
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches || (navigator as any).standalone === true;
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      setPushState(ios && !standalone ? "ios" : "error");
      if (!(ios && !standalone)) setPushError("Este navegador no permite avisos. Prueba con Chrome.");
      return;
    }
    setPushState("working");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") throw new Error("No diste permiso para los avisos.");
      await navigator.serviceWorker.register("/marcar-sw.js", { scope: "/marcar" });
      const reg = await navigator.serviceWorker.ready;
      const key = result.pushKey.replace(/-/g, "+").replace(/_/g, "/");
      const raw = atob(key + "=".repeat((4 - (key.length % 4)) % 4));
      const sub =
        (await reg.pushManager.getSubscription()) ||
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: Uint8Array.from(raw, (c) => c.charCodeAt(0)),
        }));
      const res = await fetch("/api/marcar/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cedula, pin, subscription: sub.toJSON() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo activar el aviso.");
      setPushState("done");
    } catch (err: any) {
      setPushState("error");
      setPushError(err.message || "No se pudo activar el aviso.");
    }
  }

  function reset() {
    stopCamera();
    setPushState("idle");
    setPushError("");
    setStep("cedula");
    setCedula("");
    setPin("");
    setInfo(null);
    setSiteId("");
    setConsent(false);
    setPhoto(null);
    setCoords(null);
    setGpsStatus("idle");
    setResult(null);
    setAction("auto");
    setError("");
  }

  return (
    <main className="page" style={{ maxWidth: 480, paddingTop: 24 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo.jpg" alt="Más Baratas Droguerías" className="brand-logo" style={{ maxWidth: 180 }} />
      <h1>Registro de asistencia</h1>

      {step === "cedula" && (
        <div className="card">
          {!info ? (
            <form onSubmit={handleLookup}>
              <label style={{ marginTop: 0 }}>Tu número de cédula</label>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="off"
                value={cedula}
                onChange={(e) => setCedula(e.target.value)}
                autoFocus
              />
              <label>Tu PIN (4 números)</label>
              <input
                type="password"
                inputMode="numeric"
                autoComplete="off"
                maxLength={4}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
              />
              {error && <div className="error-box">{error}</div>}
              <div className="toolbar">
                <button type="submit" disabled={busy || cedula.trim().length < 5 || pin.length !== 4}>
                  {busy ? "Validando..." : "Continuar"}
                </button>
              </div>
            </form>
          ) : (
            <>
              <p style={{ marginTop: 0 }}>
                Hola, <strong>{info.fullName}</strong>. Vas a registrar tu{" "}
                <strong>{kindLabel(info.nextKind)}</strong>.
              </p>
              <label>¿En qué sede estás?</label>
              <select value={siteId} onChange={(e) => setSiteId(e.target.value)}>
                <option value="">Elige la sede</option>
                {info.sites.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>

              {info.needsConsent && (
                <div style={{ marginTop: 14 }}>
                  <div
                    style={{
                      maxHeight: 160,
                      overflowY: "auto",
                      fontSize: 13,
                      background: "#f9fafb",
                      border: "1px solid #e5e7eb",
                      borderRadius: 8,
                      padding: 10,
                    }}
                  >
                    {info.consentText}
                  </div>
                  <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontWeight: 400 }}>
                    <input
                      type="checkbox"
                      style={{ width: "auto", marginTop: 3 }}
                      checked={consent}
                      onChange={(e) => setConsent(e.target.checked)}
                    />
                    He leído y acepto el tratamiento de mis datos personales.
                  </label>
                </div>
              )}

              {info.verify && (
                <div className="hint" style={{ marginTop: 12 }}>
                  {info.verify.done
                    ? "Ya hiciste la verificación de este turno."
                    : info.verify.available
                    ? "Tienes una verificación pendiente en este turno."
                    : `La verificación estará disponible desde las ${new Date(info.verify.availableAt).toLocaleTimeString("es-CO", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit" })}.`}
                </div>
              )}
              {info.verify && !info.verify.done && (
                <div className="toolbar" style={{ marginTop: 8 }}>
                  <button
                    type="button"
                    className="secondary"
                    disabled={!info.verify.available}
                    onClick={() => goToCapture("verify")}
                  >
                    Registrar verificación
                  </button>
                </div>
              )}
              {error && <div className="error-box">{error}</div>}
              <div className="toolbar">
                <button type="button" className="secondary" onClick={reset}>
                  No soy yo
                </button>
                <button type="button" onClick={() => goToCapture("auto")}>
                  Registrar {kindLabel(info.nextKind).toLowerCase()}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {step === "capture" && info && (
        <div className="card">
          <p style={{ marginTop: 0 }}>
            <strong>{info.fullName}</strong> · {kindLabel(action === "verify" ? "verify" : info.nextKind)} ·{" "}
            {info.sites.find((s) => s.id === siteId)?.name}
          </p>

          <div style={{ position: "relative", background: "#000", borderRadius: 12, overflow: "hidden" }}>
            <video
              ref={videoRef}
              playsInline
              muted
              style={{ width: "100%", display: photo ? "none" : "block", transform: "scaleX(-1)" }}
            />
            {photo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photo} alt="Tu foto" style={{ width: "100%", display: "block", transform: "scaleX(-1)" }} />
            )}
          </div>

          <p className="hint">
            {gpsStatus === "waiting" && "Obteniendo tu ubicación..."}
            {gpsStatus === "ok" && coords && `Ubicación lista (±${Math.round(coords.accuracy)} m).`}
            {gpsStatus === "error" && "No se pudo obtener la ubicación. Activa el GPS y permite el acceso."}
          </p>
          {gpsStatus === "error" && (
            <button type="button" className="secondary" onClick={requestLocation}>
              Reintentar ubicación
            </button>
          )}

          {error && <div className="error-box">{error}</div>}

          <div className="toolbar">
            <button type="button" className="secondary" onClick={reset} disabled={busy}>
              Cancelar
            </button>
            {!photo ? (
              cameraReady ? (
                <button type="button" onClick={takePhoto}>
                  Capturar foto
                </button>
              ) : (
                <button type="button" onClick={startCamera}>
                  Abrir cámara
                </button>
              )
            ) : (
              <>
                <button type="button" className="secondary" onClick={() => setPhoto(null)} disabled={busy}>
                  Repetir
                </button>
                <button type="button" onClick={handleSubmit} disabled={busy || gpsStatus !== "ok"}>
                  {busy ? "Guardando..." : `Registrar ${kindLabel(action === "verify" ? "verify" : info.nextKind).toLowerCase()}`}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {step === "done" && result && (
        <div className="card">
          <div className="success-box" style={{ marginTop: 0 }}>
            <strong>{kindLabel(result.kind)} registrada</strong>
            <div>{result.fullName}</div>
            <div>{result.siteName}</div>
            <div>
              {new Date(result.recordedAt).toLocaleString("es-CO", {
                timeZone: "America/Bogota",
                dateStyle: "short",
                timeStyle: "medium",
              })}
            </div>
          </div>
          {result.outOfRange && (
            <p className="hint">
              Tu ubicación quedó lejos de la sede. Si estabas en la sede, avísale a la administradora.
            </p>
          )}
          {result.verifyAt && (
            <div style={{ marginTop: 12 }}>
              <p style={{ marginBottom: 6 }}>
                Hoy debes registrar una verificación desde las{" "}
                <strong>
                  {new Date(result.verifyAt).toLocaleTimeString("es-CO", {
                    timeZone: "America/Bogota",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </strong>
                .
              </p>
              {result.pushKey && pushState !== "done" && pushState !== "ios" && (
                <button type="button" className="secondary" onClick={enablePush} disabled={pushState === "working"}>
                  {pushState === "working" ? "Activando..." : "Avisarme al celular"}
                </button>
              )}
              {pushState === "done" && (
                <div className="success-box">Listo. Te llegará un aviso cuando toque la verificación.</div>
              )}
              {pushState === "ios" && (
                <div className="hint">
                  En iPhone, primero agrega esta página a la pantalla de inicio (botón Compartir → “Agregar a
                  inicio”), ábrela desde allí y vuelve a tocar “Avisarme al celular” en tu próxima entrada.
                </div>
              )}
              {pushState === "error" && pushError && <div className="error-box">{pushError}</div>}
            </div>
          )}
          <div className="toolbar">
            <button type="button" onClick={reset}>
              Listo
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
