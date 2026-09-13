import { notFound } from "next/navigation";
import { Topbar } from "@/components/ui";
import { obter } from "@/lib/historico";
import type { Meta } from "@/lib/ai";
import type { AtendimentoSaida, RelatorioAtendimentoSaida } from "@/lib/types";
import { Resultado, ResultadoRelatorio } from "../../page";

const TIPOS_VALIDOS = ["atendimento", "relatorio-atendimento"];

export default async function Page({ params }: PageProps<"/r/[id]">) {
  const { id } = await params;
  const registro = obter<unknown, AtendimentoSaida | RelatorioAtendimentoSaida, Meta>(id);
  if (!registro || !TIPOS_VALIDOS.includes(registro.tipo)) notFound();

  return (
    <>
      <Topbar marca="W" nome="Atendente no WhatsApp" area="Atendimento e Vendas" status={{ ai: !registro.meta.demo, demo: registro.meta.demo, model: registro.meta.model }} />
      <main className="max-w-[860px] mx-auto px-8 pt-7 pb-12 max-md:px-4 max-md:pt-5 max-md:pb-10">
        {registro.tipo === "atendimento" ? (
          <Resultado conversas={(registro.saida as AtendimentoSaida).conversas} meta={registro.meta} id={id} />
        ) : (
          <ResultadoRelatorio itens={(registro.saida as RelatorioAtendimentoSaida).itens} meta={registro.meta} id={id} />
        )}
      </main>
    </>
  );
}
