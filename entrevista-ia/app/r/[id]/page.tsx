import { notFound } from "next/navigation";
import { Topbar } from "@/components/ui";
import { obter } from "@/lib/historico";
import type { Meta } from "@/lib/ai";
import type { Ranking, Scorecard, Troca, Vaga } from "@/lib/types";
import { Resultado, ResultadoRanking } from "../../page";

type EntradaEntrevista = { vaga: Vaga; historico: Troca[] };
type EntradaRanking = { vagaTitulo: string };

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

  if (tipagem.tipo !== "entrevista" && tipagem.tipo !== "scorecard") notFound();
  const registro = obter<EntradaEntrevista, Scorecard, Meta>(id)!;

  return (
    <>
      <Topbar marca="E" nome="Entrevistadora IA" area="Recursos Humanos" status={{ ai: !registro.meta.demo, demo: registro.meta.demo, model: registro.meta.model }} />
      <main className="max-w-[860px] mx-auto px-8 pt-7 pb-12 max-md:px-4 max-md:pt-5 max-md:pb-10">
        <Resultado vaga={registro.entrada.vaga} scorecard={registro.saida} meta={registro.meta} historico={registro.entrada.historico} id={id} status={null} />
      </main>
    </>
  );
}
