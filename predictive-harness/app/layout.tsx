import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Predictive Harness · IA para Executivos",
  description: "Agente de FP&A: cenários por turma com premissas visíveis. O motor faz a conta, o modelo escreve, o Jev decide e verifica cada resposta.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
