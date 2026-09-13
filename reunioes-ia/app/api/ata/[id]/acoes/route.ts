import { cancelarCobranca } from "@/lib/cobranca";
import { atualizarSaida, obter } from "@/lib/historico";
import type { Ata } from "@/lib/types";

interface Payload {
  indice?: number;
  concluida?: boolean;
}

/** Marca/desmarca uma ação como concluída e persiste no resultado salvo (checkbox "Concluída" da ata).
 * Marcar como concluída cancela a rotina de "Cobrar na véspera" agendada para essa ação (US-076). */
export async function PATCH(req: Request, { params }: RouteContext<"/api/ata/[id]/acoes">) {
  const { id } = await params;
  const { indice, concluida } = (await req.json().catch(() => ({}))) as Payload;
  if (typeof indice !== "number" || typeof concluida !== "boolean") {
    return Response.json({ error: "Informe indice e concluida." }, { status: 400 });
  }
  const registro = obter<unknown, Ata, unknown>(id);
  if (!registro || registro.tipo !== "ata") {
    return Response.json({ error: "Ata não encontrada." }, { status: 404 });
  }
  const acoes = registro.saida.acoes || [];
  if (!acoes[indice]) {
    return Response.json({ error: "Ação não encontrada." }, { status: 404 });
  }
  const saida: Ata = {
    ...registro.saida,
    acoes: acoes.map((a, i) => {
      if (i !== indice) return a;
      const atualizada = { ...a, concluida };
      return concluida ? cancelarCobranca(atualizada) : atualizada;
    }),
  };
  atualizarSaida(id, saida);
  return Response.json({ ata: saida });
}
