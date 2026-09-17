import type { Metadata } from "next";
import { Geist_Mono, Inter } from "next/font/google";

import { ToasterMount } from "@/components/ui/toaster-mount";

import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

// `preload: false`: o Geist Mono só aparece em blocos de código (docs, exemplos
// de API). Preload em toda rota fazia o celular baixar 48 kB de fonte com
// prioridade alta antes do primeiro paint, competindo com o LCP da home. Sem
// preload a fonte continua carregando onde é usada (font-display: swap).
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  preload: false,
});

export const metadata: Metadata = {
  title: {
    default: "AutoML",
    template: "%s | AutoML",
  },
  applicationName: "AutoML",
  description: "Suba planilhas, prepare os dados e treine modelos preditivos.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      // globals.css liga `scroll-behavior: smooth` quando há [data-marketing-root];
      // este atributo avisa o Next para desligá-lo durante a troca de rota
      // (ex.: /politica-de-uso → /#secao pelo footer), senão ele alerta no console.
      data-scroll-behavior="smooth"
      className={`${inter.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <ToasterMount />
      </body>
    </html>
  );
}
