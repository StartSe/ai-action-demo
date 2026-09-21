import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Mapify · Conecte suas ideias",
  description:
    "Transforme vídeos, PDFs e páginas em mapas mentais interativos com IA.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
