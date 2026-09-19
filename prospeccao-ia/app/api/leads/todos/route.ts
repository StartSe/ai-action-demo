import { listarLeadsComContexto } from "@/lib/workspace";

/**
 * Todos os leads de todas as prospecções (US-036, `/leads`) — path próprio (não `/api/leads`, já usado
 * pela rota antiga de busca de leads, `lib/historico.ts`) no mesmo padrão de sibling estático de
 * `/api/produtos/analisar` ao lado de `/api/produtos/[id]`. Mesma função (lib/workspace.ts:
 * listarLeadsComContexto) usada pela ferramenta MCP `listar_leads` (US-039).
 */
export async function GET() {
  return Response.json(listarLeadsComContexto());
}
