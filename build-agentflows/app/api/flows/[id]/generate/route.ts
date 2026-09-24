import { editFlow, validateFlowContext, validateFlowMessages } from "@/lib/flow-ai-edit";
import { FlowError, getFlow } from "@/lib/flow-store";
import { generateFlow, type GenerationEvent, type GenerationPhase } from "@/lib/flow-generator";
import { api, body } from "@/lib/flow-api";
export async function POST(
  req: Request,
  c: { params: Promise<{ id: string }> },
) {
  return api(async () => {
    const { id } = await c.params;
    if (id !== "new") getFlow(id);
    const { prompt, mode = "new", context, history } = await body(req);
    if (mode !== "new" && mode !== "edit") throw new FlowError("Escolha criar ou editar o fluxo.");
    const current = mode === "edit" ? validateFlowContext(context) : null;
    const messages = validateFlowMessages(history);
    const generate = (progress?: (phase: GenerationPhase) => void) => current
      ? editFlow(prompt, current, messages, undefined, progress)
      : generateFlow(prompt, undefined, progress);
    if (!req.headers.get("accept")?.includes("application/x-ndjson")) return generate();
    const encoder = new TextEncoder();
    let cancelled = false;
    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: GenerationEvent) => {
          if (!cancelled) controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        };
        try {
          const result = await generate((phase) => send({ phase }));
          send({ result });
        } catch (error) {
          send({ error: error instanceof Error ? error.message : "Não foi possível gerar o fluxo." });
        } finally {
          if (!cancelled) controller.close();
        }
      },
      cancel() { cancelled = true; },
    });
    return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" } });
  });
}
