import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { CHATGPT_TOOL_CONFIG } from "./chatgpt";

// Real pinned App Server + local Responses fixture. No account, key or external request.
// code_mode_only models must reach the dynamic callback even with environments: [].
for (const enabled of [false, true]) {
  test(
    `App Server real: host ${enabled ? "habilitado executa leitura" : "desabilitado reproduz bloqueio"}`,
    { timeout: 15000 },
    async () => {
      const home = mkdtempSync(join(tmpdir(), "daily-executor-"));
      let requests = 0;
      let callbacks = 0;
      let finalInput = "";
      const server = createServer(async (req, res) => {
        let body = "";
        for await (const chunk of req) body += chunk;
        const data = JSON.parse(body);
        requests++;
        if (requests === 2) finalInput = JSON.stringify(data.input);
        res.writeHead(200, { "Content-Type": "text/event-stream" });
        const emit = (type: string, value: unknown) =>
          res.write(
            `event: ${type}\ndata: ${JSON.stringify({ type, ...(value as object) })}\n\n`,
          );
        const output =
          requests === 1
            ? {
                id: "fc_1",
                type: "custom_tool_call",
                call_id: "call_1",
                name: "exec",
                input:
                  'if (typeof process !== "undefined" || typeof require !== "undefined" || typeof tools.exec_command !== "undefined") throw Error("Unexpected machine access"); const r = await tools.collect_0({channel:"C04KTMS2GEL",limit:4}); text(r);',
                status: "completed",
              }
            : {
                id: "msg_2",
                type: "message",
                role: "assistant",
                content: [
                  {
                    type: "output_text",
                    text: "Fim da coleta.",
                    annotations: [],
                  },
                ],
                status: "completed",
              };
        emit("response.created", {
          response: {
            id: `resp_${requests}`,
            object: "response",
            status: "in_progress",
            output: [],
          },
        });
        emit("response.output_item.added", { output_index: 0, item: output });
        emit("response.output_item.done", { output_index: 0, item: output });
        emit("response.completed", {
          response: {
            id: `resp_${requests}`,
            object: "response",
            status: "completed",
            output: [output],
            usage: { input_tokens: 10, output_tokens: 10, total_tokens: 20 },
          },
        });
        res.end();
      });
      server.listen(0, "127.0.0.1");
      await once(server, "listening");
      const port = (server.address() as { port: number }).port;
      const config = {
        ...CHATGPT_TOOL_CONFIG,
        "features.code_mode_host": enabled,
        "features.code_mode_only": true,
        cli_auth_credentials_store: "file",
        model: "contract-fixture",
        model_provider: "fixture",
        "model_providers.fixture.name": "Fixture",
        "model_providers.fixture.base_url": `http://127.0.0.1:${port}/v1`,
        "model_providers.fixture.wire_api": "responses",
        "model_providers.fixture.requires_openai_auth": false,
      };
      const child = spawn(
        process.execPath,
        [
          join(process.cwd(), "node_modules/@openai/codex/bin/codex.js"),
          "app-server",
          "--listen",
          "stdio://",
          ...Object.entries(config).flatMap(([key, value]) => [
            "-c",
            `${key}=${JSON.stringify(value)}`,
          ]),
        ],
        {
          cwd: home,
          env: {
            PATH: process.env.PATH,
            HOME: home,
            CODEX_HOME: home,
            LANG: "en_US.UTF-8",
            NODE_ENV: "test",
          },
          stdio: "pipe",
        },
      );
      child.stderr.resume();
      let sequence = 0;
      const pending = new Map<
        number,
        { resolve: (value: unknown) => void; reject: (e: Error) => void }
      >();
      const send = (value: unknown) =>
        child.stdin.write(JSON.stringify(value) + "\n");
      const rpc = <T = unknown>(method: string, params: unknown): Promise<T> =>
        new Promise((resolve, reject) => {
          const id = ++sequence;
          pending.set(id, { resolve: (value) => resolve(value as T), reject });
          send({ id, method, params });
        });
      let finish!: () => void;
      const completed = new Promise<void>((resolve) => {
        finish = resolve;
      });
      const lines = createInterface({ input: child.stdout });
      lines.on("line", (line) => {
        const m = JSON.parse(line);
        if (m.id !== undefined && !m.method) {
          const p = pending.get(m.id);
          pending.delete(m.id);
          if (m.error) p?.reject(new Error(m.error.message));
          else p?.resolve(m.result);
        } else if (m.id !== undefined && m.method === "item/tool/call") {
          callbacks++;
          assert.equal(m.params.tool, "collect_0");
          assert.deepEqual(m.params.arguments, {
            channel: "C04KTMS2GEL",
            limit: 4,
          });
          send({
            id: m.id,
            result: {
              contentItems: [{ type: "inputText", text: "four messages" }],
              success: true,
            },
          });
        } else if (m.id !== undefined && m.method) {
          send({
            id: m.id,
            error: { code: -32601, message: "Unsupported operation" },
          });
        } else if (m.method === "turn/completed") finish();
      });
      const timeout = setTimeout(() => {
        child.kill();
        finish();
      }, 10000);
      try {
        await rpc("initialize", {
          clientInfo: { name: "daily_executor_contract", version: "1.0" },
          capabilities: { experimentalApi: true },
        });
        send({ method: "initialized" });
        const r = await rpc<{ thread: { id: string } }>("thread/start", {
          cwd: home,
          approvalPolicy: "never",
          sandbox: "read-only",
          ephemeral: true,
          environments: [],
          baseInstructions: "Use only supplied tools.",
          dynamicTools: [
            {
              type: "function",
              name: "collect_0",
              description: "Read Slack messages",
              inputSchema: {
                type: "object",
                properties: {
                  channel: { type: "string" },
                  limit: { type: "integer" },
                },
              },
              deferLoading: false,
            },
          ],
        });
        await rpc("turn/start", {
          threadId: r.thread.id,
          input: [{ type: "text", text: "Read four Slack messages" }],
          environments: [],
        });
        await completed;
        assert.equal(requests, 2, "executor returned its result to the model");
        assert.equal(callbacks, enabled ? 1 : 0);
        assert.match(
          finalInput,
          enabled ? /four messages/ : /code-mode host is disabled/,
        );
      } finally {
        clearTimeout(timeout);
        const exited =
          child.exitCode === null ? once(child, "exit") : Promise.resolve();
        child.kill();
        await exited;
        lines.close();
        server.closeAllConnections();
        await new Promise<void>((resolve) => server.close(() => resolve()));
        rmSync(home, { recursive: true, force: true });
      }
    },
  );
}
