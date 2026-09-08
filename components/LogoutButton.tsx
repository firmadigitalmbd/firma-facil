"use client";

export default function LogoutButton() {
  async function handleLogout() {
    await fetch("/api/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <button type="button" className="secondary logout-fab" onClick={handleLogout}>
      Cerrar sesión
    </button>
  );
}
