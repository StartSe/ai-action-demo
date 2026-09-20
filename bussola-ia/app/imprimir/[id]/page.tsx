import { Icone } from "@/components/observatorio/Icone";
import { notFound } from "next/navigation";
import { Origem } from "@/components/ui";
import { data } from "@/lib/formato";
import { obter } from "@/lib/historico";
import type { Meta } from "@/lib/ai";
import type { Avaliacao, DadosAvaliacao } from "@/lib/types";
import { ConteudoAvaliacao } from "@/components/ResultadoAvaliacao";
import { ImprimirAoCarregar } from "./ImprimirAoCarregar";

export default async function Page({ params }: PageProps<"/imprimir/[id]">) {
  const { id } = await params;
  const registro = obter<DadosAvaliacao, Avaliacao, Meta>(id);
  if (!registro || registro.tipo !== "avaliacao") notFound();

  return (
    <div className="print-sheet max-w-[860px] mx-auto px-8 py-10 max-md:px-4">
      <ImprimirAoCarregar />
      <header className="mb-8 pb-4 border-b border-line">
        <div className="print-brand">
          <Icone nome="compass" size={25} />
          <span>
            bússola<small>INOVAÇÃO + INTELIGÊNCIA</small>
          </span>
        </div>
        <h1 className="print-title">{registro.saida.titulo}</h1>
        <div className="text-muted text-sm">
          {registro.saida.empresa} · {data(registro.criadoEm)}
        </div>
      </header>

      <ConteudoAvaliacao avaliacao={registro.saida} />

      <footer className="mt-8 pt-4 border-t border-line">
        {!registro.meta.demo &&
        registro.saida.analise?.origemLeitura === "automatica" ? (
          <p className="text-sm">
            Diagnóstico real · Leitura automática, sem IA ·{" "}
            {registro.meta.insumo}
          </p>
        ) : (
          <Origem meta={registro.meta} />
        )}
      </footer>
    </div>
  );
}
