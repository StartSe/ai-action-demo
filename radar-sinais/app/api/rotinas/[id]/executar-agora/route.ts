import { after } from "next/server";
import { enfileirarRotina, executarFila } from "@/lib/rotinas";
import "@/lib/rotinas-do-app";
export async function POST(_req: Request, { params }: RouteContext<"/api/rotinas/[id]/executar-agora">) {
  const { id } = await params;
  const execucaoId = enfileirarRotina(id);
  if (!execucaoId) return Response.json({ error: "Rotina não encontrada." }, { status: 404 });
  after(async () => { await executarFila(); });
  return Response.json({ ok: true, execucaoId, mensagem: "Pesquisa em segundo plano. Acompanhe o histórico de atualizações." }, { status: 202 });
}
