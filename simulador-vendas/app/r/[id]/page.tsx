import { notFound } from "next/navigation";
import { Topbar } from "@/components/ui";
import { obter } from "@/lib/historico";
import type { Meta } from "@/lib/ai";
import type { Analise, Conversa, DadosPainel, PainelEquipe } from "@/lib/types";
import type { AvaliacaoSessao } from "@/lib/avaliacao";
import type { DadosPainelSimulacao, PainelSimulacao } from "@/lib/painel-simulacao";
import { TIPO_PAINEL_SIMULACAO } from "@/lib/painel-simulacao";
import { Resultado, ResultadoPainel, ResultadoPainelSimulacao, ResultadoSessao } from "@/components/Resultado";

export default async function Page({ params }: PageProps<"/r/[id]">) {
  const { id } = await params;
  const tipagem = obter<unknown, unknown, Meta>(id);
  if (!tipagem) notFound();

  if (tipagem.tipo === "painel") {
    const registro = obter<DadosPainel, PainelEquipe, Meta>(id)!;
    return (
      <>
        <Topbar marca="S" nome="Simulador de Vendas" area="Vendas" status={{ ai: !registro.meta.demo, demo: registro.meta.demo, model: registro.meta.model }} />
        <main className="max-w-[1080px] mx-auto px-8 pt-7 pb-12 max-md:px-4 max-md:pt-5 max-md:pb-10">
          <ResultadoPainel painel={registro.saida} meta={registro.meta} id={id} titulo={registro.titulo} />
        </main>
      </>
    );
  }

  // A fotografia do painel de um treino (US-029): o que o gestor compartilha e leva impresso para a
  // reunião. Os números foram copiados no instante em que a foto foi tirada — reabrir não recalcula.
  if (tipagem.tipo === TIPO_PAINEL_SIMULACAO) {
    const registro = obter<DadosPainelSimulacao, PainelSimulacao, Meta>(id)!;
    return (
      <>
        <Topbar marca="S" nome="Simulador de Vendas" area="Vendas" status={{ ai: !registro.meta.demo, demo: registro.meta.demo, model: registro.meta.model }} />
        <main className="max-w-[1080px] mx-auto px-8 pt-7 pb-12 max-md:px-4 max-md:pt-5 max-md:pb-10">
          <ResultadoPainelSimulacao painel={registro.saida} meta={registro.meta} id={id} titulo={registro.titulo} />
        </main>
      </>
    );
  }

  // A avaliação de um treino (US-018) é o terceiro tipo: mesma moldura, outro conteúdo — a saída dela
  // tem os quatro momentos e a oportunidade, que uma conversa colada não tem.
  if (tipagem.tipo === "sessao") {
    const registro = obter<Conversa, AvaliacaoSessao, Meta>(id)!;
    return (
      <>
        <Topbar marca="S" nome="Simulador de Vendas" area="Vendas" status={{ ai: !registro.meta.demo, demo: registro.meta.demo, model: registro.meta.model }} />
        <main className="max-w-[860px] mx-auto px-8 pt-7 pb-12 max-md:px-4 max-md:pt-5 max-md:pb-10">
          <ResultadoSessao conversa={registro.entrada} avaliacao={registro.saida} meta={registro.meta} id={id} titulo={registro.titulo} />
        </main>
      </>
    );
  }

  if (tipagem.tipo !== "conversa") notFound();
  const registro = obter<Conversa, Analise, Meta>(id)!;

  return (
    <>
      <Topbar marca="S" nome="Simulador de Vendas" area="Vendas" status={{ ai: !registro.meta.demo, demo: registro.meta.demo, model: registro.meta.model }} />
      <main className="max-w-[860px] mx-auto px-8 pt-7 pb-12 max-md:px-4 max-md:pt-5 max-md:pb-10">
        <Resultado conversa={registro.entrada} analise={registro.saida} meta={registro.meta} id={id} titulo={registro.titulo} />
      </main>
    </>
  );
}
