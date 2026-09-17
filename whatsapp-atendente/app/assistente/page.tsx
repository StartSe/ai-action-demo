"use client";
// A tela inteira mora em components/Assistente.tsx: `scripts/verificar-jargao.mjs` varre
// components/*.tsx, mas não as telas em app/<rota>/page.tsx (ver CLAUDE.md).
import { Assistente } from "@/components/Assistente";

export default function Page() {
  return <Assistente />;
}
