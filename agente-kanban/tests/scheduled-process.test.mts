import { after, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Feedback, Routine, Skill, Task } from "../lib/workspace-types";

const directory = mkdtempSync(path.join(tmpdir(), "orbit-process-test-"));
process.env.DATA_DIR = directory;
for (const key of [
  "OPENROUTER_API_KEY",
  "OPENROUTER_MODEL",
  "KANBAN_AI_PROVIDER",
  "ZAPIER_MCP_URL",
  "TRELLO_API_TOKEN",
  "TRELLO_BOARD_ID",
])
  delete process.env[key];
const store = await import("../lib/workspace-store");
const { setConfig } = await import("../lib/store");
const { designProcess, runDueRoutines } = await import(
  "../lib/workspace-agent"
);
const { discoverTools } = await import("../lib/workspace-mcp");
after(() => rmSync(directory, { recursive: true, force: true }));

type AgentContext = {
  skill: Skill;
  tasks: Task[];
  corrections: Feedback[];
  observations: {
    id: string;
    tool: string;
    result: { content: { text: string }[] };
  }[];
  outcomes: { action?: string; error?: string }[];
};

test("a generated process runs on schedule through both gateways, joins board and conversation evidence, and carries human learning into its next run", async () => {
  // Only the HTTP boundary is simulated. Process generation, publication, scheduling,
  // OpenRouter requests, MCP sessions, the action engine and SQLite are production code.
  const originalFetch = globalThis.fetch;
  const sourceId = "card-onboarding-42";
  const objective = "Reduzir o tempo de ativação dos clientes.";
  const learning =
    "Preserve a validação humana de conclusão quando as fontes ainda não foram atualizadas.";
  let failConversation = false;
  let generationCalls = 0;
  let executionCalls = 0;
  let learnedContexts = 0;
  const toolCalls: string[] = [];
  const board = {
    id: sourceId,
    title: "Validar onboarding",
    status: "todo",
    assignee: "Ana",
    due: "2026-10-02",
  };
  const conversation = {
    cardId: sourceId,
    author: "Ana",
    contact: "U-ANA",
    text: "Comecei a validação do onboarding. A nova previsão é 2026-10-05.",
  };
  const modelResponse = (value: unknown) =>
    Response.json({
      choices: [{ message: { content: JSON.stringify(value) } }],
    });

  globalThis.fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url === "https://openrouter.ai/api/v1/chat/completions") {
      assert.equal(
        new Headers(init?.headers).get("authorization"),
        "Bearer fixture-process-key",
      );
      const body = JSON.parse(String(init?.body));
      const context = JSON.parse(body.messages[1].content);
      if (context.process) {
        generationCalls++;
        assert.equal(context.current.objective, objective);
        assert.deepEqual(
          context.tools.map((tool: { name: string }) => tool.name),
          ["board_read", "conversation_read"],
        );
        return modelResponse({
          skill: { ...context.current, process: context.process },
          routines: [
            {
              name: "Consolidar board e conversas",
              prompt:
                "Leia o board de onboarding e as conversas do time. Relacione as atualizações pelo ID da atividade e siga o objetivo do ciclo.",
              frequency: "daily",
              time: "00:00",
              weekday: 1,
              timezone: "UTC",
              enabled: false,
              tools: ["board_read", "conversation_read"],
            },
          ],
        });
      }
      executionCalls++;
      const agent = context as AgentContext;
      assert.equal(agent.skill.objective, objective);
      assert.ok(
        agent.outcomes.every((outcome) => !outcome.error || failConversation),
      );
      if (agent.outcomes.some((outcome) => outcome.error))
        return modelResponse({
          action: "finish",
          summary:
            "Não foi possível consultar as conversas. O quadro foi preservado.",
        });
      if (!agent.observations.length)
        return modelResponse({
          action: "read",
          tool: "board_read",
          arguments: {},
        });
      if (agent.observations.length === 1)
        return modelResponse({
          action: "read",
          tool: "conversation_read",
          arguments: { channel: "time-onboarding" },
        });
      assert.deepEqual(
        agent.observations.map((observation) => observation.tool),
        ["board_read", "conversation_read"],
      );
      assert.deepEqual(
        JSON.parse(agent.observations[0].result.content[0].text),
        board,
      );
      assert.deepEqual(
        JSON.parse(agent.observations[1].result.content[0].text),
        conversation,
      );
      const existing = agent.tasks.find((task) => task.sourceId === sourceId);
      if (!existing)
        return modelResponse({
          action: "create",
          task: {
            title: board.title,
            status: "doing",
            priority: "high",
            assignee: board.assignee,
            contact: conversation.contact,
            due: "2026-10-05",
            source: "Trello",
            sourceId,
            project: agent.skill.cycle,
          },
          evidence: agent.observations.map((observation) => observation.id),
          reason:
            "Ana confirmou nas conversas o início da validação e uma nova previsão para a mesma atividade do board.",
        });
      if (existing.actor === "human") {
        learnedContexts++;
        assert.equal(existing.status, "done");
        assert.match(agent.skill.instructions, /Preserve a validação humana/);
        assert.ok(
          agent.corrections.some(
            (correction) =>
              correction.taskId === existing.id &&
              correction.rule === learning &&
              correction.incorporated,
          ),
        );
      }
      return modelResponse({
        action: "finish",
        summary: `Onboarding acompanhado para o objetivo: ${objective}`,
      });
    }
    assert.equal(
      new URL(url).hostname,
      "mcp.zapier.com",
      "Unexpected external request must never reach the network",
    );
    if (init?.method === "GET") return new Response(null, { status: 405 });
    const rpc = JSON.parse(String(init?.body));
    if (rpc.method === "notifications/initialized")
      return new Response(null, { status: 202 });
    let result: unknown;
    if (rpc.method === "initialize")
      result = {
        protocolVersion: rpc.params.protocolVersion,
        capabilities: { tools: {} },
        serverInfo: { name: "isolated-process-fixture", version: "1.0" },
      };
    else {
      assert.equal(
        new Headers(init?.headers).get("mcp-session-id"),
        "fixture-process-session",
      );
      if (rpc.method === "tools/list")
        result = {
          tools: ["board_read", "conversation_read"].map((name) => ({
            name,
            description: "Read-only fixture source",
            inputSchema: { type: "object", properties: {} },
          })),
        };
      else {
        assert.equal(rpc.method, "tools/call");
        assert.ok(
          ["board_read", "conversation_read"].includes(rpc.params.name),
        );
        toolCalls.push(rpc.params.name);
        if (rpc.params.name === "conversation_read")
          assert.equal(rpc.params.arguments.channel, "time-onboarding");
        result = {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                rpc.params.name === "board_read" ? board : conversation,
              ),
            },
          ],
          isError: failConversation && rpc.params.name === "conversation_read",
        };
      }
    }
    return Response.json(
      { jsonrpc: "2.0", id: rpc.id, result },
      { headers: { "Mcp-Session-Id": "fixture-process-session" } },
    );
  };

  try {
    store.initializeWorkspace();
    const initial = store.getSkill();
    store.saveSkill({ ...initial, objective }, initial.version);
    setConfig("OPENROUTER_API_KEY", "fixture-process-key");
    const discovered = await discoverTools(
      "https://mcp.zapier.com/fixture-process/mcp",
    );
    assert.ok(discovered.every((tool) => tool.access === "disabled"));
    store.putDoc(
      "settings",
      "tools",
      discovered.map((tool) => ({ ...tool, access: "read" })),
    );
    const proposal = await designProcess(
      "Leia diariamente o board de onboarding e as conversas no canal time-onboarding. Cruze as atividades pelo ID e preserve as correções humanas.",
    );
    assert.equal(proposal.mode, "ai");
    assert.equal(generationCalls, 1);
    store.saveBlueprint(proposal.blueprint, store.getSkill().version);
    const routine = store
      .docs<Routine>("routine")
      .find((item) => item.name === "Consolidar board e conversas")!;
    assert.ok(routine);
    assert.equal(routine.enabled, false);
    const scheduled = new Date(Date.now() + 86400000);
    assert.deepEqual(
      await runDueRoutines(scheduled),
      [],
      "Published routines stay paused until activation",
    );
    store.saveRoutine(
      { ...routine, enabled: true },
      routine.id,
      routine.revision,
    );
    const runs = await runDueRoutines(scheduled);
    assert.equal(runs.length, 1);
    assert.equal(runs[0].status, "success", runs[0].summary);
    assert.equal(runs[0].trigger, "schedule");
    assert.equal(runs[0].skillVersion, store.getSkill().version);
    const task = store
      .docs<Task>("task")
      .find((item) => item.sourceId === sourceId)!;
    assert.ok(task);
    assert.equal(task.status, "doing");
    assert.equal(task.due, "2026-10-05");
    assert.equal(task.contact, "U-ANA");
    assert.equal(task.actor, "agent");
    assert.match(task.evidence, /board_read, conversation_read/);
    assert.ok(
      runs[0].steps.some((step) => step.title === `Criada: ${task.title}`),
    );
    const previousCalls = executionCalls;
    assert.deepEqual(await runDueRoutines(scheduled), []);
    assert.equal(
      executionCalls,
      previousCalls,
      "The same slot must not call the model again",
    );
    assert.deepEqual(toolCalls, ["board_read", "conversation_read"]);

    const correction = store.saveTask(
      { ...task, status: "done" },
      task.id,
      task.revision,
      "human",
      "A validação com os clientes foi concluída.",
    );
    const feedback = store
      .docs<Feedback>("feedback")
      .find((item) => item.taskId === task.id)!;
    store.incorporateFeedback(feedback.id, learning);
    const next = await runDueRoutines(new Date(scheduled.getTime() + 86400000));
    assert.equal(next[0].status, "success", next[0].summary);
    assert.equal(learnedContexts, 1);
    assert.equal(next[0].skillVersion, store.getSkill().version);
    assert.deepEqual(store.getDoc<Task>("task", task.id), correction);
    assert.equal(
      store.docs<Task>("task").filter((item) => item.sourceId === sourceId)
        .length,
      1,
    );

    failConversation = true;
    const failed = await runDueRoutines(
      new Date(scheduled.getTime() + 2 * 86400000),
    );
    assert.equal(failed[0].status, "error");
    assert.match(failed[0].summary, /Não foi possível consultar as conversas/);
    assert.ok(
      failed[0].steps.some(
        (step) =>
          step.title === "Ação não concluída" &&
          step.detail.includes("conversation_read"),
      ),
    );
    assert.deepEqual(store.getDoc<Task>("task", task.id), correction);
    assert.equal(
      store.listRuns().filter((run) => run.routineId === routine.id).length,
      3,
    );
    assert.deepEqual(
      toolCalls,
      Array.from({ length: 3 }, () => [
        "board_read",
        "conversation_read",
      ]).flat(),
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
