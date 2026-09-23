// Transporte MCP de pesquisa (Bright Data e ProspectHalo): inicialização, sessão e respostas JSON ou SSE.
// Isolado do cliente de CRM para preservar integrações existentes.
export type ConexaoMCP = { url: string; token?: string };
export type FerramentaMCP = { nome: string; descricao?: string; schema?: unknown };
type Sessao = { id?: string; protocolo: string };
type RespostaRpc = { id?: number | string | null; result?: unknown; error?: { message: string; code?: number } };
const sessoes = new WeakMap<ConexaoMCP, Promise<Sessao>>();
const PROTOCOLOS = ["2025-03-26", "2025-06-18", "2024-11-05"];
let sequencia = 0;

/** Preserva o status original sem registrar URL, token ou resposta externa nos logs. */
export class ErroMCP extends Error {
  status: number;
  detalhe: string;
  constructor(status: number, detalhe: string) {
    super("Não foi possível completar a chamada ao serviço MCP.");
    this.name = "ErroMCP";
    this.status = status;
    this.detalhe = detalhe;
  }
}

function conferir(corpo: RespostaRpc, id: number): unknown {
  if (corpo.error) throw new ErroMCP(200, corpo.error.message);
  if (corpo.id !== id || !("result" in corpo)) throw new ErroMCP(502, "Resposta MCP inválida.");
  return corpo.result;
}

async function lerResposta(r: Response, id: number): Promise<unknown> {
  if (!r.headers.get("content-type")?.includes("text/event-stream")) {
    let corpo: RespostaRpc;
    try { corpo = await r.json(); } catch { throw new ErroMCP(502, "Resposta MCP inválida."); }
    if (!corpo || typeof corpo !== "object") throw new ErroMCP(502, "Resposta MCP inválida.");
    return conferir(corpo, id);
  }
  if (!r.body) throw new ErroMCP(502, "Resposta MCP vazia.");
  const leitor = r.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { value, done } = await leitor.read();
      buffer += decoder.decode(value, { stream: !done });
      let separador: RegExpExecArray | null;
      while ((separador = /\r?\n\r?\n/.exec(buffer))) {
        const evento = buffer.slice(0, separador.index);
        buffer = buffer.slice(separador.index + separador[0].length);
        const dados = evento.split(/\r?\n/).filter((l) => l.startsWith("data:")).map((l) => l.slice(5).replace(/^ /, "")).join("\n");
        if (!dados) continue;
        let corpo: RespostaRpc;
        try { corpo = JSON.parse(dados); } catch { throw new ErroMCP(502, "Evento MCP inválido."); }
        // Progresso e notificações podem preceder a resposta, sem encerrar o stream.
        if (corpo && corpo.id === id) return conferir(corpo, id);
      }
      if (done) throw new ErroMCP(502, "O serviço encerrou a conexão sem responder.");
    }
  } finally {
    await leitor.cancel().catch(() => {});
    leitor.releaseLock();
  }
}

async function enviar(conexao: ConexaoMCP, method: string, params: Record<string, unknown>, sessao?: Sessao, notificacao = false): Promise<{ resultado: unknown; idSessao?: string }> {
  const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json, text/event-stream" };
  if (conexao.token) headers.Authorization = `Bearer ${conexao.token}`;
  if (sessao?.id) headers["Mcp-Session-Id"] = sessao.id;
  if (sessao) headers["MCP-Protocol-Version"] = sessao.protocolo;
  const id = ++sequencia;
  try {
    const r = await fetch(conexao.url, {
      method: "POST", headers, cache: "no-store", redirect: "error",
      body: JSON.stringify({ jsonrpc: "2.0", ...(notificacao ? {} : { id }), method, params }),
      // A coleta real pode ultrapassar um minuto; controle de sessão deve responder rápido.
      signal: AbortSignal.timeout(method === "tools/call" ? 180000 : 30000),
    });
    if (!r.ok) throw new ErroMCP(r.status, (await r.text()).slice(0, 2000));
    if (notificacao) {
      await r.body?.cancel();
      return { resultado: undefined };
    }
    return { resultado: await lerResposta(r, id), idSessao: r.headers.get("Mcp-Session-Id") || undefined };
  } catch (err) {
    if (err instanceof ErroMCP) throw err;
    if (err instanceof Error && ["TimeoutError", "AbortError"].includes(err.name)) throw new ErroMCP(504, "Tempo limite da consulta MCP excedido.");
    throw new ErroMCP(0, "Falha de conexão com o serviço MCP.");
  }
}

