import { notFound } from "next/navigation";
import { Chip, Origem } from "@/components/ui";
import { data } from "@/lib/formato";
import { obter } from "@/lib/historico";
import type { Meta } from "@/lib/ai";
import type { EntradaCobranca, EntradaExtracaoAta, ResultadoAcoesSalvas } from "@/lib/types";
import { situacaoPrazo } from "@/lib/situacao-prazo";
import { ImprimirAoCarregar } from "./ImprimirAoCarregar";

const TITULOS: Record<string, string> = {
  "extracao-ata": "Ações extraídas de uma ata",
  "cobranca-acoes": "Ações cobradas nesta rotina",
};

export default async function Page({ params }: PageProps<"/imprimir/[id]">) {
  const { id } = await params;
  const registro = obter<EntradaExtracaoAta | EntradaCobranca, ResultadoAcoesSalvas, Meta>(id);
  if (!registro || !TITULOS[registro.tipo]) notFound();

  return (
    <div className="print-sheet max-w-[860px] mx-auto px-8 py-10 max-md:px-4">
      <ImprimirAoCarregar />
      <header className="mb-8 pb-4 border-b border-line">
        <div className="text-[13px] font-semibold text-muted">Follow-up de Decisão</div>
        <h1 className="text-2xl font-extrabold tracking-[-0.01em]">{TITULOS[registro.tipo]}</h1>
        <div className="text-muted text-sm">{data(new Date())}</div>
      </header>

      <div className="flex flex-col gap-2.5">
        {registro.saida.acoes.map((a) => (
          <div key={a.id} className="card shadow-none px-5 py-3.5 flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div className={`font-semibold ${a.status === "concluida" ? "line-through text-muted" : ""}`}>{a.titulo}</div>
              <div className="text-muted text-[13px]">{a.dono || "Sem dono definido"}</div>
            </div>
            <Chip nivel={situacaoPrazo(a).nivel}>{situacaoPrazo(a).texto}</Chip>
          </div>
        ))}
      </div>

      <footer className="mt-8 pt-4 border-t border-line">
        <Origem meta={registro.meta} />
      </footer>
    </div>
  );
}
