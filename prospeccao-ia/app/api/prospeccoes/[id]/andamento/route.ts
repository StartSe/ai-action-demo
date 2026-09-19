import { obterAndamento } from "@/lib/workspace";

export const dynamic = "force-dynamic";

/**
 * Andamento de uma prospecção (US-013): payload único que serve tanto a carga inicial da tela quanto o
 * poll a cada 2 s (components/ProspeccaoAndamento.tsx). Mesma função (lib/workspace.ts:obterAndamento)
 * usada pela ferramenta MCP `andamento_prospeccao` (US-039).
 */
export async function GET(_req: Request, { params }: RouteContext<"/api/prospeccoes/[id]/andamento">) {
  const { id } = await params;
  const andamento = obterAndamento(id);
  if (!andamento) return Response.json({ error: "Prospecção não encontrada." }, { status: 404 });
  return Response.json(andamento);
}
