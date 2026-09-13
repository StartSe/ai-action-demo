import { ferramentasDisponiveis, mapeamentoAtual, salvarMapeamento, type OperacaoQuadro } from "@/lib/quadro-mcp";
import { integracaoConfigurada, MCP_TAREFAS } from "@/lib/setup-comum";

export const dynamic = "force-dynamic";

/** Ferramentas do quadro conectado + o mapeamento atual (salvo, ou sugerido por nome/descrição), para o cartão "Opções avançadas" do MCP_TAREFAS (US-072). */
export async function GET() {
  const configurado = integracaoConfigurada(MCP_TAREFAS);
  if (!configurado) return Response.json({ configurado, ferramentas: [], mapa: {} });
  try {
    const ferramentas = await ferramentasDisponiveis();
    const mapa = await mapeamentoAtual(ferramentas);
    return Response.json({ configurado, ferramentas: ferramentas.map((f) => ({ nome: f.nome, descricao: f.descricao })), mapa });
  } catch (err) {
    return Response.json({
      configurado,
      ferramentas: [],
      mapa: {},
      error: err instanceof Error ? err.message : "Não foi possível listar as ações do quadro conectado.",
    });
  }
}

export async function PUT(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { mapa?: Partial<Record<OperacaoQuadro, string | null>> };
  if (!body.mapa) return Response.json({ error: "Informe o mapeamento." }, { status: 400 });
  salvarMapeamento(body.mapa);
  return Response.json({ ok: true });
}
