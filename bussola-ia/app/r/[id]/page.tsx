import { notFound } from "next/navigation";

import { obter } from "@/lib/historico";
import type { Meta } from "@/lib/ai";
import type { Avaliacao, DadosAvaliacao } from "@/lib/types";
import { PainelGestor } from "@/components/observatorio/PainelGestor";

export default async function Page({ params }: PageProps<"/r/[id]">) {
  const { id } = await params;
  const registro = obter<DadosAvaliacao, Avaliacao, Meta>(id);
  if (!registro || registro.tipo !== "avaliacao") notFound();

  return (
    <PainelGestor
      key={id}
      resultadoInicial={{ avaliacao: registro.saida, meta: registro.meta, id }}
    />
  );
}
