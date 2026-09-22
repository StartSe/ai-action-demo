import { notFound } from "next/navigation";
import { Topbar } from "@/components/ui";
import { obter } from "@/lib/historico";
import type { Meta } from "@/lib/ai";
import type { AnalisePerdas, EntradaAnalise } from "@/lib/types";
import { Resultado } from "../../page";

export default async function Page({ params }: PageProps<"/r/[id]">) {
  const { id } = await params;
  const registro = obter<EntradaAnalise, AnalisePerdas, Meta>(id);
  if (!registro || registro.tipo !== "analise-perda") notFound();

  return (
    <>
      <Topbar marca="A" nome="Análise de Perda" area="Vendas" status={{ ai: !registro.meta.demo, demo: registro.meta.demo, model: registro.meta.model }} />
      <main className="max-w-[860px] mx-auto px-8 pt-7 pb-12 max-md:px-4 max-md:pt-5 max-md:pb-10">
        <Resultado analise={registro.saida} entrada={registro.entrada} meta={registro.meta} id={id} />
      </main>
    </>
  );
}
