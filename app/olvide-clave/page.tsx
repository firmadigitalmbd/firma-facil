"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { MascotRow } from "@/components/Mascots";

export default function OlvideClavePage() {
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);
    try {
      const res = await fetch("/api/password/forgot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo enviar la solicitud.");
      setMessage(data.message);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-page">
      <div className="login-stack">
        <div className="login-card">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.jpg" alt="Más Baratas Droguerías" className="login-logo" />
          <h1>Recuperar contraseña</h1>
          <p className="hint">
            Solo para la administradora. Escribe tu usuario y te enviamos un enlace al correo
            registrado.
          </p>
          <form onSubmit={handleSubmit}>
            <label>Usuario</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
              autoComplete="username"
            />
            {error && <div className="error-box">{error}</div>}
            {message && <div className="success-box">{message}</div>}
            <button type="submit" disabled={loading} style={{ width: "100%", marginTop: 20 }}>
              {loading ? "Enviando..." : "Enviar enlace"}
            </button>
            <p style={{ textAlign: "center", marginTop: 14, fontSize: 14 }}>
              <Link href="/login">Volver a iniciar sesión</Link>
            </p>
          </form>
        </div>
        <MascotRow kinds={["bottle", "bandage", "syringe"]} size={58} />
      </div>
    </main>
  );
}
