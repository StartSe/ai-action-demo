import { obter, atualizarSaida } from "@/lib/historico";
import type { Avaliacao } from "@/lib/types";
export async function PATCH(
  req: Request,
  { params }: RouteContext<"/api/bussola/[id]/plano">,
) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const r = obter<unknown, Avaliacao>(id);
  if (!r || r.tipo !== "avaliacao" || !r.saida.analise)
    return Response.json(
      { error: "Diagnóstico não encontrado." },
      { status: 404 },
    );
  if (
    !Number.isInteger(body?.indice) ||
    body.indice < 0 ||
    body.indice >= r.saida.analise.proximosPassos.length ||
    typeof body.concluida !== "boolean"
  )
    return Response.json(
      { error: "Escolha uma ação válida." },
      { status: 400 },
    );
  const feitas = new Set(r.saida.analise.acoesConcluidas ?? []);
  if (body.concluida) feitas.add(body.indice);
  else feitas.delete(body.indice);
  r.saida.analise.acoesConcluidas = [...feitas].sort((a, b) => a - b);
  atualizarSaida(id, r.saida);
  return Response.json({ acoesConcluidas: r.saida.analise.acoesConcluidas });
}
