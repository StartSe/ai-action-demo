"use client";

import dynamic from "next/dynamic";

// O `Toaster` do sonner (~13 kB gzip) fica fora do primeiro carregamento de
// TODA rota: nenhuma tela mostra toast antes de uma interação do usuário, e a
// home pública não mostra nenhum (PRD US-021, budget de First Load JS).
const Toaster = dynamic(
  () => import("@/components/ui/sonner").then((mod) => mod.Toaster),
  { ssr: false },
);

export function ToasterMount() {
  return <Toaster />;
}
