import { notFound } from "next/navigation";
import { Topbar } from "@/components/ui";
import { obter } from "@/lib/historico";
import type { Meta } from "@/lib/ai";
import type { EntradaAnalise, SaidaAnalise } from "@/lib/types";
import { Resultado } from "../../page";

export default async function Page({ params }: PageProps<"/r/[id]">) {
  const { id } = await params;
  const registro = obter<EntradaAnalise, SaidaAnalise, Meta>(id);
  if (!registro || registro.tipo !== "voz-do-cliente") notFound();

  return (
    <>
      <Topbar marca="V" nome="Voz do Cliente" area="Experiência do Cliente e Marketing" status={{ ai: !registro.meta.demo, demo: registro.meta.demo, model: registro.meta.model }} />
      <main className="max-w-[860px] mx-auto px-8 pt-7 pb-12 max-md:px-4 max-md:pt-5 max-md:pb-10">
        <Resultado saida={registro.saida} contexto={registro.entrada.contexto} meta={registro.meta} id={id} />
      </main>
    </>
  );
}
