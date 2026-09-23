import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { ToastRegion } from "@/components/Toast";
const font = localFont({
  src: "./fonts/manrope-latin.woff2",
  variable: "--font-manrope",
  display: "swap",
});
export const metadata: Metadata = {
  title: "Daily Second Brain · IA para Executivos",
  description:
    "Sua memória conectada. Transforme informação em conhecimento e conhecimento em ação.",
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#111218",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={font.variable}>
      <body>
        {children}
        <ToastRegion />
      </body>
    </html>
  );
}
