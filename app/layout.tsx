import "./globals.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "Más Baratas Droguerías - Firma de documentos",
  description: "Firma electrónica de documentos de Más Baratas Droguerías",
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
