import { notFound } from "next/navigation";
import { Origem } from "@/components/ui";
import { Painel } from "@/components/Painel";
import { data } from "@/lib/formato";
import { obter } from "@/lib/historico";
import type { Meta } from "@/lib/ai";
import type { EspecPainel, PedidoPainel } from "@/lib/types";
import { ImprimirAoCarregar } from "./ImprimirAoCarregar";

export default async function Page({ params }: PageProps<"/imprimir/[id]">) {
  const { id } = await params;
  const registro = obter<PedidoPainel, EspecPainel, Meta>(id);
  if (!registro || registro.tipo !== "painel") notFound();
  const painel = registro.saida;

  return (
    <div className="print-sheet max-w-[1100px] mx-auto px-8 py-10 max-md:px-4">
      <ImprimirAoCarregar />
      <header className="mb-6 pb-4 border-b border-line">
        <div className="text-[13px] font-semibold text-muted">Painel Pronto</div>
        <h1 className="text-2xl font-extrabold tracking-[-0.01em]">{painel.titulo}</h1>
        <p className="text-ink-2 text-sm mt-1">{painel.resumo}</p>
        <div className="text-muted text-sm mt-1">{painel.setor} · gerado em {data(registro.meta.geradoEm, { comAno: true })}</div>
      </header>

      <Painel painel={painel} modo="impressao" />

      <footer className="mt-6 pt-4 border-t border-line text-[13px] text-muted">
        <p className="mb-2 font-semibold">Números de exemplo, gerados para validar o formato do painel.</p>
        <Origem meta={registro.meta} />
      </footer>
    </div>
  );
}
