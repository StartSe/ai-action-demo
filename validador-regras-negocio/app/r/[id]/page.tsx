import { notFound } from "next/navigation";
import { Topbar } from "@/components/ui";
import { obter } from "@/lib/historico";
import type { Meta } from "@/lib/ai";
import type { DadosValidador, ResultadoValidacao } from "@/lib/types";
import { Resultado } from "../../page";

export default async function Page({ params }: PageProps<"/r/[id]">) {
  const { id } = await params;
  const registro = obter<DadosValidador, ResultadoValidacao, Meta>(id);
  if (!registro || registro.tipo !== "validador") notFound();

  return (
    <>
      <Topbar marca="V" nome="Validador de Regras de Negócio" area="Gestão" status={{ ai: !registro.meta.demo, demo: registro.meta.demo, model: registro.meta.model }} />
      <main className="max-w-[860px] mx-auto px-8 pt-7 pb-12 max-md:px-4 max-md:pt-5 max-md:pb-10">
        <Resultado resultado={registro.saida} dados={registro.entrada} meta={registro.meta} id={id} />
      </main>
    </>
  );
}
