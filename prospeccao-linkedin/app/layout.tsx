import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";

const manrope = Manrope({ variable: "--font-manrope", subsets: ["latin"], weight: ["400", "500", "600", "700", "800"] });

export const metadata: Metadata = {
  title: "Prospecção no LinkedIn · IA para Executivos",
  description: "Descreva o cliente ideal e receba a lista de leads com a sequência de mensagens pronta para o LinkedIn.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={`${manrope.variable} antialiased`}>
      <body>{children}</body>
    </html>
  );
}
