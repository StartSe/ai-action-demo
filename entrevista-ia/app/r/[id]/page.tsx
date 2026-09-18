import Link from "next/link";
import { notFound } from "next/navigation";
import { ConteudoParecer } from "@/components/ConteudoParecer";
import { Origem, ResultHead, Topbar } from "@/components/ui";
import { transcricao } from "@/lib/entrevistas";
import { obter } from "@/lib/historico";
import { ligacaoEnabled } from "@/lib/voz";
import type { Meta } from "@/lib/ai";
import type { Parecer, Ranking, Scorecard, Troca, Vaga } from "@/lib/types";
import { Resultado, ResultadoRanking } from "../../page";

type EntradaEntrevista = { vaga: Vaga; historico: Troca[] };
type EntradaRanking = { vagaTitulo: string };
type EntradaParecer = { entrevistaId: string; vagaId: string; candidatoId: string };

export default async function Page({ params }: PageProps<"/r/[id]">) {
  const { id } = await params;
  const tipagem = obter<unknown, unknown, Meta>(id);
  if (!tipagem) notFound();

  if (tipagem.tipo === "ranking") {
    const registro = obter<EntradaRanking, Ranking, Meta>(id)!;
    return (
      <>
        <Topbar marca="E" nome="Entrevistadora IA" area="Recursos Humanos" status={{ ai: !registro.meta.demo, demo: registro.meta.demo, model: registro.meta.model }} />
        <main className="max-w-[860px] mx-auto px-8 pt-7 pb-12 max-md:px-4 max-md:pt-5 max-md:pb-10">
          <ResultadoRanking ranking={registro.saida} meta={registro.meta} id={id} />
        </main>
      </>
    );
  }

  // O parecer por um link já copiado (o Histórico, um endereço guardado). A tela de trabalho é
  // `/entrevistas/<entrevistaId>` (US-023), com o cabeçalho, a decisão e as ações — aqui fica a
  // leitura, e o caminho para lá fica à vista.
  if (tipagem.tipo === "parecer") {
    const registro = obter<EntradaParecer, Parecer, Meta>(id)!;
    const conversa = registro.entrada.entrevistaId ? transcricao(registro.entrada.entrevistaId) : [];
    return (
      <>
        <Topbar marca="E" nome="Entrevistadora IA" area="Recursos Humanos" status={{ ai: !registro.meta.demo, demo: registro.meta.demo, model: registro.meta.model }} />
        <main className="max-w-[860px] mx-auto px-8 pt-7 pb-12 max-md:px-4 max-md:pt-5 max-md:pb-10">
          <article className="card p-7 max-md:p-5">
            <ResultHead titulo={registro.titulo} subtitulo="Parecer da entrevista">
              {registro.entrada.entrevistaId && (
                <Link href={`/entrevistas/${registro.entrada.entrevistaId}`} className="btn-ghost">Abrir a entrevista</Link>
              )}
            </ResultHead>
            <ConteudoParecer parecer={registro.saida} conversa={conversa.map((m) => ({ papel: m.papel, texto: m.texto }))} />
            <Origem meta={registro.meta} />
          </article>
        </main>
      </>
    );
  }

  if (tipagem.tipo !== "entrevista" && tipagem.tipo !== "scorecard") notFound();
  const registro = obter<EntradaEntrevista, Scorecard, Meta>(id)!;

  return (
    <>
      <Topbar marca="E" nome="Entrevistadora IA" area="Recursos Humanos" status={{ ai: !registro.meta.demo, demo: registro.meta.demo, model: registro.meta.model }} />
      <main className="max-w-[860px] mx-auto px-8 pt-7 pb-12 max-md:px-4 max-md:pt-5 max-md:pb-10">
        <Resultado vaga={registro.entrada.vaga} scorecard={registro.saida} meta={registro.meta} historico={registro.entrada.historico} id={id} ligacaoLigada={ligacaoEnabled()} />
      </main>
    </>
  );
}
