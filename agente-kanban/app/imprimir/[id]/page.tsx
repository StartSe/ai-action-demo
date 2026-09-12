import { notFound } from "next/navigation";
import { Origem } from "@/components/ui";
import type { ResultadoAgente } from "@/lib/agente";
import type { Meta } from "@/lib/ai";
import { data } from "@/lib/formato";
import { obter } from "@/lib/historico";
import { ConteudoQuadro } from "../../page";
import { ImprimirAoCarregar } from "./ImprimirAoCarregar";

export default async function Page({ params }: PageProps<"/imprimir/[id]">) {
  const { id } = await params;
  const registro = obter<{ mensagem: string }, ResultadoAgente, Meta>(id);
  if (!registro || registro.tipo !== "agente-kanban") notFound();

  return (
    <div className="print-sheet max-w-[1100px] mx-auto px-8 py-10 max-md:px-4">
      <ImprimirAoCarregar />
      <header className="mb-8 pb-4 border-b border-line">
        <div className="text-[13px] font-semibold text-muted">Agente de Kanban</div>
        <h1 className="text-2xl font-extrabold tracking-[-0.01em]">{registro.titulo}</h1>
        <div className="text-muted text-sm">{data(new Date())}</div>
      </header>

      <ConteudoQuadro quadro={registro.saida.quadro} alterados={registro.saida.alterados} resposta={registro.saida.resposta} />

      <footer className="mt-8 pt-4 border-t border-line">
        <Origem meta={registro.meta} />
      </footer>
    </div>
  );
}
