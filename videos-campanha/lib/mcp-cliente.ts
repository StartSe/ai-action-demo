// Cliente MCP genérico (JSON-RPC 2.0 sobre Streamable HTTP) para este app conectar a um
// servidor MCP de outro app da suíte (ex.: o "Quadro de tarefas" exposto por agente-kanban)
// ou de qualquer serviço externo compatível. Espelha o protocolo implementado em lib/mcp.ts
// (o lado servidor), só que do lado de quem chama. Compartilhado: copie sem alterar para os 10 apps.

export type ConexaoMCP = { url: string; token?: string; sessionId?: string; ready?: Promise<void> };
export type FerramentaMCP = { nome: string; descricao?: string; schema?: unknown };

async function chamarRpc(conexao: ConexaoMCP, method: string, params?: Record<string, unknown>): Promise<unknown> {
  if (method !== "initialize" && method !== "notifications/initialized") {
    conexao.ready ??= (async () => {
      await chamarRpc(conexao, "initialize", { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "Creative Flow", version: "1.0" } });
      await chamarRpc(conexao, "notifications/initialized");
    })();
    await conexao.ready;
  }
  const id = method.startsWith("notifications/") ? undefined : crypto.randomUUID();
  const cabecalhos: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json, text/event-stream" };
  if (conexao.token) cabecalhos.Authorization = `Bearer ${conexao.token}`;
  if (conexao.sessionId) cabecalhos["Mcp-Session-Id"] = conexao.sessionId;
  let r: Response;
  try {
    r = await fetch(conexao.url, {
      method: "POST",
      signal: AbortSignal.timeout(60000),
      headers: cabecalhos,
      body: JSON.stringify({ jsonrpc: "2.0", id, method, params: params ?? {} }),
    });
  } catch (err) {
    console.error("Não foi possível conectar ao serviço MCP:", err);
    throw new Error("Não foi possível falar com o serviço. Confira o endereço e tente de novo.");
  }
  if (!r.ok) throw new Error(`O serviço MCP recusou a chamada (${r.status}). Confira a autorização.`);
  if (method === "initialize") conexao.sessionId = r.headers.get("Mcp-Session-Id") || undefined;
  if (id === undefined) return undefined;
  type Envelope = { id?: string; result?: unknown; error?: { message: string } };
  let corpo: Envelope | undefined;
  if (r.headers.get("content-type")?.includes("text/event-stream")) {
    const reader = r.body?.getReader();
    if (!reader) throw new Error("Resposta MCP vazia.");
    const decoder = new TextDecoder();
    let buffer = "";
    try {
      while (!corpo) {
        const part = await reader.read();
        if (part.done) break;
        buffer += decoder.decode(part.value, { stream: true });
        let match: RegExpExecArray | null;
        while ((match = /\r?\n\r?\n/.exec(buffer))) {
          const event = buffer.slice(0, match.index);
          buffer = buffer.slice(match.index + match[0].length);
          const data = event.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n");
          if (!data) continue;
          const message = JSON.parse(data) as Envelope;
          if (message.id === id) { corpo = message; break; }
        }
      }
    } finally { await reader.cancel(); }
  } else corpo = await r.json() as Envelope;
  if (!corpo || corpo.id !== id) throw new Error("O serviço não devolveu a resposta MCP esperada.");
  if (corpo.error) throw new Error("O serviço recusou a chamada. Confira a autorização e os parâmetros.");
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
  const resultado = (await chamarRpc(conexao, "tools/call", { name: nome, arguments: args })) as { isError?: boolean; structuredContent?: unknown; content?: { type: string; text?: string }[] };
  if (resultado.isError) throw new Error("O serviço recusou a operação. Confira os parâmetros e a conta.");
  if (resultado.structuredContent !== undefined) return resultado.structuredContent;
  const texto = resultado.content?.find((c) => c.type === "text")?.text;
  if (texto === undefined) return resultado;
  try {
    return JSON.parse(texto);
  } catch {
    return texto;
  }
}
