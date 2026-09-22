import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Cowork Jev · IA para Executivos",
  description: "Seu estrategista para criar predições baseadas em dados. Explore cenários financeiros com premissas visíveis, cálculos verificáveis e decisões auditáveis.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
