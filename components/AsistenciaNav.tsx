"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/asistencia", label: "Registros" },
  { href: "/asistencia/empleados", label: "Empleados" },
  { href: "/asistencia/sedes", label: "Sedes" },
  { href: "/asistencia/reportes", label: "Reportes" },
  { href: "/asistencia/reglas", label: "Reglas" },
];

export default function AsistenciaNav() {
  const pathname = usePathname();
  return (
    <div className="hub-buttons" style={{ marginTop: 0, marginBottom: 16 }}>
      {TABS.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={`btn-link${pathname === t.href ? "" : " secondary"}`}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
