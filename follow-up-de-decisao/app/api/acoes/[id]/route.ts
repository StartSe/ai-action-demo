import { apagarAcao, definirStatus, obterAcao } from "@/lib/acoes";

/** Marca como concluída ou reabre; uma ação concluída nunca é cobrada de novo (lib/acoes.ts: acoesNaJanela). */
export async function PATCH(req: Request, { params }: RouteContext<"/api/acoes/[id]">) {
  const { id } = await params;
  const corpo = (await req.json().catch(() => ({}))) as { status?: string };
  if (corpo.status !== "pendente" && corpo.status !== "concluida") {
    return Response.json({ error: "Status inválido." }, { status: 400 });
  }
  const acao = definirStatus(id, corpo.status);
  if (!acao) return Response.json({ error: "Ação não encontrada." }, { status: 404 });
  return Response.json({ acao });
}

export async function DELETE(_req: Request, { params }: RouteContext<"/api/acoes/[id]">) {
  const { id } = await params;
  if (!obterAcao(id)) return Response.json({ error: "Ação não encontrada." }, { status: 404 });
  apagarAcao(id);
  return Response.json({ ok: true });
}
