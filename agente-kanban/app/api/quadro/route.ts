import { aiEnabled, meta } from "@/lib/ai";
import { quadroDemo } from "@/lib/quadro-demo";
import { trelloConfigurado } from "@/lib/quadro";
import { trello } from "@/lib/trello";

export const dynamic = "force-dynamic";

function provedor() {
  return trelloConfigurado() ? trello : quadroDemo;
}

/** Não salva no histórico: é só a leitura do quadro atual, não uma ação do agente. */
export async function GET() {
  try {
    const quadro = await provedor().obterQuadro();
    const metaGerada = meta({ demo: !aiEnabled(), insumo: "o quadro atual" });
    return Response.json({ ...quadro, meta: metaGerada });
  } catch (err) {
    console.error(err);
    const mensagem = err instanceof Error ? err.message : "Não foi possível carregar o quadro agora.";
    return Response.json({ error: mensagem }, { status: 500 });
  }
}
