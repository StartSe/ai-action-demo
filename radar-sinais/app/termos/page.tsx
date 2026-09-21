"use client";
import { Topbar, useStatus } from "@/components/ui";
import { PesquisaEditor } from "@/components/Pesquisa";
import { RadarWorkspace } from "@/components/RadarWorkspace";
export default function Page() {
  const { status, erro } = useStatus();
  return <>
    <Topbar marca="R" nome="Radar de Sinais" area="Estratégia" status={status} erro={erro} usuario={status?.usuario} />
    <main className="max-w-[1200px] mx-auto px-5 py-7">
      <RadarWorkspace>{radar => <>
        <h1 className="titulo-painel mb-2">Configurar {radar.nome}</h1>
        <p className="text-muted mb-6">Escolha os temas, as fontes e as páginas que orientam este radar.</p>
        <PesquisaEditor modo="todos" radarId={radar.id} />
      </>}</RadarWorkspace>
    </main>
  </>;
}
