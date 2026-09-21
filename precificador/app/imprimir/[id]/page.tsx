import { notFound } from "next/navigation";
import { Origem } from "@/components/ui";
import { ResultadoMix, type EntradaMix } from "@/components/ResultadoMix";
import { data } from "@/lib/formato";
import { obter } from "@/lib/historico";
import type { Meta } from "@/lib/ai";
import type { DiagnosticoMix } from "@/lib/types";
import { ImprimirAoCarregar } from "./ImprimirAoCarregar";

export default async function Page({ params }: PageProps<"/imprimir/[id]">) {
  const { id } = await params;
  const registro = obter<EntradaMix, DiagnosticoMix, Meta>(id);
  if (!registro || registro.tipo !== "diagnostico-mix") notFound();

  return (
    <div className="print-sheet max-w-[860px] mx-auto px-8 py-10 max-md:px-4">
      <ImprimirAoCarregar />
      <header className="mb-8 pb-4 border-b border-line">
        <div className="text-[13px] font-semibold text-muted">Precificador</div>
        <h1 className="text-2xl font-extrabold tracking-[-0.01em]">{registro.titulo}</h1>
        <div className="text-muted text-sm">{data(new Date())}</div>
      </header>

      <ResultadoMix diagnostico={registro.saida} entrada={registro.entrada} />

      <footer className="mt-8 pt-4 border-t border-line">
        <Origem meta={registro.meta} />
      </footer>
    </div>
  );
}
