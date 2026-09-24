import { getFlow } from "@/lib/flow-store";
import { generateFlow, type GenerationEvent } from "@/lib/flow-generator";
import { api, body } from "@/lib/flow-api";
export async function POST(
  req: Request,
  c: { params: Promise<{ id: string }> },
) {
  return api(async () => {
    const { id } = await c.params;
    if (id !== "new") getFlow(id);
    const { prompt } = await body(req);
    if (!req.headers.get("accept")?.includes("application/x-ndjson")) return generateFlow(prompt);
    const encoder = new TextEncoder();
    let cancelled = false;
    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: GenerationEvent) => {
          if (!cancelled) controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        };
        try {
          const result = await generateFlow(prompt, undefined, (phase) => send({ phase }));
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
