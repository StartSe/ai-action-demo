import { notFound } from "next/navigation";
import { Origem } from "@/components/ui";
import { data } from "@/lib/formato";
import { obter } from "@/lib/historico";
import type { Meta } from "@/lib/ai";
import type { EntradaClassificacao, ResultadoClassificacao } from "@/lib/types";
import { ConteudoClassificacao } from "../../page";
import { ImprimirAoCarregar } from "./ImprimirAoCarregar";

export default async function Page({ params }: PageProps<"/imprimir/[id]">) {
  const { id } = await params;
  const registro = obter<EntradaClassificacao, ResultadoClassificacao, Meta>(id);
  if (!registro || registro.tipo !== "classificacao-lancamentos") notFound();

  return (
    <div className="print-sheet max-w-[1000px] mx-auto px-8 py-10 max-md:px-4">
      <ImprimirAoCarregar />
      <header className="mb-8 pb-4 border-b border-line">
        <div className="text-[13px] font-semibold text-muted">Classificador de Lançamento</div>
        <h1 className="text-2xl font-extrabold tracking-[-0.01em]">{`Classificação de ${registro.saida.totalNovos} lançamentos`}</h1>
        <div className="text-muted text-sm">{data(new Date())}</div>
      </header>

      <ConteudoClassificacao resultado={registro.saida} />

      <footer className="mt-8 pt-4 border-t border-line">
        <Origem meta={registro.meta} />
      </footer>
    </div>
  );
}
