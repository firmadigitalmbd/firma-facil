import type { Metadata } from "next";

// Permite "Agregar a la pantalla de inicio" en el celular. En iPhone es
// obligatorio para recibir los avisos de verificación.
export const metadata: Metadata = {
  title: "Registro de asistencia",
  manifest: "/marcar.webmanifest",
  appleWebApp: { capable: true, title: "Asistencia", statusBarStyle: "default" },
  icons: { apple: "/logo.jpg" },
};

export default function MarcarLayout({ children }: { children: React.ReactNode }) {
  return children;
}
