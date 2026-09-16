import { notFound } from "next/navigation";
import { Origem } from "@/components/ui";
import { data } from "@/lib/formato";
import { anexarEstadoCobranca } from "@/lib/cobranca";
import { obter } from "@/lib/historico";
import type { Meta } from "@/lib/ai";
import type { Ata, EntradaAta } from "@/lib/types";
import { ConteudoAta } from "../../page";
import { ImprimirAoCarregar } from "./ImprimirAoCarregar";

export default async function Page({ params }: PageProps<"/imprimir/[id]">) {
  const { id } = await params;
  const registro = obter<EntradaAta, Ata, Meta>(id);
  if (!registro || registro.tipo !== "ata") notFound();

  return (
    <div className="print-sheet max-w-[860px] mx-auto px-8 py-10 max-md:px-4">
      <ImprimirAoCarregar />
      <header className="mb-8 pb-4 border-b border-line">
        <div className="text-[13px] font-semibold text-muted">Ata Executiva</div>
        <h1 className="text-2xl font-extrabold tracking-[-0.01em]">{registro.saida.titulo || registro.entrada.titulo || "Ata da reunião"}</h1>
        <div className="text-muted text-sm">{data(new Date())}</div>
      </header>

      <ConteudoAta
        ata={anexarEstadoCobranca(registro.saida)}
        transcricao={registro.entrada.transcricao}
        fonteTranscricao={registro.entrada.fonteTranscricao}
        id={id}
        emailsParticipantes={registro.entrada.emailsParticipantes}
      />

      <footer className="mt-8 pt-4 border-t border-line">
        <Origem meta={registro.meta} />
      </footer>
    </div>
  );
}
