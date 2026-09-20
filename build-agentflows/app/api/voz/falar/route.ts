import { falar } from "@/lib/elevenlabs";
import { FlowError } from "@/lib/flow-store";
import { body } from "@/lib/flow-api";
export async function POST(req: Request) {
  try {
    const texto = (await body(req)).texto;
    if (typeof texto !== "string") throw new FlowError("Envie o texto a falar.");
    return new Response(await falar(texto), {
      headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
    });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Não foi possível gerar a fala." },
      { status: e instanceof FlowError ? e.status : 500 },
    );
  }
}
