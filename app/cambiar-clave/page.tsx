"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import LogoutButton from "@/components/LogoutButton";

export default function CambiarClavePage() {
  const [mustChange, setMustChange] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/whoami", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => setMustChange(!!data.mustChangePassword))
      .catch(() => {});
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSaved(false);
    if (newPassword !== confirmPassword) {
      setError("La confirmación no coincide con la contraseña nueva.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/account/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo cambiar la contraseña.");
      if (mustChange) {
        window.location.href = "/";
        return;
      }
      setSaved(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const inputType = showPasswords ? "text" : "password";

  return (
    <main className="page">
      <div className="toolbar" style={{ justifyContent: "space-between" }}>
        <h1>Cambiar contraseña</h1>
        {!mustChange && (
          <Link href="/" className="btn-link secondary">
            Volver
          </Link>
        )}
      </div>

      {mustChange && (
        <div className="error-box" style={{ marginTop: 0, marginBottom: 12 }}>
          Por seguridad debes definir una contraseña nueva antes de continuar.
        </div>
      )}

      <form className="card" onSubmit={handleSubmit}>
        <label>Contraseña actual</label>
        <input
          type={inputType}
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          autoComplete="current-password"
        />
        <label>Contraseña nueva (mínimo 8 caracteres)</label>
        <input
          type={inputType}
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          autoComplete="new-password"
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
        {saved && (
          <div className="success-box">
            Contraseña actualizada. Se cerraron tus otras sesiones abiertas.
          </div>
        )}

        <div className="toolbar" style={{ marginTop: 16 }}>
          <button type="submit" disabled={saving}>
            {saving ? "Guardando..." : "Guardar contraseña"}
          </button>
        </div>
      </form>

      <div className="bottom-toolbar">
        <LogoutButton />
      </div>
    </main>
  );
}
