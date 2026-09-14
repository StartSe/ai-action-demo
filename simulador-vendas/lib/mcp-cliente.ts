// Cliente MCP genérico (JSON-RPC 2.0 sobre Streamable HTTP) para este app conectar a um
// servidor MCP de outro app da suíte (ex.: o "Quadro de tarefas" exposto por agente-kanban)
// ou de qualquer serviço externo compatível. Espelha o protocolo implementado em lib/mcp.ts
// (o lado servidor), só que do lado de quem chama. Compartilhado: copie sem alterar para os 10 apps.

export type ConexaoMCP = { url: string; token?: string };
export type FerramentaMCP = { nome: string; descricao?: string; schema?: unknown };

async function chamarRpc(conexao: ConexaoMCP, method: string, params?: Record<string, unknown>): Promise<unknown> {
  const cabecalhos: Record<string, string> = { "Content-Type": "application/json" };
  if (conexao.token) cabecalhos.Authorization = `Bearer ${conexao.token}`;
  const r = await fetch(conexao.url, {
    method: "POST",
    headers: cabecalhos,
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: params ?? {} }),
  });
  const corpo = (await r.json().catch(() => null)) as { result?: unknown; error?: { message: string } } | null;
  if (!corpo) throw new Error(`O quadro respondeu HTTP ${r.status}.`);
  if (corpo.error) throw new Error(corpo.error.message || "O quadro recusou a chamada.");
  if (!r.ok) throw new Error(`O quadro respondeu HTTP ${r.status}.`);
  return corpo.result;
}

/** Guarda o endereço e o código de acesso de um servidor MCP externo para as chamadas seguintes. */
export function conectar(url: string, token?: string): ConexaoMCP {
  return { url, token };
}

export async function listarFerramentas(conexao: ConexaoMCP): Promise<FerramentaMCP[]> {
  const resultado = (await chamarRpc(conexao, "tools/list")) as { tools?: { name: string; description?: string; inputSchema?: unknown }[] };
  return (resultado.tools ?? []).map((t) => ({ nome: t.name, descricao: t.description, schema: t.inputSchema }));
}

export async function chamar(conexao: ConexaoMCP, nome: string, args: Record<string, unknown>): Promise<unknown> {
  const resultado = (await chamarRpc(conexao, "tools/call", { name: nome, arguments: args })) as { content?: { type: string; text?: string }[] };
  const texto = resultado.content?.find((c) => c.type === "text")?.text;
  if (texto === undefined) return resultado;
  try {
    return JSON.parse(texto);
  } catch {
    return texto;
  }
}
