import { fonteDadosConfigurada, lerFonteDados } from "@/lib/fonte-dados-mcp";

/** Se a integração "Fonte de dados (MCP)" está conectada, para o botão "Ler da fonte conectada" no painel. */
export async function GET() {
  return Response.json({ configurada: fonteDadosConfigurada() });
}

/** Lê a fonte conectada e devolve o CSV para o painel processar como se fosse um arquivo enviado. */
export async function POST() {
  try {
    const csv = await lerFonteDados();
    return Response.json({ csv });
  } catch (err) {
    const mensagem = err instanceof Error ? err.message : "Não foi possível ler a fonte conectada.";
    return Response.json({ error: mensagem }, { status: 500 });
  }
}
