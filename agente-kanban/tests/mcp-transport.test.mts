import { after, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const directory = mkdtempSync(path.join(tmpdir(), "orbit-mcp-test-"));
process.env.DATA_DIR = directory;
delete process.env.ZAPIER_MCP_URL;
const { discoverTools, callZapier } = await import("../lib/workspace-mcp");
const { getConfig } = await import("../lib/store");
const { putDoc } = await import("../lib/workspace-store");
after(() => rmSync(directory, { recursive: true, force: true }));

test("MCP negotiates a session, paginates discovery and accepts SSE tool results", async () => {
  const originalFetch = globalThis.fetch;
  const methods: string[] = [];
  let failTool = false;
  let mutating = false;
  globalThis.fetch = async (input, init) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    assert.equal(new URL(url).hostname, "mcp.zapier.com");
    if (init?.method === "GET") return new Response(null, { status: 405 });
    const request = JSON.parse(String(init?.body));
    methods.push(request.method);
    if (request.method === "notifications/initialized")
      return new Response(null, { status: 202 });
    const headers = new Headers(init?.headers);
    assert.match(headers.get("accept") || "", /text\/event-stream/);
    let result;
    if (request.method === "initialize")
      result = {
        protocolVersion: request.params.protocolVersion,
        capabilities: { tools: {} },
        serverInfo: { name: "fixture", version: "1.0" },
      };
    else {
      assert.equal(headers.get("mcp-session-id"), "fixture-session");
      if (request.method === "tools/list")
        result = {
          tools: [
            {
              name: request.params.cursor ? "slack_read" : "trello_read",
              description: "Read fixture",
              inputSchema: { type: "object", properties: {} },
              annotations: {
                readOnlyHint: Boolean(request.params.cursor) || !mutating,
              },
            },
          ],
          ...(request.params.cursor ? {} : { nextCursor: "page2" }),
        };
      else if (request.method === "tools/call") {
        const payload = {
          jsonrpc: "2.0",
          id: request.id,
          result: {
            content: [{ type: "text", text: "Atualização do time" }],
            isError: failTool,
          },
        };
        return new Response(
          `event: message\ndata: ${JSON.stringify(payload)}\n\n`,
          { headers: { "Content-Type": "text/event-stream" } },
        );
      } else throw new Error(`Unexpected MCP method: ${request.method}`);
    }
    return Response.json(
      { jsonrpc: "2.0", id: request.id, result },
      { headers: { "Mcp-Session-Id": "fixture-session" } },
    );
  };
  try {
    const tools = await discoverTools("https://mcp.zapier.com/fixture/mcp");
    assert.deepEqual(
      tools.map((t) => t.name),
      ["trello_read", "slack_read"],
    );
    assert.ok(tools.every((t) => t.access === "disabled"));
    assert.ok(tools.every((t) => t.readOnly === true));
    assert.equal(
      getConfig("ZAPIER_MCP_URL"),
      "https://mcp.zapier.com/fixture/mcp",
    );
    assert.ok(methods.includes("initialize"));
    assert.equal(methods.filter((m) => m === "tools/list").length, 2);
    const result = await callZapier("slack_read", {});
    assert.match(JSON.stringify(result), /Atualização do time/);
    failTool = true;
    await assert.rejects(callZapier("slack_read", {}), /não concluiu/);
    putDoc(
      "settings",
      "tools",
      tools.map((tool) => ({ ...tool, access: "read" })),
    );
    mutating = true;
    const refreshed = await discoverTools();
    assert.equal(
      refreshed.find((tool) => tool.name === "trello_read")!.access,
      "disabled",
    );
    assert.equal(
      refreshed.find((tool) => tool.name === "slack_read")!.access,
      "read",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
