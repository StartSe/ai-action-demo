import { notFound } from "next/navigation";
import { Topbar } from "@/components/ui";
import { obter } from "@/lib/historico";
import type { Meta } from "@/lib/ai";
import type { DadosBusca, ResultadoBusca } from "@/lib/types";
import { Resultado } from "../../page";

export default async function Page({ params }: PageProps<"/r/[id]">) {
  const { id } = await params;
  const registro = obter<DadosBusca, ResultadoBusca, Meta>(id);
  if (!registro || registro.tipo !== "leads") notFound();

  return (
    <>
      <Topbar marca="P" nome="Prospecção com IA" area="Vendas" status={{ ai: !registro.meta.demo, demo: registro.meta.demo, model: registro.meta.model }} />
      <main className="max-w-[1080px] mx-auto px-8 pt-7 pb-12 max-md:px-4 max-md:pt-5 max-md:pb-10">
        <Resultado dados={registro.entrada} fonte={registro.saida.fonte} leads={registro.saida.leads} meta={registro.meta} id={id} />
      </main>
    </>
  );
}
