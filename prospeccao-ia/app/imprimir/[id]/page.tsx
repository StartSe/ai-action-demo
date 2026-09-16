import { notFound } from "next/navigation";
import { data } from "@/lib/formato";
import { obter } from "@/lib/historico";
import type { Meta } from "@/lib/ai";
import type { DadosBusca, ResultadoBusca } from "@/lib/types";
import { ConteudoLeads } from "../../page";
import { ImprimirAoCarregar } from "./ImprimirAoCarregar";

export default async function Page({ params }: PageProps<"/imprimir/[id]">) {
  const { id } = await params;
  const registro = obter<DadosBusca, ResultadoBusca, Meta>(id);
  if (!registro || registro.tipo !== "leads") notFound();

  return (
    <div className="print-sheet max-w-[1080px] mx-auto px-8 py-10 max-md:px-4">
      <ImprimirAoCarregar />
      <header className="mb-8 pb-4 border-b border-line">
        <div className="text-[13px] font-semibold text-muted">Prospecção com IA</div>
        <h1 className="text-2xl font-extrabold tracking-[-0.01em]">{`Leads: ${registro.entrada.cargo} em ${registro.entrada.segmento}`}</h1>
        <div className="text-muted text-sm">{data(new Date())}</div>
      </header>

      <ConteudoLeads dados={registro.entrada} leads={registro.saida.leads} leadsProntos={new Set(Object.keys(registro.saida.abordagens || {}))} />

      <footer className="mt-8 pt-4 border-t border-line">
        <p className="text-muted text-[13px]">
          {registro.saida.fonte === "demo"
            ? `Lista de exemplo a partir de ${registro.meta.insumo}.`
            : `Leads buscados na base da Apollo a partir de ${registro.meta.insumo}, em ${data(registro.meta.geradoEm, { comHora: true })}.`}
        </p>
      </footer>
    </div>
  );
}
