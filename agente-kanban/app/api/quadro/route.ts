import { aiEnabled, meta } from "@/lib/ai";
import { quadroDemoPara } from "@/lib/quadro-demo";
import { trelloConfigurado } from "@/lib/quadro";
import { trello } from "@/lib/trello";
import { visitanteId } from "@/lib/visitante";

export const dynamic = "force-dynamic";

async function provedor() {
  if (trelloConfigurado()) return { p: trello, quadroDemo: false };
  return { p: quadroDemoPara(await visitanteId()), quadroDemo: true };
}

/** Não salva no histórico: é só a leitura do quadro atual, não uma ação do agente. */
export async function GET() {
  try {
    const { p, quadroDemo } = await provedor();
    const quadro = await p.obterQuadro();
    const metaGerada = meta({ demo: !aiEnabled(), insumo: "o quadro atual" });
    return Response.json({ ...quadro, meta: metaGerada, quadroDemo });
  } catch (err) {
    console.error(err);
    const mensagem = err instanceof Error ? err.message : "Não foi possível carregar o quadro agora.";
    return Response.json({ error: mensagem }, { status: 500 });
  }
}
