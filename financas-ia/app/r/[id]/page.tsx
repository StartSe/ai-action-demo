import { notFound } from "next/navigation";
import { Topbar } from "@/components/ui";
import { obter } from "@/lib/historico";
import type { Meta } from "@/lib/ai";
import type { EntradaInsights, SaidaInsights } from "@/lib/types";
import { Resultado } from "../../page";

export default async function Page({ params }: PageProps<"/r/[id]">) {
  const { id } = await params;
  const registro = obter<EntradaInsights, SaidaInsights, Meta>(id);
  if (!registro || registro.tipo !== "financas") notFound();

  return (
    <>
      <Topbar marca="F" nome="Analista Financeiro" area="Financeiro" status={{ ai: !registro.meta.demo, demo: registro.meta.demo, model: registro.meta.model }} />
      <main className="max-w-[860px] mx-auto px-8 pt-7 pb-12 max-md:px-4 max-md:pt-5 max-md:pb-10">
        <Resultado id={id} resumo={registro.saida.resumo} insights={registro.saida.insights} meta={registro.meta} nomeArquivo={registro.entrada.nomeArquivo} />
      </main>
    </>
  );
}
