import { notFound } from "next/navigation";
import { Topbar } from "@/components/ui";
import { FichaLeadCompartilhada } from "@/components/FichaLeadCompartilhada";
import { obter } from "@/lib/historico";
import type { Meta } from "@/lib/ai";
import { NAVEGACAO_PROSPECCAO } from "@/lib/navegacao-prospeccao";
import type { DadosBusca, ResultadoBusca } from "@/lib/types";
import { listarAbordagens, obterConta, obterLead } from "@/lib/workspace";
import { Resultado } from "../../page";

export default async function Page({ params }: PageProps<"/r/[id]">) {
  const { id } = await params;

  // Modelo novo (workspace, US-032): [id] de um LeadProspeccao — ficha + estratégia + três canais.
  // Tentado ANTES do modelo antigo (nunca o contrário) para não quebrar um link/impressão de busca de
  // leads já compartilhado; os dois espaços de id (gerarId() de lib/workspace.ts e lib/historico.ts)
  // nunca colidem na prática (mesmo gerador, ids aleatórios), então a ordem é só uma questão de fallback.
  const lead = obterLead(id);
  if (lead) {
    const conta = lead.contaId ? obterConta(lead.contaId) : null;
    const abordagem = listarAbordagens(id)[0] ?? null;
    return (
      <>
        <Topbar marca="P" nome="Prospecção com IA" area="Vendas" status={{ ai: !(abordagem?.demo ?? true), demo: abordagem?.demo ?? true, model: "" }} navegacao={NAVEGACAO_PROSPECCAO} />
        <main className="max-w-[640px] mx-auto px-8 pt-7 pb-12 max-md:px-4 max-md:pt-5 max-md:pb-10">
          <FichaLeadCompartilhada lead={lead} conta={conta} abordagem={abordagem} />
        </main>
      </>
    );
  }

  // Modelo antigo (busca de leads, lib/historico.ts) — comportamento preservado.
  const registro = obter<DadosBusca, ResultadoBusca, Meta>(id);
  if (!registro || registro.tipo !== "leads") notFound();

  return (
    <>
      <Topbar marca="P" nome="Prospecção com IA" area="Vendas" status={{ ai: !registro.meta.demo, demo: registro.meta.demo, model: registro.meta.model }} navegacao={NAVEGACAO_PROSPECCAO} />
      <main className="max-w-[1080px] mx-auto px-8 pt-7 pb-12 max-md:px-4 max-md:pt-5 max-md:pb-10">
        <Resultado
          dados={registro.entrada}
          fonte={registro.saida.fonte}
          leads={registro.saida.leads}
          meta={registro.meta}
          id={id}
          leadsProntos={new Set(Object.keys(registro.saida.abordagens || {}))}
          abordagensSalvas={registro.saida.abordagens}
        />
      </main>
    </>
  );
}
