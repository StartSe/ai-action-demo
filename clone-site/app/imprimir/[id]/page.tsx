import { notFound } from "next/navigation";
import { Origem } from "@/components/ui";
import { data } from "@/lib/formato";
import { obter } from "@/lib/historico";
import type { Meta } from "@/lib/ai";
import type { EntradaPagina, Pagina } from "@/lib/types";
import { ImprimirAoCarregar } from "./ImprimirAoCarregar";

/** Folha de impressão: a página gerada, na largura de computador, com a proveniência no rodapé. */
export default async function Page({ params }: PageProps<"/imprimir/[id]">) {
  const { id } = await params;
  const registro = obter<EntradaPagina, Pagina, Meta>(id);
  if (!registro || registro.tipo !== "pagina") notFound();
  const atual = registro.saida.versoes[registro.saida.versoes.length - 1];

  return (
    <div className="print-sheet max-w-[1100px] mx-auto px-8 py-10 max-md:px-4">
      <ImprimirAoCarregar />
      <header className="mb-6 pb-4 border-b border-line">
        <div className="text-[13px] font-semibold text-muted">Clone de Site</div>
        <h1 className="text-2xl font-extrabold tracking-[-0.01em]">{registro.saida.titulo}</h1>
        <div className="text-muted text-sm">{data(new Date())} · Versão {atual.n}</div>
      </header>

      <iframe title={`Prévia de ${registro.saida.titulo}`} sandbox="allow-scripts" srcDoc={atual.html} className="block w-full bg-white border border-line rounded-card" style={{ height: 1400 }} />

      <footer className="mt-8 pt-4 border-t border-line">
        <Origem meta={registro.meta} />
      </footer>
    </div>
  );
}
