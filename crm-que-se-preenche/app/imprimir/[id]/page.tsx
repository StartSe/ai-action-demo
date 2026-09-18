import { notFound } from "next/navigation";
import { data } from "@/lib/formato";
import { obterNegocio } from "@/lib/negocios";
import { NegocioAtual, Historico } from "../../page";
import { ImprimirAoCarregar } from "./ImprimirAoCarregar";

export default async function Page({ params }: PageProps<"/imprimir/[id]">) {
  const { id } = await params;
  const registro = obterNegocio(id);
  if (!registro) notFound();

  return (
    <div className="print-sheet max-w-[860px] mx-auto px-8 py-10 max-md:px-4">
      <ImprimirAoCarregar />
      <header className="mb-8 pb-4 border-b border-line">
        <div className="text-[13px] font-semibold text-muted">CRM que Se Preenche</div>
        <h1 className="text-2xl font-extrabold tracking-[-0.01em]">{registro.saida.empresa}</h1>
        <div className="text-muted text-sm">{data(new Date())}</div>
      </header>

      <div className="flex flex-col gap-4">
        <NegocioAtual negocio={registro.saida} />
        {registro.saida.historico.length > 0 && <Historico eventos={registro.saida.historico} />}
      </div>
    </div>
  );
}
