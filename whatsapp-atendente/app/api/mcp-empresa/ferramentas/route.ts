import { ferramentasDisponiveis, ferramentasLiberadas, nomePermitidoPorPrefixo, salvarFerramentasLiberadas } from "@/lib/empresa-mcp";
import { integracaoConfigurada, MCP_EMPRESA } from "@/lib/setup-comum";

export const dynamic = "force-dynamic";

/** Ferramentas do sistema conectado (todas, não só as permitidas) + quais já entram por prefixo e quais foram liberadas manualmente, para o cartão "Opções avançadas" do MCP_EMPRESA (US-074). */
export async function GET() {
  const configurado = integracaoConfigurada(MCP_EMPRESA);
  if (!configurado) return Response.json({ configurado, ferramentas: [], liberadas: [] });
  try {
    const ferramentas = await ferramentasDisponiveis();
    return Response.json({
      configurado,
      ferramentas: ferramentas.map((f) => ({ nome: f.nome, descricao: f.descricao, permitidaPorPrefixo: nomePermitidoPorPrefixo(f.nome) })),
      liberadas: ferramentasLiberadas(),
    });
  } catch (err) {
    return Response.json({
      configurado,
      ferramentas: [],
      liberadas: [],
      error: err instanceof Error ? err.message : "Não foi possível listar as ferramentas do sistema conectado.",
    });
  }
}

export async function PUT(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { liberadas?: string[] };
  if (!Array.isArray(body.liberadas)) return Response.json({ error: "Informe a lista de ferramentas liberadas." }, { status: 400 });
  salvarFerramentasLiberadas(body.liberadas.filter((n) => typeof n === "string"));
  return Response.json({ ok: true });
}
