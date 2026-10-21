"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { Loading, Mascot, MascotRow } from "@/components/Mascots";

export default function RestablecerPage({ params }: { params: { token: string } }) {
  const [checking, setChecking] = useState(true);
  const [valid, setValid] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    fetch(`/api/password/reset?token=${encodeURIComponent(params.token)}`, { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => setValid(!!data.valid))
      .catch(() => setValid(false))
      .finally(() => setChecking(false));
  }, [params.token]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (newPassword !== confirmPassword) {
      setError("La confirmación no coincide con la contraseña nueva.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/password/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: params.token, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo cambiar la contraseña.");
      setDone(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const inputType = showPasswords ? "text" : "password";

  return (
    <main className="login-page">
      <div className="login-stack">
        <div className="login-card">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.jpg" alt="Más Baratas Droguerías" className="login-logo" />
          <h1>Contraseña nueva</h1>

          {checking ? (
            <Loading>Verificando enlace...</Loading>
          ) : done ? (
            <>
              <Mascot kind="cross" size={96} motion="bounce" />
              <div className="success-box">
                Listo, tu contraseña quedó actualizada. Ya puedes iniciar sesión.
              </div>
              <p style={{ marginTop: 16 }}>
                <Link href="/login" className="btn-link">
                  Ir a iniciar sesión
                </Link>
              </p>
            </>
          ) : !valid ? (
            <>
              <Mascot kind="thermometer" size={96} mood="sad" motion="sway" />
              <div className="error-box">
                Este enlace no es válido o ya venció. Pide uno nuevo desde
                &quot;¿Olvidaste tu contraseña?&quot;.
              </div>
              <p style={{ marginTop: 16 }}>
                <Link href="/olvide-clave">Pedir un enlace nuevo</Link>
              </p>
            </>
          ) : (
            <form onSubmit={handleSubmit}>
              <label>Contraseña nueva (mínimo 8 caracteres)</label>
              <input
                type={inputType}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                autoFocus
              />
              <label>Confirmar contraseña nueva</label>
              <input
                type={inputType}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
              />
              <label className="consent-check">
                <input
                  type="checkbox"
                  checked={showPasswords}
                  onChange={(e) => setShowPasswords(e.target.checked)}
                />
                <span>Mostrar contraseñas</span>
              </label>
              {error && <div className="error-box">{error}</div>}
              <button type="submit" disabled={saving} style={{ width: "100%", marginTop: 20 }}>
                {saving ? "Guardando..." : "Guardar contraseña"}
              </button>
            </form>
          )}
        </div>
        <MascotRow kinds={["capsule", "bottle", "bandage"]} size={58} />
      </div>
    </main>
  );
}
