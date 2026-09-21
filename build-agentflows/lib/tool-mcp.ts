import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import type { AgentTool } from "./chatgpt";
import { FlowError } from "./flow-store";
async function connect(url: string, token?: string) {
  const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
  const options = { requestInit: { headers, redirect: "error" as const }, fetch: (input: string | URL | Request, init?: RequestInit) => fetch(input, { ...init, signal: AbortSignal.any([...(init?.signal ? [init.signal] : []), AbortSignal.timeout(30000)]) }) };
  let client = new Client({ name: "build-agentflows", version: "0.5.0" });
  try { await client.connect(new StreamableHTTPClientTransport(new URL(url), options)); }
  catch {
    await client.close().catch(() => {});
    client = new Client({ name: "build-agentflows", version: "0.5.0" });
    try { await client.connect(new SSEClientTransport(new URL(url), options)); }
    catch { await client.close().catch(() => {}); throw new FlowError("Não foi possível conectar ao servidor de ferramentas. Confira a credencial e suas permissões."); }
  }
  return client;
}
export async function remoteTools(prefix: string, url: string, token?: string): Promise<AgentTool[]> {
  const client = await connect(url, token);
  const definitions = [];
  try {
    let cursor: string | undefined;
    do { const page = await client.listTools({ cursor }); definitions.push(...page.tools); cursor = page.nextCursor; } while (cursor && definitions.length < 100);
  } finally { await client.close(); }
  return definitions.slice(0, 100).map((tool) => ({
    name: `${prefix}_${tool.name}`.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64), description: tool.description || tool.name, schema: tool.inputSchema,
    call: async (args) => {
      const session = await connect(url, token);
      try {
        const result = await session.callTool({ name: tool.name, arguments: (args || {}) as Record<string, unknown> });
        if (result.isError) throw new FlowError("O servidor não conseguiu executar a ferramenta. Confira os argumentos e permissões.");
        return JSON.stringify(result.content).slice(0, 50000);
      } finally { await session.close(); }
    },
  }));
}
