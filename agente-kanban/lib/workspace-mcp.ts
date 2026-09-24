import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { getConfig, setConfig } from "./store";
import { getDoc, putDoc } from "./workspace-store";
import { WorkspaceError } from "./workspace-schema";
import type { ConnectedTool } from "./workspace-types";
import { trelloConfigurado } from "./quadro";
import { trello } from "./trello";
import { effectiveTools } from "./workspace-tools";

export function validateZapierUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new WorkspaceError(
      "Cole a URL de conexão fornecida pelo Zapier MCP.",
    );
  }
  if (
    url.protocol !== "https:" ||
    url.hostname !== "mcp.zapier.com" ||
    url.username ||
    url.password ||
    url.port
  )
    throw new WorkspaceError("Use uma URL HTTPS de mcp.zapier.com.");
  return url;
}
export function configuredTools(): ConnectedTool[] {
  const saved = getDoc<ConnectedTool[]>("settings", "tools") || [];
  const tools = saved.filter((t) => t.name !== "orbit_trello_board");
  if (trelloConfigurado())
    tools.push({
      name: "orbit_trello_board",
      description:
        "Consulta o quadro do Trello configurado em Configurações avançadas, incluindo listas, IDs estáveis dos cartões, responsáveis e prazos.",
      schema: { type: "object", properties: {}, additionalProperties: false },
      access:
        saved.find((t) => t.name === "orbit_trello_board")?.access || "read",
      readOnly: true,
    });
  return effectiveTools(tools);
}

export async function withZapier<T>(
  fn: (client: Client) => Promise<T>,
  url = getConfig("ZAPIER_MCP_URL"),
): Promise<T> {
  if (!url)
    throw new WorkspaceError(
      "Conecte o Zapier para consultar as ferramentas do time.",
    );
  const client = new Client({ name: "orbit-kanban", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(validateZapierUrl(url), {
    requestInit: { signal: AbortSignal.timeout(45000), redirect: "error" },
  });
  try {
    await client.connect(transport);
    return await fn(client);
  } finally {
    await client.close().catch(() => {});
  }
}

export async function discoverTools(url?: string) {
  const fixedUrl = process.env.ZAPIER_MCP_URL?.trim();
  if (url && fixedUrl && url !== fixedUrl)
    throw new WorkspaceError(
      "A conexão do Zapier está definida no ambiente do servidor. Atualize ZAPIER_MCP_URL para trocar de servidor.",
    );
  const tools = await withZapier(async (client) => {
    const result: ConnectedTool[] = [];
    let cursor: string | undefined;
    do {
      const page = await client.listTools({ cursor });
      for (const tool of page.tools)
        result.push({
          name: tool.name,
          description: tool.description || tool.name,
          schema: tool.inputSchema,
          access: "disabled",
          readOnly: tool.annotations?.readOnlyHint,
        });
      cursor = page.nextCursor;
      if (result.length > 500)
        throw new WorkspaceError(
          "Selecione até 500 ferramentas no servidor Zapier.",
        );
    } while (cursor);
    return result;
  }, url);
  // New server means new authorization; never carry permissions to a different connection.
  const same = !url || url === getConfig("ZAPIER_MCP_URL");
  const previous = same
    ? getDoc<ConnectedTool[]>("settings", "tools") || []
    : [];
  const result = tools.map((tool) => {
    const old = previous.find((t) => t.name === tool.name);
    const access = old?.requiredBy?.length
      ? "disabled"
      : old?.access || "disabled";
    return {
      ...tool,
      access:
        access === "read" && tool.readOnly === false
          ? ("disabled" as const)
          : access,
      messageField: old?.messageField,
      recipientField: old?.recipientField,
    };
  });
  if (url) setConfig("ZAPIER_MCP_URL", url);
  putDoc("settings", "tools", result);
  return result;
}
export async function callZapier(
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  if (name === "orbit_trello_board") {
    if (!trelloConfigurado())
      throw new WorkspaceError("O quadro do Trello foi desconectado.");
    return trello.obterQuadro();
  }
  return withZapier(async (client) => {
    const result = await client.callTool({ name, arguments: args }, undefined, {
      timeout: 45000,
    });
    if (result.isError)
      throw new WorkspaceError(
        `A ferramenta ${name} não concluiu a consulta. Revise sua configuração no Zapier.`,
        502,
      );
    return result;
  });
}