function iniciar(conexao: ConexaoMCP): Promise<Sessao> {
  const existente = sessoes.get(conexao);
  if (existente) return existente;
  const promessa = (async () => {
    const { resultado, idSessao } = await enviar(conexao, "initialize", {
      protocolVersion: PROTOCOLOS[0], capabilities: {}, clientInfo: { name: "prospeccao-ia", version: "0.1.0" },
    });
    const protocolo = (resultado as { protocolVersion?: string } | null)?.protocolVersion;
    if (!protocolo || !PROTOCOLOS.includes(protocolo)) throw new ErroMCP(502, "Versão do protocolo MCP incompatível.");
    const sessao = { id: idSessao, protocolo };
    await enviar(conexao, "notifications/initialized", {}, sessao, true);
    return sessao;
  })();
  sessoes.set(conexao, promessa);
  void promessa.catch(() => { if (sessoes.get(conexao) === promessa) sessoes.delete(conexao); });
  return promessa;
}

async function chamarRpc(conexao: ConexaoMCP, method: string, params: Record<string, unknown> = {}): Promise<unknown> {
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    const sessao = await iniciar(conexao);
    try { return (await enviar(conexao, method, params, sessao)).resultado; }
    catch (err) {
      // 404 com sessão significa sessão expirada. Não repetir ferramentas por falha de rede.
      if (!(err instanceof ErroMCP) || err.status !== 404 || !sessao.id || tentativa > 0) throw err;
      const atual = sessoes.get(conexao);
      if (atual && await atual === sessao && sessoes.get(conexao) === atual) sessoes.delete(conexao);
    }
  }
  throw new ErroMCP(502, "Não foi possível renovar a sessão MCP.");
}

export function conectar(url: string, token?: string): ConexaoMCP { return { url, token }; }

export async function listarFerramentas(conexao: ConexaoMCP): Promise<FerramentaMCP[]> {
  const ferramentas: FerramentaMCP[] = [];
  const cursores = new Set<string>();
  let cursor: string | undefined;
  do {
    const resultado = await chamarRpc(conexao, "tools/list", cursor ? { cursor } : {}) as { tools?: { name: string; description?: string; inputSchema?: unknown }[]; nextCursor?: string };
    if (!Array.isArray(resultado?.tools)) throw new ErroMCP(502, "Lista de ferramentas MCP inválida.");
    ferramentas.push(...resultado.tools.map((t) => ({ nome: t.name, descricao: t.description, schema: t.inputSchema })));
    cursor = resultado.nextCursor;
    if (cursor && cursores.has(cursor)) throw new ErroMCP(502, "Paginação MCP inválida.");
    if (cursor) cursores.add(cursor);
  } while (cursor);
  return ferramentas;
}

export async function chamar(conexao: ConexaoMCP, nome: string, args: Record<string, unknown>): Promise<unknown> {
  const resultado = await chamarRpc(conexao, "tools/call", { name: nome, arguments: args }) as { isError?: boolean; structuredContent?: unknown; content?: { type: string; text?: string }[] };
  const texto = resultado.content?.filter((c) => c.type === "text").map((c) => c.text ?? "").join("\n");
  if (resultado.isError) throw new ErroMCP(200, texto || "A ferramenta MCP falhou.");
  if (resultado.structuredContent !== undefined) return resultado.structuredContent;
  if (!texto) return resultado;
  try { return JSON.parse(texto); } catch { /* O MCP hospedado pode envolver JSON em marcadores. */ }
  // Extrai dados apenas de um envelope completo com o mesmo id no aviso e nos dois marcadores.
  // Remove metadados do transporte para que o aviso não vire o resumo da empresa.
  const envelope = texto.match(/^SECURITY NOTICE:[^\r\n]*\(id ([a-f0-9]{32})\)[^\r\n]*\r?\n=====UNTRUSTED_\1_BEGIN=====\r?\n([\s\S]*)\r?\n=====UNTRUSTED_\1_END=====\s*$/);
  if (envelope) {
    try { return JSON.parse(envelope[2]); } catch { return envelope[2]; }
  }
  return texto;
}
