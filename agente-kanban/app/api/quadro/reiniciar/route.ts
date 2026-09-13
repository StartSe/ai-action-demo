import { aiEnabled, meta } from "@/lib/ai";
import { quadroDemoPara, reiniciarQuadroDemo } from "@/lib/quadro-demo";
import { trelloConfigurado } from "@/lib/quadro";
import { mcpTarefasConfigurado, quadroMcp } from "@/lib/quadro-mcp";
import { trello } from "@/lib/trello";
import { visitanteId } from "@/lib/visitante";

export const dynamic = "force-dynamic";

/** Botão "Reiniciar quadro de exemplo": descarta o quadro em memória deste visitante e devolve o quadro já recriado. Sem efeito quando há um quadro real conectado (Trello ou MCP): não há quadro de exemplo a reiniciar. */
export async function POST() {
  const id = await visitanteId();
  if (mcpTarefasConfigurado() || trelloConfigurado()) {
    const provedor = mcpTarefasConfigurado() ? quadroMcp : trello;
    const quadro = await provedor.obterQuadro();
    const metaGerada = meta({ demo: !aiEnabled(), insumo: "o quadro atual" });
    return Response.json({ ...quadro, meta: metaGerada, quadroDemo: false });
  }
  reiniciarQuadroDemo(id);
  const quadro = await quadroDemoPara(id).obterQuadro();
  const metaGerada = meta({ demo: !aiEnabled(), insumo: "o quadro atual" });
  return Response.json({ ...quadro, meta: metaGerada, quadroDemo: true });
}
