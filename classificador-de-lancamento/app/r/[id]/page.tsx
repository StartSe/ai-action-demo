import { notFound } from "next/navigation";
import { Topbar } from "@/components/ui";
import { obter } from "@/lib/historico";
import type { Meta } from "@/lib/ai";
import type { EntradaClassificacao, ResultadoClassificacao } from "@/lib/types";
import { Resultado } from "../../page";

export default async function Page({ params }: PageProps<"/r/[id]">) {
  const { id } = await params;
  const registro = obter<EntradaClassificacao, ResultadoClassificacao, Meta>(id);
  if (!registro || registro.tipo !== "classificacao-lancamentos") notFound();

  return (
    <>
      <Topbar marca="C" nome="Classificador de Lançamento" area="Financeiro" status={{ ai: !registro.meta.demo, demo: registro.meta.demo, model: registro.meta.model }} />
      <main className="max-w-[1000px] mx-auto px-8 pt-7 pb-12 max-md:px-4 max-md:pt-5 max-md:pb-10">
        <Resultado resultado={registro.saida} meta={registro.meta} id={id} nomeNovos={registro.entrada.nomeNovos} />
      </main>
    </>
  );
}
