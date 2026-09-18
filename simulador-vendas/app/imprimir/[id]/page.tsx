import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { Origem } from "@/components/ui";
import { data } from "@/lib/formato";
import { obter } from "@/lib/historico";
import type { Meta } from "@/lib/ai";
import type { Analise, Conversa, DadosPainel, PainelEquipe } from "@/lib/types";
import type { AvaliacaoSessao } from "@/lib/avaliacao";
import type { DadosPainelSimulacao, PainelSimulacao } from "@/lib/painel-simulacao";
import { TIPO_PAINEL_SIMULACAO } from "@/lib/painel-simulacao";
import { ConteudoAnalise, ConteudoPainel, ConteudoPainelSimulacao, ConteudoSessao } from "@/components/Resultado";
import { ImprimirAoCarregar } from "./ImprimirAoCarregar";

function Moldura({ titulo, meta, children }: { titulo: string; meta: Meta; children: ReactNode }) {
  return (
    <div className="print-sheet max-w-[860px] mx-auto px-8 py-10 max-md:px-4">
      <ImprimirAoCarregar />
      <header className="mb-8 pb-4 border-b border-line">
        <div className="text-[13px] font-semibold text-muted">Simulador de Vendas</div>
        <h1 className="text-2xl font-extrabold tracking-[-0.01em]">{titulo}</h1>
        <div className="text-muted text-sm">{data(new Date())}</div>
      </header>

      {children}

      <footer className="mt-8 pt-4 border-t border-line">
        <Origem meta={meta} />
      </footer>
    </div>
  );
}

export default async function Page({ params }: PageProps<"/imprimir/[id]">) {
  const { id } = await params;
  const tipagem = obter<unknown, unknown, Meta>(id);
  if (!tipagem) notFound();

  if (tipagem.tipo === "painel") {
    const registro = obter<DadosPainel, PainelEquipe, Meta>(id)!;
    return (
      <Moldura titulo={registro.titulo} meta={registro.meta}>
        <ConteudoPainel painel={registro.saida} />
      </Moldura>
    );
  }

  if (tipagem.tipo === TIPO_PAINEL_SIMULACAO) {
    const registro = obter<DadosPainelSimulacao, PainelSimulacao, Meta>(id)!;
    return (
      <Moldura titulo={registro.titulo} meta={registro.meta}>
        <ConteudoPainelSimulacao painel={registro.saida} />
      </Moldura>
    );
  }

  if (tipagem.tipo === "sessao") {
    const registro = obter<Conversa, AvaliacaoSessao, Meta>(id)!;
    return (
      <Moldura titulo={registro.titulo} meta={registro.meta}>
        <ConteudoSessao conversa={registro.entrada} avaliacao={registro.saida} />
      </Moldura>
    );
  }

  if (tipagem.tipo !== "conversa") notFound();
  const registro = obter<Conversa, Analise, Meta>(id)!;

  return (
    <Moldura titulo={registro.titulo} meta={registro.meta}>
      <ConteudoAnalise conversa={registro.entrada} analise={registro.saida} />
    </Moldura>
  );
}
