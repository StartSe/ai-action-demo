import { notFound } from "next/navigation";
import { Topbar } from "@/components/ui";
import { anexarEstadoCobranca } from "@/lib/cobranca";
import { obter } from "@/lib/historico";
import type { Meta } from "@/lib/ai";
import type { Ata, EntradaAta } from "@/lib/types";
import { Resultado } from "../../page";

export default async function Page({ params }: PageProps<"/r/[id]">) {
  const { id } = await params;
  const registro = obter<EntradaAta, Ata, Meta>(id);
  if (!registro || registro.tipo !== "ata") notFound();

  return (
    <>
      <Topbar marca="A" nome="Ata Executiva" area="Gestão" status={{ ai: !registro.meta.demo, demo: registro.meta.demo, model: registro.meta.model }} />
      <main className="max-w-[860px] mx-auto px-8 pt-7 pb-12 max-md:px-4 max-md:pt-5 max-md:pb-10">
        <Resultado
          ata={anexarEstadoCobranca(registro.saida)}
          titulo={registro.entrada.titulo}
          participantes={registro.entrada.participantes}
          emailsParticipantes={registro.entrada.emailsParticipantes}
          transcricao={registro.entrada.transcricao}
          fonteTranscricao={registro.entrada.fonteTranscricao}
          meta={registro.meta}
          id={id}
        />
      </main>
    </>
  );
}
