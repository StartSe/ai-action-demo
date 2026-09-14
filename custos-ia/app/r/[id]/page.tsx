import { notFound } from "next/navigation";
import { Topbar } from "@/components/ui";
import { obter } from "@/lib/historico";
import type { Meta } from "@/lib/ai";
import type { SaidaLeitura } from "@/lib/leitura";
import type { DadosLeitura } from "@/lib/types";
import { Resultado } from "../../page";

export default async function Page({ params }: PageProps<"/r/[id]">) {
  const { id } = await params;
  const registro = obter<DadosLeitura, SaidaLeitura, Meta>(id);
  if (!registro || registro.tipo !== "leitura") notFound();

  return (
    <>
      <Topbar marca="C" nome="Custos de IA" area="Financeiro" status={{ ai: !registro.meta.demo, demo: registro.meta.demo, model: registro.meta.model }} />
      <main className="max-w-[860px] mx-auto px-8 pt-7 pb-12 max-md:px-4 max-md:pt-5 max-md:pb-10">
        <Resultado leitura={registro.saida.leitura} faturas={registro.saida.faturas} meta={registro.meta} id={id} />
      </main>
    </>
  );
}
