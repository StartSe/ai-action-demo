import { atualizarProspeccao, obterProspeccao } from "@/lib/workspace";

/**
 * Cancela uma prospecção em execução (US-014): marca `estado: "cancelada"` e devolve o registro
 * atualizado. O pipeline (lib/execucao-prospeccao.ts) confere esse estado entre as etapas e para de
 * gravar resultados novos, preservando o que já tinha encontrado até aqui.
 */
export async function POST(_req: Request, { params }: RouteContext<"/api/prospeccoes/[id]/cancelar">) {
  const { id } = await params;
  const prospeccao = obterProspeccao(id);
  if (!prospeccao) return Response.json({ error: "Prospecção não encontrada." }, { status: 404 });
  if (prospeccao.estado !== "executando") {
    return Response.json({ error: "Esta prospecção não está em execução." }, { status: 400 });
  }
  return Response.json(atualizarProspeccao(id, { estado: "cancelada" }));
}
