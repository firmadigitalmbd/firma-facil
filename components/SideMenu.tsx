"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Crear" },
  { href: "/panel/firmados", label: "Firmados" },
  { href: "/panel", label: "Ver todos" },
  { href: "/informes", label: "Informes" },
  { href: "/configuracion", label: "Configuración" },
];

export default function SideMenu() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/whoami", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => setUsername(data.username))
      .catch(() => setUsername(null));
  }, []);

  if (pathname === "/login" || pathname.startsWith("/firmar")) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        className="hamburger-btn"
        onClick={() => setOpen(true)}
        aria-label="Abrir menú"
      >
        <span />
        <span />
        <span />
      </button>

      {username && <div className="user-badge">Hola, {username}</div>}

      {open && <div className="side-menu-backdrop" onClick={() => setOpen(false)} />}

      <nav className={`side-menu${open ? " side-menu-open" : ""}`}>
        <div className="side-menu-header">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.jpg" alt="Más Baratas Droguerías" className="side-menu-logo" />
          <button
            type="button"
            className="side-menu-close"
            onClick={() => setOpen(false)}
            aria-label="Cerrar menú"
          >
            ✕
          </button>
        </div>

        {username && <div className="side-menu-user">Sesión iniciada como {username}</div>}

        {LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={`side-menu-link${pathname === link.href ? " side-menu-link-active" : ""}`}
            onClick={() => setOpen(false)}
          >
            {link.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
