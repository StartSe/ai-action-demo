import { randomUUID } from "node:crypto";
import { chatGPT } from "./chatgpt";
import { getConfig } from "./store";
import { conexaoAutorizada } from "./mcp-oauth";
import {
  FlowError,
  getFlow,
  getRun,
  putRun,
  claimRun,
  validateGraph,
} from "./flow-store";
import type { Run, Block } from "./flow-types";
export function interpolate(text: string, r: Run): string {
  return (text || "").replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_, key: string) => {
    if (key === "input") return r.input;
    if (key === "last") return r.output;
    const [prefix, ...rest] = key.split(".");
    const k = rest.join(".");
    if (prefix === "state" && Object.hasOwn(r.state, k)) return r.state[k];
    if (prefix === "nodes" && Object.hasOwn(r.outputs, k)) return r.outputs[k];
    throw new FlowError(`A referência “${key}” não tem valor nesta etapa.`);
  });
}
async function mcp(method: string, params: unknown) {
  const c = await conexaoAutorizada("FERRAMENTAS");
  if (!c?.url) throw new FlowError("Conecte as ferramentas em Configurações.");
  const res = await fetch(c.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(c.token ? { Authorization: `Bearer ${c.token}` } : {}),
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: randomUUID(), method, params }),
    signal: AbortSignal.timeout(30000),
    redirect: "error",
  });
  if (!res.ok)
    throw new FlowError("O serviço de ferramentas recusou a chamada.");
  const body = await res.json();
  if (body.error || body.result?.isError)
    throw new FlowError("A ferramenta não conseguiu concluir a operação.");
  return body.result;
}
export async function availableTools() {
  const r = await mcp("tools/list", {});
  return (r.tools || []) as {
    name: string;
    description?: string;
    inputSchema?: Record<string, unknown>;
  }[];
}
async function callTool(name: string, args: unknown) {
  const r = await mcp("tools/call", { name, arguments: args });
  return JSON.stringify(r).slice(0, 30000);
}
// Mensagem que o LLM/Agente recebe: o texto configurado ou, em branco, o que veio antes
// (a conversa no primeiro passo, o resultado da etapa anterior depois), como o Flowise encadeia.
export function message(c: Record<string, string>, r: Run) {
  return c.prompt?.trim() ? interpolate(c.prompt, r) : r.output;
}
async function agent(n: Block, r: Run, signal: AbortSignal) {
  const c = n.data.config;
  const allowed =
    n.data.kind === "agent"
      ? (c.tools || "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
  const tools = allowed.length
    ? (await availableTools()).filter((t) => allowed.includes(t.name))
    : [];
  if (tools.length !== new Set(allowed).size)
    throw new FlowError(
      "Uma ferramenta autorizada não está disponível. Confira os nomes.",
    );
  return chatGPT().run({
    system: interpolate(c.system, r),
    prompt: message(c, r),
    model: c.model || undefined,
    signal,
    onText: (text) => {
      if (getRun(r.id).status === "running") {
        r.output = text.slice(0, 50000);
        putRun(r);
      }
    },
    tools: tools.map((t) => ({
      name: t.name,
      description: t.description || t.name,
      schema: t.inputSchema || { type: "object", properties: {} },
      call: async (args) => {
        if (signal.aborted) throw new FlowError("Execução cancelada.");
        const output = await callTool(t.name, args);
        r.trace.push({
          nodeId: n.id,
          label: "Ferramenta: " + t.name,
          output,
          at: new Date().toISOString(),
          ms: 0,
        });
        if (getRun(r.id).status === "running") putRun(r);
        return output;
      },
    })),
  });
}
const activeRuns = new Map<string, AbortController>();
function next(r: Run, n: Block, handle?: string) {
  return (
    r.graph.edges.find(
      (e) => e.source === n.id && (e.sourceHandle || undefined) === handle,
    )?.target || null
  );
}
function record(r: Run, n: Block, output: string, started: number) {
  r.output = output.slice(0, 50000);
  r.outputs[n.id] = r.output;
  r.trace.push({
    nodeId: n.id,
    label: n.data.label,
    output: r.output,
    at: new Date().toISOString(),
    ms: Date.now() - started,
  });
}
async function execute(r: Run): Promise<Run> {
  const deadline = Date.now() + 180000;
  const controller = new AbortController();
  activeRuns.set(r.id, controller);
  try {
    while (r.next) {
      if (getRun(r.id).status === "cancelled") return getRun(r.id);
      if (r.trace.length >= 150 || Date.now() > deadline)
        throw new FlowError(
          "Limite de execução atingido. Reduza as repetições.",
        );
      const n = r.graph.nodes.find((n) => n.id === r.next)!;
      const c = n.data.config;
      const k = n.data.kind;
      const start = Date.now();
      r.visits[n.id] = (r.visits[n.id] || 0) + 1;
      let output = r.output,
        handle: string | undefined;
      if (k === "start") {
        r.state = JSON.parse(c.state || "{}");
        output = r.input;
      }
      if (k === "end") {
        output = interpolate(c.text, r);
        r.status = "completed";
      }
      if (k === "state") {
        output = interpolate(c.value, r);
        r.state[c.key] = output;
      }
      if (k === "condition") {
        const v = interpolate(c.value, r),
          expected = interpolate(c.compare, r);
        const yes =
          c.operator === "equals"
            ? v === expected
            : c.operator === "notEquals"
              ? v !== expected
              : c.operator === "greater"
                ? Number(v) > Number(expected)
                : c.operator === "empty"
                  ? !v.trim()
                  : v
                      .toLocaleLowerCase()
                      .includes(expected.toLocaleLowerCase());
        handle = yes ? "yes" : "no";
      }
      if (k === "loop")
        handle = r.visits[n.id] <= Number(c.limit) ? "repeat" : "done";
      if (k === "approval") {
        r.status = "waiting";
        record(r, n, interpolate(c.prompt, r) + "\n\n" + r.output, start);
        activeRuns.delete(r.id);
        return putRun(r);
      }
      if (k === "llm" || k === "agent")
        output = r.demo
          ? `[Demonstração] ${n.data.label}\nEntrada analisada: ${message(c, r).slice(0, 600)}\nPrioridade: acompanhar hoje.\nPróxima ação: confirmar os detalhes com a equipe e responder ao solicitante.`
          : await agent(n, r, controller.signal);
      if (k === "tool")
        output = r.demo
          ? `[Demonstração] Ferramenta ${c.tool}: nenhuma ação externa realizada.`
          : await callTool(c.tool, JSON.parse(interpolate(c.args, r)));
      if (k === "http") {
        if (r.demo)
          output =
            "[Demonstração] Serviço consultado. Nenhuma requisição enviada.";
        else {
          // Destination is fixed by the author; input cannot change the host or inject credentials.
          const headers: Record<string, string> = {
            "Content-Type": "application/json",
          };
          if (c.credential) {
            if (!/^FLOW_SECRET_[A-Z0-9_]+$/.test(c.credential))
              throw new FlowError(
                "Use uma credencial FLOW_SECRET_ configurada no servidor.",
              );
            const secret = getConfig(c.credential);
            if (!secret)
              throw new FlowError(
                "A credencial do serviço não foi configurada.",
              );
            headers.Authorization = `Bearer ${secret}`;
          }
          const res = await fetch(c.url, {
            method: c.method,
            headers,
            body: c.method === "GET" ? undefined : interpolate(c.body, r),
            signal: AbortSignal.timeout(30000),
            redirect: "error",
          });
          if (!res.ok)
            throw new FlowError(`O serviço respondeu com erro ${res.status}.`);
          const reader = res.body?.getReader();
          let text = "";
          if (reader) {
            const decoder = new TextDecoder();
            let size = 0;
            while (true) {
              const chunk = await reader.read();
              if (chunk.done) break;
              size += chunk.value.length;
              if (size > 100000) {
                await reader.cancel();
                throw new FlowError("A resposta do serviço excedeu 100 KB.");
              }
              text += decoder.decode(chunk.value, { stream: true });
            }
            text += decoder.decode();
          }
          output = text;
        }
      }
      // A cancellation during a remote call never dispatches another block.
      if (getRun(r.id).status === "cancelled") return getRun(r.id);
      record(r, n, output, start);
      r.next = next(r, n, handle);
      putRun(r);
    }
    if (r.status !== "completed")
      throw new FlowError("O caminho terminou sem um bloco de Resposta.");
  } catch (err) {
    if (getRun(r.id).status === "cancelled") return getRun(r.id);
    r.status = "failed";
    r.error =
      err instanceof Error ? err.message : "Não foi possível executar o fluxo.";
  } finally {
    activeRuns.delete(r.id);
  }
  return putRun(r);
}
export async function startRun(
  flowId: string,
  input: unknown,
  published = false,
  demo?: boolean,
) {
  if (typeof input !== "string" || !input.trim() || input.length > 20000)
    throw new FlowError(
      "Envie uma entrada de texto com até 20 mil caracteres.",
    );
  const f = getFlow(flowId);
  if (published && !f.published)
    throw new FlowError(
      "Publique o fluxo antes de usá-lo em uma integração.",
      409,
    );
  const graph = validateGraph(published ? f.published : f.graph, true);
  if (demo !== true && !(await chatGPT().account()).account)
    throw new FlowError(
      "Conecte o ChatGPT para executar ou escolha simular no painel de teste.",
      409,
    );
  const now = new Date().toISOString();
  const r: Run = {
    id: randomUUID(),
    flowId,
    name: f.name,
    version: published ? f.version : 0,
    graph,
    status: "running",
    demo: demo === true,
    input,
    output: "",
    next: graph.nodes.find((n) => n.data.kind === "start")!.id,
    state: {},
    outputs: {},
    visits: {},
    trace: [],
    createdAt: now,
    updatedAt: now,
  };
  putRun(r);
  return execute(r);
}
export async function resumeRun(id: string, decision: unknown) {
  if (!["yes", "no"].includes(String(decision)))
    throw new FlowError("Escolha aprovar ou rejeitar.");
  const r = claimRun(id);
  const n = r.graph.nodes.find((n) => n.id === r.next)!;
  record(r, n, decision === "yes" ? "Aprovado" : "Rejeitado", Date.now());
  r.state.approval = String(decision);
  r.next = next(r, n, String(decision));
  putRun(r);
  return execute(r);
}
export function cancelRun(id: string) {
  const r = getRun(id);
  if (!["waiting", "running"].includes(r.status))
    throw new FlowError("Esta execução já terminou.", 409);
  activeRuns.get(id)?.abort();
  r.status = "cancelled";
  return putRun(r);
}
