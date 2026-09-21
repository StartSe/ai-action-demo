// Deterministic provider responses for contract and browser tests. The app
// never imports this module. No real Slack or Zapier account is used.
export function captureProviders(fallback = globalThis.fetch) {
  /** @type {{mode: string, dataCalls: number, toolCalls: Array<{name: string, arguments: Record<string, unknown>}>, aiRequests: Array<{messages: Array<{role: string, content: string}>, tools?: Array<{function: {name: string, description: string}}>}>, failOrganization: boolean, failRead: boolean, gate: Promise<void> | null, unknownRead: boolean}} */
  const state = {
    mode: "managed",
    dataCalls: 0,
    toolCalls: [],
    aiRequests: [],
    failOrganization: false,
    failRead: false,
    gate: null,
    unknownRead: false,
  };
  const messages = [
    {
      ts: "1789980004.000004",
      text: "Decisão: iniciar o piloto na segunda-feira.",
      user: "U1",
    },
    {
      ts: "1789980003.000003",
      text: "Responsável: Ana. Preparar o material até sexta.",
      user: "U2",
    },
    {
      ts: "1789980002.000002",
      text: "Pergunta em aberto: qual será o critério de sucesso?",
      user: "U3",
    },
    {
      ts: "1789980001.000001",
      text: "Conectar o piloto à trilha de aprendizagem.",
      user: "U4",
    },
  ];
  const schema = {
    type: "object",
    properties: { channel: { type: "string" }, limit: { type: "integer" } },
    required: ["channel", "limit"],
  };
  const catalog = () =>
    state.mode === "agentic"
      ? [
          {
            name: "inspect_zapier_actions",
            description: "Inspecionar ações habilitadas",
            inputSchema: { type: "object", properties: {} },
          },
          {
            name: "execute_zapier_read_action",
            description: "Executar leitura de mensagens",
            inputSchema: schema,
          },
          {
            name: "execute_zapier_write_action",
            description: "Enviar uma mensagem",
            inputSchema: schema,
          },
          {
            name: "write_code_action",
            description: "Executar código",
            inputSchema: schema,
          },
        ]
      : [
          {
            name: "slack_channel_history",
            title: "Slack · Ler mensagens do canal",
            description: "Read the most recent messages of a Slack channel.",
            inputSchema: schema,
            ...(state.unknownRead
              ? {}
              : { annotations: { readOnlyHint: true } }),
          },
          {
            name: "slack_send_message",
            description: "Send a message",
            inputSchema: schema,
            annotations: { readOnlyHint: false },
          },
        ];
  const answer = (content) =>
    Response.json({ choices: [{ message: { role: "assistant", content } }] });
  async function fetch(input, init) {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    if (url === "https://openrouter.ai/api/v1/models")
      return Response.json({
        data: [{ id: "test/model", name: "Modelo de teste" }],
      });
    if (url.startsWith("https://mcp.zapier.com/")) {
      if (init?.method !== "POST") return new Response(null, { status: 405 });
      const req = JSON.parse(String(init.body));
      if (req.id === undefined) return new Response(null, { status: 202 });
      let result;
      if (req.method === "initialize")
        result = {
          protocolVersion: req.params.protocolVersion,
          capabilities: { tools: {} },
          serverInfo: { name: "capture-fixture", version: "1" },
        };
      else if (req.method === "tools/list") result = { tools: catalog() };
      else if (req.method === "tools/call") {
        state.toolCalls.push(req.params);
        if (req.params.name === "inspect_zapier_actions")
          result = {
            content: [
              {
                type: "text",
                text: "Slack history is enabled; use channel and limit to read the latest messages.",
              },
            ],
          };
        else {
          if (
            req.params.name.includes("write") ||
            req.params.name.includes("send")
          )
            throw Error("A write tool must never execute in this fixture");
          state.dataCalls++;
          if (state.gate) await state.gate;
          result = state.failRead
            ? {
                isError: true,
                content: [
                  { type: "text", text: "PRIVATE_PROVIDER_ERROR_TOKEN" },
                ],
              }
            : {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify({
                      channel: req.params.arguments.channel,
                      messages: messages.slice(0, req.params.arguments.limit),
                      has_more: true,
                    }),
                  },
                ],
              };
        }
      } else throw Error("Unexpected MCP method: " + req.method);
      return Response.json({ jsonrpc: "2.0", id: req.id, result });
    }
    if (url === "https://openrouter.ai/api/v1/chat/completions") {
      const req = JSON.parse(String(init.body));
      state.aiRequests.push(req);
      if (init.headers.Authorization === "Bearer invalid-test-key")
        return new Response("invalid", { status: 401 });
      if (req.messages[0].content.includes("verificação de conexão"))
        return answer("OK");
      if (req.messages[0].content.includes("Organize a fonte")) {
        if (state.failOrganization) return answer("not JSON");
        const content = req.messages[1].content;
        const sources = JSON.parse(content.slice(content.indexOf('[{"id"')));
        const existing = sources.find(
          (n) => n.kind === "wiki" && n.title === "Decisões de tech-academy",
        );
        return answer(
          JSON.stringify({
            title: "Decisões de tech-academy",
            content:
              "## Decisões\nIniciar o piloto na segunda-feira.\n\n## Responsáveis\nAna prepara o material até sexta.\n\n## Perguntas em aberto\nQual será o critério de sucesso?\n\n## Conexões\nRelacionar com [[Aprendizagem]].\n\nQuatro mensagens do canal tech-academy (C04KTMS2GEL) foram consultadas.",
            tags: ["slack", "piloto"],
            existingId: existing?.id || null,
          }),
        );
      }
      if (req.tools?.length) {
        const history = req.messages.filter((m) => m.role === "tool");
        if (history.some((m) => String(m.content).includes('"error"')))
          return answer(
            JSON.stringify({ complete: false, summary: "A leitura falhou." }),
          );
        const index = state.mode === "agentic" ? history.length : 0;
        if (history.length < (state.mode === "agentic" ? 2 : 1)) {
          const tool = req.tools[index].function;
          const args = tool.description.startsWith("inspect")
            ? {}
            : { channel: "C04KTMS2GEL", limit: 4 };
          return Response.json({
            choices: [
              {
                message: {
                  role: "assistant",
                  content: null,
                  tool_calls: [
                    {
                      id: "call_" + history.length,
                      type: "function",
                      function: {
                        name: tool.name,
                        arguments: JSON.stringify(args),
                      },
                    },
                  ],
                },
              },
            ],
          });
        }
        return answer(
          JSON.stringify({
            complete: true,
            summary:
              "As quatro últimas mensagens de tech-academy foram coletadas, com decisões, responsáveis e dúvidas.",
          }),
        );
      }
      throw Error("Unexpected generation in fixture");
    }
    return fallback(input, init);
  }
  return { state, fetch, messages };
}
