import { notFound } from "next/navigation";
import { Topbar } from "@/components/ui";
import { ResultadoMix, type EntradaMix } from "@/components/ResultadoMix";
import { obter } from "@/lib/historico";
import { NAVEGACAO } from "@/lib/navegacao";
import type { Meta } from "@/lib/ai";
import type { DiagnosticoMix } from "@/lib/types";

export default async function Page({ params }: PageProps<"/r/[id]">) {
  const { id } = await params;
  const registro = obter<EntradaMix, DiagnosticoMix, Meta>(id);
  if (!registro || registro.tipo !== "diagnostico-mix") notFound();

  return (
    <>
      <Topbar
        marca="P"
        nome="Precificador"
        area="Financeiro"
        navegacao={NAVEGACAO}
        status={{ ai: !registro.meta.demo, demo: registro.meta.demo, model: registro.meta.model }}
      />
      <main className="max-w-[860px] mx-auto px-8 pt-7 pb-12 max-md:px-4 max-md:pt-5 max-md:pb-10">
        <h1 className="titulo-painel !text-[26px] mb-5">{registro.titulo}</h1>
        <ResultadoMix diagnostico={registro.saida} entrada={registro.entrada} />
      </main>
    </>
  );
}
