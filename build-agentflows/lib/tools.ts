// Ferramentas do Agente, no espírito do Flowise: um catálogo com ferramentas prontas (sem
// configurar nada) e as ferramentas de cada servidor MCP conectado em Conexões.
//
// Identificadores guardados no bloco: "interno:<nome>" para as prontas e "mcp:<prefixo>:<nome>"
// para as de um servidor. Um nome sem prefixo (fluxos da primeira versão) é o servidor antigo
// "Ferramentas". O nome que o modelo vê é sempre o nome curto da ferramenta.
import type { AgentTool } from "./chatgpt";
import { conexaoMCP, servidoresMCP, whatsappConfigurado, ligacaoConfigurada } from "./conexoes";
import { conectar, chamar, listarFerramentas } from "./mcp-cliente";
import { FlowError, listFlows } from "./flow-store";
export type ToolInfo = { id: string; name: string; description: string; schema: unknown };
export type ToolGroup = { id: string; name: string; kind: "builtin" | "mcp"; tools: ToolInfo[]; error?: string };
type Builtin = ToolInfo & { available?: () => boolean; call: (args: Record<string, unknown>) => Promise<string> };
// --- Calculadora sem eval: números, + - * / % ^ e parênteses. ---------------------------------
export function calculate(expression: string): number {
  const src = expression.replace(/\s+/g, "").replace(/,/g, ".");
  if (!src || !/^[0-9.+\-*/%^()]+$/.test(src)) throw new FlowError("Use apenas números e + - * / % ^ ( ).");
  let i = 0;
  const peek = () => src[i];
  const number = (): number => {
    if (peek() === "(") {
      i++;
      const v = expr();
      if (peek() !== ")") throw new FlowError("Parêntese sem fechar.");
      i++;
      return v;
    }
    if (peek() === "-") {
      i++;
      return -number();
    }
    const m = /^\d*\.?\d+(?:e[+-]?\d+)?/i.exec(src.slice(i));
    if (!m) throw new FlowError("Expressão inválida.");
    i += m[0].length;
    return Number(m[0]);
  };
  const power = (): number => {
    const base = number();
    if (peek() === "^") {
      i++;
      return base ** power();
    }
    return base;
  };
  const term = (): number => {
    let v = power();
    while (peek() === "*" || peek() === "/" || peek() === "%") {
      const op = src[i++];
      const r = power();
      v = op === "*" ? v * r : op === "/" ? v / r : v % r;
    }
    return v;
  };
  const expr = (): number => {
    let v = term();
    while (peek() === "+" || peek() === "-") {
      const op = src[i++];
      const r = term();
      v = op === "+" ? v + r : v - r;
    }
    return v;
  };
  const v = expr();
  if (i !== src.length) throw new FlowError("Expressão inválida.");
  if (!Number.isFinite(v)) throw new FlowError("O resultado não é um número válido.");
  return v;
}
// Endereços internos da rede não podem ser alcançados a partir de uma ferramenta do agente.
export function isPrivateHost(host: string) {
  const h = host.toLowerCase();
  return (
    h === "localhost" ||
    h.endsWith(".local") ||
    h.endsWith(".internal") ||
    /^(127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h) ||
    h === "::1" ||
    h.startsWith("[")
  );
}
export async function fetchText(url: string, method = "GET", body?: string) {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new FlowError("Endereço inválido.");
  }
  if (!["https:", "http:"].includes(u.protocol) || u.username || u.password || isPrivateHost(u.hostname))
    throw new FlowError("Este endereço não pode ser acessado pelo agente.");
  const res = await fetch(u, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: method === "GET" ? undefined : body,
    signal: AbortSignal.timeout(30000),
    redirect: "error",
  });
  const text = (await res.text()).slice(0, 100000);
  if (!res.ok) throw new FlowError(`O serviço respondeu com erro ${res.status}.`);
  return text;
}
const BUILTIN: Builtin[] = [
  {
    id: "interno:data_hora",
    name: "data_hora",
    description: "Informa a data e a hora atuais no Brasil.",
    schema: { type: "object", properties: {} },
    call: async () => {
      const now = new Date();
      return JSON.stringify({
        iso: now.toISOString(),
        brasil: now.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "full", timeStyle: "short" }),
      });
    },
  },
  {
    id: "interno:calculadora",
    name: "calculadora",
    description: "Calcula uma expressão matemática (ex.: (1200*0.15)+80).",
    schema: { type: "object", properties: { expressao: { type: "string" } }, required: ["expressao"] },
    call: async (a) => String(calculate(String(a.expressao ?? ""))),
  },
  {
    id: "interno:requisicao_http",
    name: "requisicao_http",
    description: "Consulta ou envia dados a um endereço público na internet (GET ou POST com JSON).",
    schema: {
      type: "object",
      properties: {
        url: { type: "string" },
        method: { type: "string", enum: ["GET", "POST"] },
        body: { type: "string", description: "JSON enviado no POST" },
      },
      required: ["url"],
    },
    call: async (a) => fetchText(String(a.url ?? ""), a.method === "POST" ? "POST" : "GET", a.body ? String(a.body) : undefined),
  },
  {
    id: "interno:executar_fluxo",
    name: "executar_fluxo",
    description: "Executa outro fluxo publicado desta instalação e devolve a resposta dele.",
    schema: {
      type: "object",
      properties: { fluxo: { type: "string", description: "nome ou identificador do fluxo" }, entrada: { type: "string" } },
      required: ["fluxo", "entrada"],
    },
    call: async (a) => {
      const { startRun } = await import("./flow-runtime");
      const alvo = String(a.fluxo ?? "");
      const f = listFlows().find((f) => f.published && (f.id === alvo || f.name.toLowerCase() === alvo.toLowerCase()));
      if (!f) throw new FlowError("Fluxo publicado não encontrado.");
      const r = await startRun(f.id, String(a.entrada ?? ""), true);
      return JSON.stringify({ status: r.status, output: r.output, error: r.error, id: r.id });
    },
  },
  {
    id: "interno:enviar_whatsapp",
    name: "enviar_whatsapp",
    description: "Envia uma mensagem de WhatsApp para um número (DDI+DDD+número).",
    schema: { type: "object", properties: { para: { type: "string" }, mensagem: { type: "string" } }, required: ["para", "mensagem"] },
    available: whatsappConfigurado,
    call: async (a) => {
      const { enviarMensagem } = await import("./whatsapp");
      await enviarMensagem(String(a.para ?? ""), String(a.mensagem ?? ""));
      return "Mensagem enviada.";
    },
  },
  {
    id: "interno:ligar_por_voz",
    name: "ligar_por_voz",
    description: "Faz uma ligação telefônica por voz com o agente de conversa, passando contexto para a conversa.",
    schema: {
      type: "object",
      properties: { telefone: { type: "string" }, contexto: { type: "string", description: "o que o agente deve saber e fazer" } },
      required: ["telefone"],
    },
    available: ligacaoConfigurada,
    call: async (a) => {
      const { ligar } = await import("./elevenlabs");
      const r = await ligar(String(a.telefone ?? ""), String(a.contexto ?? ""));
      return JSON.stringify(r);
    },
  },
];
export function builtinTools(): ToolInfo[] {
  return BUILTIN.filter((t) => !t.available || t.available()).map(({ id, name, description, schema }) => ({ id, name, description, schema }));
}
export function toolShortName(id: string) {
  return id.split(":").pop() || id;
}
// Catálogo para o diálogo do Agente: ferramentas prontas e um grupo por servidor conectado.
export async function listTools(): Promise<ToolGroup[]> {
  const groups: ToolGroup[] = [{ id: "interno", name: "Ferramentas prontas", kind: "builtin", tools: builtinTools() }];
  for (const s of servidoresMCP()) {
    const group: ToolGroup = { id: "mcp:" + s.prefixo, name: s.nome, kind: "mcp", tools: [] };
    try {
      const c = await conexaoMCP(s.prefixo);
      if (!c) throw new Error("Autorize este servidor em Conexões.");
      group.tools = (await listarFerramentas(conectar(c.url, c.token))).map((t) => ({
        id: `mcp:${s.prefixo}:${t.nome}`,
        name: t.nome,
        description: t.descricao || t.nome,
        schema: t.schema || { type: "object", properties: {} },
      }));
    } catch (err) {
      group.error = err instanceof Error ? err.message : "Não foi possível listar as ferramentas.";
    }
    groups.push(group);
  }
  return groups;
}
export function normalizeToolId(id: string) {
  return id.includes(":") ? id : `mcp:FERRAMENTAS:${id}`;
}
// Ferramentas prontas para o modelo, a partir dos identificadores marcados no bloco.
export async function resolveTools(ids: string[]): Promise<AgentTool[]> {
  const wanted = [...new Set(ids.map((s) => s.trim()).filter(Boolean).map(normalizeToolId))];
  const out: AgentTool[] = [];
  const byServer = new Map<string, string[]>();
  for (const id of wanted) {
    if (id.startsWith("interno:")) {
      const b = BUILTIN.find((t) => t.id === id);
      if (!b || (b.available && !b.available()))
        throw new FlowError(`A ferramenta “${toolShortName(id)}” não está disponível. Confira em Conexões.`);
      out.push({ name: b.name, description: b.description, schema: b.schema, call: (args) => b.call((args || {}) as Record<string, unknown>) });
      continue;
    }
    const [, prefix, ...rest] = id.split(":");
    byServer.set(prefix, [...(byServer.get(prefix) || []), rest.join(":")]);
  }
  for (const [prefix, names] of byServer) {
    const c = await conexaoMCP(prefix).catch(() => undefined);
    if (!c) throw new FlowError("Um servidor de ferramentas do bloco não está conectado. Confira em Conexões.");
    const conn = conectar(c.url, c.token);
    const remote = await listarFerramentas(conn);
    for (const name of names) {
      const t = remote.find((r) => r.nome === name);
      if (!t) throw new FlowError(`A ferramenta “${name}” não está disponível. Confira os nomes.`);
      out.push({
        name: t.nome,
        description: t.descricao || t.nome,
        schema: t.schema || { type: "object", properties: {} },
        call: async (args) => {
          const result = await chamar(conn, t.nome, (args || {}) as Record<string, unknown>);
          return (typeof result === "string" ? result : JSON.stringify(result)).slice(0, 30000);
        },
      });
    }
  }
  return out;
}
export async function callTool(id: string, args: unknown) {
  const [tool] = await resolveTools([id]);
  if (!tool) throw new FlowError("Escolha a ferramenta a executar.");
  return tool.call(args);
}
