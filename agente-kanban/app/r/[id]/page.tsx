import { notFound } from "next/navigation";
import { Topbar } from "@/components/ui";
import type { ResultadoAgente } from "@/lib/agente";
import type { Meta } from "@/lib/ai";
import { obter } from "@/lib/historico";
import { Resultado } from "@/components/LegacyKanban";

export default async function Page({ params }: PageProps<"/r/[id]">) {
  const { id } = await params;
  const registro = obter<{ mensagem: string }, ResultadoAgente, Meta>(id);
  if (!registro || registro.tipo !== "agente-kanban") notFound();

  return (
    <>
      <Topbar marca="K" nome="Agente de Kanban" area="Gestão e RH" status={{ ai: !registro.meta.demo, demo: registro.meta.demo, model: registro.meta.model }} />
      <main className="max-w-[1100px] mx-auto px-8 pt-7 pb-12 max-md:px-4 max-md:pt-5 max-md:pb-10">
        <Resultado quadro={registro.saida.quadro} alterados={registro.saida.alterados} meta={registro.meta} id={id} resposta={registro.saida.resposta} />
      </main>
    </>
  );
}
