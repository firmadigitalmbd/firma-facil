import "./globals.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "Firma Fácil",
  description: "Envía documentos para firma electrónica de forma sencilla",
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
