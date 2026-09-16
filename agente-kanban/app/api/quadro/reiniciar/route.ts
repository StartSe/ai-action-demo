import { aiEnabled, meta } from "@/lib/ai";
import { responderErro } from "@/app/api/erros";
import { quadroDemoPara, reiniciarQuadroDemo } from "@/lib/quadro-demo";
import { trelloConfigurado } from "@/lib/quadro";
import { mcpTarefasConfigurado, quadroMcp } from "@/lib/quadro-mcp";
import { trello } from "@/lib/trello";
import { visitanteId } from "@/lib/visitante";

export const dynamic = "force-dynamic";

/** Botão "Reiniciar quadro de exemplo": descarta o quadro em memória deste visitante e devolve o quadro já recriado. Sem efeito quando há um quadro real conectado (Trello ou MCP): não há quadro de exemplo a reiniciar. */
export async function POST() {
  try {
    const id = await visitanteId();
    if (mcpTarefasConfigurado() || trelloConfigurado()) {
      const provedor = mcpTarefasConfigurado() ? quadroMcp : trello;
      const quadro = await provedor.obterQuadro();
      const metaGerada = meta({ demo: !aiEnabled(), insumo: "quadro atual" });
      const quadroNome = provedor.nomeDoQuadro ? await provedor.nomeDoQuadro() : null;
      return Response.json({ ...quadro, meta: metaGerada, quadroDemo: false, quadroNome });
    }
    reiniciarQuadroDemo(id);
    const quadro = await quadroDemoPara(id).obterQuadro();
    const metaGerada = meta({ demo: !aiEnabled(), insumo: "quadro atual" });
    return Response.json({ ...quadro, meta: metaGerada, quadroDemo: true, quadroNome: null });
  } catch (err) {
    return responderErro(err, "Não foi possível reiniciar o quadro agora. Tente de novo em um minuto.");
  }
}
