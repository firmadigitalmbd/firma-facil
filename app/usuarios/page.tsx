"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import LogoutButton from "@/components/LogoutButton";
import { Loading } from "@/components/Mascots";

type UserRow = {
  id: string;
  username: string;
  email: string | null;
  role: "admin" | "user";
  active: boolean;
  must_change_password: boolean;
  created_at: string;
};

function generatePassword() {
  const chars = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint32Array(10);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (n) => chars[n % chars.length]).join("");
}

export default function UsuariosPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [currentUserId, setCurrentUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyId, setBusyId] = useState("");

  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<"user" | "admin">("user");
  const [creating, setCreating] = useState(false);

  const [emailUser, setEmailUser] = useState<UserRow | null>(null);
  const [emailValue, setEmailValue] = useState("");
  const [savingEmail, setSavingEmail] = useState(false);
  const [emailError, setEmailError] = useState("");

  const [resetUser, setResetUser] = useState<UserRow | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState("");

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/users", { cache: "no-store" });
      const data = await res.json();
      if (res.status === 403) {
        setForbidden(true);
        return;
      }
      if (!res.ok) throw new Error(data.error || "No se pudo cargar la lista.");
      setUsers(data.users);
      setCurrentUserId(data.currentUserId);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError("");
    setNotice("");
    setCreating(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: newUsername, password: newPassword, role: newRole }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo crear el usuario.");
      setUsers((prev) => [...prev, data.user]);
      setNotice(
        `Usuario "${data.user.username}" creado. Entrégale la contraseña temporal; la cambiará al entrar.`
      );
      setNewUsername("");
      setNewPassword("");
      setNewRole("user");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  }

  async function patchUser(id: string, body: Record<string, unknown>) {
    const res = await fetch(`/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "No se pudo guardar el cambio.");
    setUsers((prev) => prev.map((u) => (u.id === id ? data.user : u)));
  }

  async function handleToggle(user: UserRow, body: Record<string, unknown>, confirmText: string) {
    if (!confirm(confirmText)) return;
    setError("");
    setNotice("");
    setBusyId(user.id);
    try {
      await patchUser(user.id, body);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusyId("");
    }
  }

  async function handleSaveEmail(e: FormEvent) {
    e.preventDefault();
    if (!emailUser) return;
    setEmailError("");
    setSavingEmail(true);
    try {
      await patchUser(emailUser.id, { email: emailValue });
      setNotice(
        emailValue.trim()
          ? `Correo guardado para "${emailUser.username}". Con él podrá recuperar su contraseña por enlace.`
          : `Se quitó el correo de "${emailUser.username}".`
      );
      setEmailUser(null);
    } catch (err: any) {
      setEmailError(err.message);
    } finally {
      setSavingEmail(false);
    }
  }

  async function handleReset(e: FormEvent) {
    e.preventDefault();
    if (!resetUser) return;
    setResetError("");
    setResetting(true);
    try {
      await patchUser(resetUser.id, { newPassword: resetPassword });
      setNotice(
        `Contraseña temporal asignada a "${resetUser.username}". Se cerraron sus sesiones y deberá cambiarla al entrar.`
      );
      setResetUser(null);
      setResetPassword("");
    } catch (err: any) {
      setResetError(err.message);
    } finally {
      setResetting(false);
    }
  }

  if (forbidden) {
    return (
      <main className="page">
        <h1>Usuarios</h1>
        <div className="error-box">Solo la administradora puede gestionar usuarios.</div>
        <div className="bottom-toolbar">
          <Link href="/" className="btn-link secondary">
            Volver
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="page">
      <div className="toolbar" style={{ justifyContent: "space-between" }}>
        <h1>Usuarios</h1>
        <Link href="/" className="btn-link secondary">
          Volver
        </Link>
      </div>
      <p className="module-caption">
        Crea usuarios, inactívalos cuando ya no deban entrar, restablece contraseñas y asigna el
        rol de administradora. Siempre debe quedar al menos una administradora activa.
      </p>

      {!loading &&
        users.some((u) => u.id === currentUserId && u.role === "admin" && !u.email) && (
          <div className="error-box" style={{ background: "#fff7ed", color: "#92400e" }}>
            Aún no tienes un correo registrado. Toca <strong>Correo</strong> en tu fila para
            guardarlo: sin él no podrás recuperar tu contraseña por enlace si la olvidas.
          </div>
        )}
      {error && <div className="error-box">{error}</div>}
      {notice && <div className="success-box">{notice}</div>}

      <form className="card" onSubmit={handleCreate}>
        <h2>Nuevo usuario</h2>
        <label>Nombre de usuario</label>
        <input
          type="text"
          value={newUsername}
          onChange={(e) => setNewUsername(e.target.value)}
          placeholder="Ej: AnaRivera"
          autoComplete="off"
        />
        <p className="hint">Sin espacios. No distingue mayúsculas de minúsculas.</p>
        <label>Contraseña temporal (mínimo 8 caracteres)</label>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            type="text"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="off"
          />
          <button
            type="button"
            className="secondary"
            style={{ whiteSpace: "nowrap" }}
            onClick={() => setNewPassword(generatePassword())}
          >
            Generar
          </button>
        </div>
        <label>Rol</label>
        <select value={newRole} onChange={(e) => setNewRole(e.target.value as "user" | "admin")}>
          <option value="user">Usuario</option>
          <option value="admin">Administradora</option>
        </select>
        <p className="hint">La persona deberá cambiar esta contraseña en su primer ingreso.</p>
        <div className="toolbar" style={{ marginTop: 12 }}>
          <button type="submit" disabled={creating}>
            {creating ? "Creando..." : "Crear usuario"}
          </button>
        </div>
      </form>

      <div className="card">
        <h2>Usuarios registrados</h2>
        {loading ? (
          <Loading />
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Usuario</th>
                  <th>Rol</th>
                  <th>Estado</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const isMe = u.id === currentUserId;
                  const busy = busyId === u.id;
                  return (
                    <tr key={u.id}>
                      <td>
                        {u.username}
                        {isMe && <span className="hint"> (tú)</span>}
                        {u.email && <div className="hint">{u.email}</div>}
                        {u.must_change_password && (
                          <div className="hint">Pendiente de cambiar contraseña</div>
                        )}
                      </td>
                      <td>{u.role === "admin" ? "Administradora" : "Usuario"}</td>
                      <td>
                        <span className={`status-badge ${u.active ? "status-signed" : "status-returned"}`}>
                          {u.active ? "Activo" : "Inactivo"}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          {u.role === "admin" && (
                            <button
                              type="button"
                              className="secondary"
                              style={{ padding: "4px 10px", fontSize: 13 }}
                              disabled={busy}
                              onClick={() => {
                                setEmailUser(u);
                                setEmailValue(u.email || "");
                                setEmailError("");
                              }}
                            >
                              Correo
                            </button>
                          )}
                          {u.active && !isMe && (
                            <button
                              type="button"
                              className="secondary"
                              style={{ padding: "4px 10px", fontSize: 13 }}
                              disabled={busy}
                              onClick={() => {
                                setResetUser(u);
                                setResetPassword("");
                                setResetError("");
                              }}
                            >
                              Restablecer clave
                            </button>
                          )}
                          {u.active && (
                            <button
                              type="button"
                              className="secondary"
                              style={{ padding: "4px 10px", fontSize: 13 }}
                              disabled={busy}
                              onClick={() =>
                                handleToggle(
                                  u,
                                  { role: u.role === "admin" ? "user" : "admin" },
                                  u.role === "admin"
                                    ? `¿Quitar el rol de administradora a ${u.username}?`
                                    : `¿Asignar el rol de administradora a ${u.username}?`
                                )
                              }
                            >
                              {u.role === "admin" ? "Quitar admin" : "Hacer admin"}
                            </button>
                          )}
                          {!isMe && (
                            <button
                              type="button"
                              className={u.active ? "btn-cancel-doc" : "secondary"}
                              style={{ padding: "4px 10px", fontSize: 13 }}
                              disabled={busy}
                              onClick={() =>
                                handleToggle(
                                  u,
                                  { active: !u.active },
                                  u.active
                                    ? `¿Inactivar a ${u.username}? No podrá entrar y se cerrarán sus sesiones.`
                                    : `¿Reactivar a ${u.username}?`
                                )
                              }
                            >
                              {u.active ? "Inactivar" : "Reactivar"}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {emailUser && (
        <div className="modal-backdrop" onClick={() => !savingEmail && setEmailUser(null)}>
          <form className="modal-card" onClick={(e) => e.stopPropagation()} onSubmit={handleSaveEmail}>
            <h2>Correo de {emailUser.username}</h2>
            <p className="hint">
              A este correo se envía el enlace para recuperar la contraseña. Déjalo vacío para
              quitarlo.
            </p>
            <label>Correo electrónico</label>
            <input
              type="text"
              inputMode="email"
              value={emailValue}
              onChange={(e) => setEmailValue(e.target.value)}
              autoComplete="off"
              autoFocus
            />
            {emailError && <div className="error-box">{emailError}</div>}
            <div className="toolbar">
              <button
                type="button"
                className="secondary"
                onClick={() => setEmailUser(null)}
                disabled={savingEmail}
              >
                Cancelar
              </button>
              <button type="submit" disabled={savingEmail}>
                {savingEmail ? "Guardando..." : "Guardar correo"}
              </button>
            </div>
          </form>
        </div>
      )}

      {resetUser && (
        <div className="modal-backdrop" onClick={() => !resetting && setResetUser(null)}>
          <form className="modal-card" onClick={(e) => e.stopPropagation()} onSubmit={handleReset}>
            <h2>Restablecer contraseña</h2>
            <p className="hint">
              Asigna una contraseña temporal para <strong>{resetUser.username}</strong>. Se cerrarán
              sus sesiones abiertas y deberá cambiarla al entrar.
            </p>
            <label>Contraseña temporal (mínimo 8 caracteres)</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="text"
                value={resetPassword}
                onChange={(e) => setResetPassword(e.target.value)}
                autoComplete="off"
                autoFocus
              />
              <button
                type="button"
                className="secondary"
                style={{ whiteSpace: "nowrap" }}
                onClick={() => setResetPassword(generatePassword())}
              >
                Generar
              </button>
            </div>
            {resetError && <div className="error-box">{resetError}</div>}
            <div className="toolbar">
              <button
                type="button"
                className="secondary"
                onClick={() => setResetUser(null)}
                disabled={resetting}
              >
                Cancelar
              </button>
              <button type="submit" disabled={resetting}>
                {resetting ? "Guardando..." : "Asignar contraseña"}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bottom-toolbar">
        <LogoutButton />
      </div>
    </main>
  );
}
