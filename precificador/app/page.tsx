"use client";
// A tela inteira mora em components/Itens.tsx: `scripts/verificar-jargao.mjs` varre
// components/*.tsx e app/page.tsx, mas não as telas em app/<rota>/page.tsx (ver CLAUDE.md).
import { Itens } from "@/components/Itens";

export default function Page() {
  return <Itens />;
}
