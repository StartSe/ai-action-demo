"use client";
// Cabeçalho do app com o sino alimentado pelos avisos dos sites (components/useAvisos.ts). Um só lugar para
// todas as telas (inclusive as Server Components, como /r/[id]) renderizarem a Topbar da suíte com o mesmo
// status e as mesmas notificações, sem alterar components/ui.tsx.
import { Topbar, useStatus } from "./ui";
import { useAvisos } from "./useAvisos";

export const MARCA_APP = { marca: "S", nome: "Site Cowork", area: "Criação, hospedagem e estratégia" } as const;
export const RESUMO_DEMO = "Modo demonstração: o site exibido é um exemplo.";

export function TopbarSite() {
  const { status, erro } = useStatus();
  const avisos = useAvisos();
  return <Topbar {...MARCA_APP} status={status} erro={erro} resumo={RESUMO_DEMO} usuario={status?.usuario} notificacoes={avisos} />;
}
