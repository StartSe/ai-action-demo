import type { ToolDefinition } from "./ai";
import { conexaoAutorizada } from "./mcp-oauth";
import { chamar, conectar, listarFerramentas } from "./mcp-cliente";
import { getConfig } from "./store";

export async function toolsAgenda() {
  const autorizada = await conexaoAutorizada("MCP_AGENDA");
  if (!autorizada) return null;
  const permitidas = new Set((getConfig("MCP_AGENDA_FERRAMENTAS") || "").split(",").map((s) => s.trim()).filter(Boolean));
  if (!permitidas.size) return null;
  const conexao = conectar(autorizada.url, autorizada.token);
  const disponiveis = (await listarFerramentas(conexao)).filter((f) => permitidas.has(f.nome));
  if (!disponiveis.length) return null;
  // Nomes locais evitam colisões com as ferramentas de outros sistemas.
  const nomes = new Map(disponiveis.map((f, i) => [`agenda_${i}`, f.nome]));
  const tools: ToolDefinition[] = disponiveis.map((f, i) => ({
    type: "function", function: {
      name: `agenda_${i}`, description: `Agenda: ${f.nome}. ${f.descricao || ""}`,
      parameters: f.schema && typeof f.schema === "object" ? f.schema as Record<string, unknown> : { type: "object", properties: {} },
    },
  }));
  return { tools, executeTool: async (nome: string, args: Record<string, unknown>) => {
    const remoto = nomes.get(nome);
    // Confere também a configuração atual: uma revogação vale durante a conversa.
    const atuais = (getConfig("MCP_AGENDA_FERRAMENTAS") || "").split(",").map((s) => s.trim());
    if (!remoto || !atuais.includes(remoto)) throw new Error("Ferramenta de agenda não autorizada");
    const atual = await conexaoAutorizada("MCP_AGENDA");
    if (!atual || atual.url !== autorizada.url) throw new Error("Agenda desconectada. Encaminhe à equipe.");
    return chamar(conectar(atual.url, atual.token), remoto, args);
  } };
}
