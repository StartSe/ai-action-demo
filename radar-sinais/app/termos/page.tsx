"use client";
import { Topbar, useStatus } from "@/components/ui";
import { PesquisaEditor } from "@/components/Pesquisa";
export default function Page() {
  const { status, erro } = useStatus();
  return <><Topbar marca="R" nome="Radar de Sinais" area="Estratégia" status={status} erro={erro} usuario={status?.usuario} /><main className="max-w-[1200px] mx-auto px-5 py-9"><p className="sobretitulo">Termos monitorados</p><h1 className="titulo-painel mt-2">O que você quer acompanhar?</h1><p className="text-muted mt-3 mb-8 max-w-3xl">Defina os temas que orientam suas decisões. Combine termos amplos e específicos para descobrir oportunidades, riscos e conexões.</p><PesquisaEditor modo="termos" /></main></>;
}
