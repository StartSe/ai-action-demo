import { quadroDemo } from "@/lib/quadro-demo";
import { trelloConfigurado } from "@/lib/quadro";
import { trello } from "@/lib/trello";

export const dynamic = "force-dynamic";

function provedor() {
  return trelloConfigurado() ? trello : quadroDemo;
}

export async function GET() {
  try {
    const quadro = await provedor().obterQuadro();
    return Response.json(quadro);
  } catch (err) {
    console.error(err);
    const mensagem = err instanceof Error ? err.message : "Não foi possível carregar o quadro agora.";
    return Response.json({ error: mensagem }, { status: 500 });
  }
}
