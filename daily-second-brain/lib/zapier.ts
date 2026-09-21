import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { getConfig } from "./store";
import { BrainError } from "./api";
import { actions, db, propose, save } from "./brain";
import type { AgentTool } from "./chatgpt";
export function validateZapier(value: string) {
  let u: URL;
  try {
    u = new URL(value);
  } catch {
    throw new BrainError("Cole a URL do servidor Zapier MCP.");
  }
  if (
    u.protocol !== "https:" ||
    !["mcp.zapier.com", "actions.zapier.com"].includes(u.hostname) ||
    u.username ||
    u.password ||
    (u.port && u.port !== "443")
  )
    throw new BrainError("Use a URL HTTPS fornecida pelo Zapier MCP.");
  return u.toString();
}
export async function zapierClient(signal?: AbortSignal) {
  const url = getConfig("ZAPIER_MCP_URL");
  if (!url) throw new BrainError("Conecte o Zapier em Conexões.");
  const token = getConfig("ZAPIER_MCP_TOKEN");
  const c = new Client({ name: "daily-second-brain", version: "1.1.1" });
  try {
    await c.connect(
      new StreamableHTTPClientTransport(new URL(validateZapier(url)), {
        requestInit: {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          redirect: "error",
        },
        fetch: (input, init) =>
          fetch(input, {
            ...init,
            signal: AbortSignal.any([
              AbortSignal.timeout(30000),
              ...(signal ? [signal] : []),
              ...(init?.signal ? [init.signal] : []),
            ]),
          }),
      }),
    );
    return c;
  } catch {
    await c.close().catch(() => {});
    throw new BrainError(
      "Não foi possível conectar ao Zapier. Confira a URL, o token e as ferramentas habilitadas.",
      502,
    );
  }
}
export async function listTools() {
  const c = await zapierClient();
  try {
    const all = [];
    let cursor: string | undefined;
    do {
      const r = await c.listTools({ cursor });
      all.push(...r.tools);
      cursor = r.nextCursor;
    } while (cursor && all.length < 50);
    return all.slice(0, 50);
  } finally {
    await c.close();
  }
}
export async function agentTools(): Promise<AgentTool[]> {
  if (!getConfig("ZAPIER_MCP_URL")) return [];
  return (await listTools()).map((t, i) => ({
    name: `zapier_${i}`,
    description: `${t.name}: ${(t.description || "").slice(0, 1200)}. Prepara uma ação para confirmação humana; NÃO executa imediatamente.`,
    schema: t.inputSchema,
    call: async (args) => {
      if (!args || typeof args !== "object" || Array.isArray(args))
        throw new BrainError("Argumentos inválidos.");
      const action = propose(t.name, args as Record<string, unknown>);
      return JSON.stringify({
        pending: true,
        id: action.id,
        message:
          "Aguardando confirmação do usuário. Não afirme que a ação foi executada.",
      });
    },
  }));
}
export async function execute(id: string) {
  const a = actions().find((a) => a.id === id);
  if (!a) throw new BrainError("Ação não encontrada.", 404);
  const claim = db()
    .prepare(
      "UPDATE actions SET status='running',created=? WHERE id=? AND status='pending'",
    )
    .run(new Date().toISOString(), id);
  if (!claim.changes) throw new BrainError("Essa ação já foi processada.", 409);
  let c: Client | undefined;
  try {
    c = await zapierClient();
    const r = await c.callTool({ name: a.name, arguments: a.args }, undefined, {
      timeout: 60000,
    });
    if (r.isError)
      throw Error(
        "O Zapier informou uma falha. Confira o histórico do serviço antes de tentar novamente.",
      );
    const result = JSON.stringify(r.content, null, 2).slice(0, 90000);
    const n = save({
      kind: "raw",
      title: `Zapier · ${a.name}`.slice(0, 140),
      content: result,
      tags: ["zapier"],
    });
    db()
      .prepare("UPDATE actions SET status='done',result=? WHERE id=?")
      .run(n.id, id);
    return n;
  } catch {
    db()
      .prepare("UPDATE actions SET status='failed',result=? WHERE id=?")
      .run("Confira o histórico no serviço antes de repetir a ação.", id);
    throw new BrainError(
      "Não foi possível concluir. Confira o histórico no Zapier antes de repetir a ação.",
      502,
    );
  } finally {
    await c?.close().catch(() => {});
  }
}
