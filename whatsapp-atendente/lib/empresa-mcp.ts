// Consulta os sistemas da empresa (pedidos, estoque, ERP...) conectados em "Sistemas da empresa
// (MCP)" (lib/setup-comum.ts). Ao contrário de lib/quadro-mcp.ts/lib/crm-mcp.ts em outros apps (que
// mapeiam uma operação fixa para uma ferramenta remota), aqui é o próprio modelo, via tool calling
// (askWithTools, lib/ai.ts), que decide se e qual ferramenta chamar durante o atendimento. Por
// segurança, só ferramentas cujo nome comece com listar/obter/consultar/buscar entram na lista
// oferecida ao modelo, a menos que liberadas manualmente em Opções avançadas.
import type { ToolDefinition } from "./ai";
import { chamar, conectar, listarFerramentas, type ConexaoMCP, type FerramentaMCP } from "./mcp-cliente";
import { getConfig, setConfig } from "./store";

const PREFIXOS_PERMITIDOS = ["listar", "obter", "consultar", "buscar"];

function conexaoAtual(): ConexaoMCP | null {
  const url = getConfig("MCP_EMPRESA_URL");
  if (!url) return null;
  return conectar(url, getConfig("MCP_EMPRESA_CODIGO"));
}

export function empresaMcpConfigurado(): boolean {
  return Boolean(getConfig("MCP_EMPRESA_URL"));
}

export function nomePermitidoPorPrefixo(nome: string): boolean {
  const alvo = nome.toLowerCase();
  return PREFIXOS_PERMITIDOS.some((p) => alvo.startsWith(p));
}

export function ferramentasLiberadas(): string[] {
  try {
    const bruto = getConfig("MCP_EMPRESA_LIBERADAS");
    return bruto ? (JSON.parse(bruto) as string[]) : [];
  } catch {
    return [];
  }
}

export function salvarFerramentasLiberadas(nomes: string[]): void {
  setConfig("MCP_EMPRESA_LIBERADAS", JSON.stringify([...new Set(nomes)]));
}

export async function ferramentasDisponiveis(): Promise<FerramentaMCP[]> {
  const conexao = conexaoAtual();
  if (!conexao) return [];
  return listarFerramentas(conexao);
}

/** As ferramentas de fato oferecidas ao atendente: liberadas por prefixo, ou liberadas manualmente em Opções avançadas. */
export async function ferramentasPermitidas(): Promise<FerramentaMCP[]> {
  const todas = await ferramentasDisponiveis();
  const liberadas = new Set(ferramentasLiberadas());
  return todas.filter((f) => nomePermitidoPorPrefixo(f.nome) || liberadas.has(f.nome));
}

function paraToolDefinition(f: FerramentaMCP): ToolDefinition {
  const parametros =
    f.schema && typeof f.schema === "object" ? (f.schema as Record<string, unknown>) : { type: "object", properties: {} };
  return { type: "function", function: { name: f.nome, description: f.descricao || f.nome, parameters: parametros } };
}

/**
 * Ferramentas prontas para askWithTools + a função que de fato as chama no sistema conectado.
 * `null` quando não há sistema conectado ou nenhuma ferramenta passa no filtro de segurança — nesse
 * caso o atendente segue respondendo só com a base de conhecimento, como antes desta integração.
 */
export async function toolsParaAtendente(): Promise<{
  tools: ToolDefinition[];
  executeTool: (nome: string, args: Record<string, unknown>) => Promise<unknown>;
} | null> {
  const conexao = conexaoAtual();
  if (!conexao) return null;
  const permitidas = await ferramentasPermitidas();
  if (permitidas.length === 0) return null;
  return { tools: permitidas.map(paraToolDefinition), executeTool: (nome, args) => {
    if (!permitidas.some((f) => f.nome === nome)) throw new Error("Ferramenta não autorizada");
    return chamar(conexao, nome, args);
  } };
}
