import { notFound } from "next/navigation";
import { ConteudoParecer } from "@/components/ConteudoParecer";
import { Origem } from "@/components/ui";
import { transcricao } from "@/lib/entrevistas";
import { data } from "@/lib/formato";
import { obter } from "@/lib/historico";
import type { Meta } from "@/lib/ai";
import type { Parecer, Ranking, Scorecard, Troca, Vaga } from "@/lib/types";
import { RankingSalvo } from "@/components/RankingSalvo";
import { ConteudoScorecard } from "../../page";
import { ImprimirAoCarregar } from "./ImprimirAoCarregar";

type EntradaEntrevista = { vaga: Vaga; historico: Troca[] };
type EntradaRanking = { vagaTitulo: string };
type EntradaParecer = { entrevistaId: string; vagaId: string; candidatoId: string };

export default async function Page({ params }: PageProps<"/imprimir/[id]">) {
  const { id } = await params;
  const tipagem = obter<unknown, unknown, Meta>(id);
  if (!tipagem) notFound();

  if (tipagem.tipo === "ranking") {
    const registro = obter<EntradaRanking, Ranking, Meta>(id)!;
    return (
      <div className="print-sheet max-w-[860px] mx-auto px-8 py-10 max-md:px-4">
        <ImprimirAoCarregar />
        <header className="mb-8 pb-4 border-b border-line">
          <div className="text-[13px] font-semibold text-muted">Entrevistadora IA</div>
          <h1 className="text-2xl font-extrabold tracking-[-0.01em]">Ranking dos candidatos</h1>
          <div className="text-muted text-sm">{registro.saida.vagaTitulo}</div>
          <div className="text-muted text-sm">{data(new Date())}</div>
        </header>

        <RankingSalvo ranking={registro.saida} />

        <footer className="mt-8 pt-4 border-t border-line">
          <Origem meta={registro.meta} />
        </footer>
      </div>
    );
  }

  if (tipagem.tipo === "parecer") {
    const registro = obter<EntradaParecer, Parecer, Meta>(id)!;
    return (
      <div className="print-sheet max-w-[860px] mx-auto px-8 py-10 max-md:px-4">
        <ImprimirAoCarregar />
        <header className="mb-8 pb-4 border-b border-line">
          <div className="text-[13px] font-semibold text-muted">Entrevistadora IA</div>
          <h1 className="text-2xl font-extrabold tracking-[-0.01em]">{registro.titulo}</h1>
          <div className="text-muted text-sm">{data(new Date())}</div>
        </header>

        <ConteudoParecer
          parecer={registro.saida}
          conversa={(registro.entrada.entrevistaId ? transcricao(registro.entrada.entrevistaId) : []).map((m) => ({ papel: m.papel, texto: m.texto }))}
        />

        <footer className="mt-8 pt-4 border-t border-line">
          <Origem meta={registro.meta} />
        </footer>
      </div>
    );
  }

  if (tipagem.tipo !== "entrevista" && tipagem.tipo !== "scorecard") notFound();
  const registro = obter<EntradaEntrevista, Scorecard, Meta>(id)!;
  const vaga = registro.entrada.vaga;

  return (
    <div className="print-sheet max-w-[860px] mx-auto px-8 py-10 max-md:px-4">
      <ImprimirAoCarregar />
      <header className="mb-8 pb-4 border-b border-line">
        <div className="text-[13px] font-semibold text-muted">Entrevistadora IA</div>
        <h1 className="text-2xl font-extrabold tracking-[-0.01em]">{`Scorecard de ${vaga.candidato}`}</h1>
        <div className="text-muted text-sm">{data(new Date())}</div>
      </header>

      <ConteudoScorecard scorecard={registro.saida} historico={registro.entrada.historico} />

      <footer className="mt-8 pt-4 border-t border-line">
        <Origem meta={registro.meta} />
      </footer>
    </div>
  );
}
