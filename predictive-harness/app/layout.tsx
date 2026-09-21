import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Predictive Harness · IA para Executivos",
  description: "Análise de dados por conversa: o ChatGPT raciocina e escreve, o Jev decide rápido e verifica cada resposta.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
