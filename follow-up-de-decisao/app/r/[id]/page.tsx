import { notFound } from "next/navigation";
import { Topbar } from "@/components/ui";
import { obter } from "@/lib/historico";
import type { Meta } from "@/lib/ai";
import type { EntradaCobranca, EntradaExtracaoAta, ResultadoAcoesSalvas } from "@/lib/types";
import { ResultadoAcoes } from "../../page";

const TITULOS: Record<string, string> = {
  "extracao-ata": "Ações extraídas de uma ata",
  "cobranca-acoes": "Ações cobradas nesta rotina",
};

export default async function Page({ params }: PageProps<"/r/[id]">) {
  const { id } = await params;
  const registro = obter<EntradaExtracaoAta | EntradaCobranca, ResultadoAcoesSalvas, Meta>(id);
  if (!registro || !TITULOS[registro.tipo]) notFound();

  return (
    <>
      <Topbar marca="F" nome="Follow-up de Decisão" area="Gestão" status={{ ai: !registro.meta.demo, demo: registro.meta.demo, model: registro.meta.model }} />
      <main className="max-w-[860px] mx-auto px-8 pt-7 pb-12 max-md:px-4 max-md:pt-5 max-md:pb-10">
        <ResultadoAcoes titulo={TITULOS[registro.tipo]} acoes={registro.saida.acoes} meta={registro.meta} id={id} />
      </main>
    </>
  );
}
