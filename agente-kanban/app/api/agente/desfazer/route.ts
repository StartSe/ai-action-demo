import { responderErro } from "@/app/api/erros";
import type { Desfazer } from "@/lib/agente";
import { trelloConfigurado } from "@/lib/quadro";
import { quadroDemoPara } from "@/lib/quadro-demo";
import { mcpTarefasConfigurado, quadroMcp } from "@/lib/quadro-mcp";
import { trello } from "@/lib/trello";
import { visitanteId } from "@/lib/visitante";

export const dynamic = "force-dynamic";

function provedor(id: string) {
  if (mcpTarefasConfigurado()) return quadroMcp;
  return trelloConfigurado() ? trello : quadroDemoPara(id);
}

/** Reverte a última ação do agente (janela de 30 s no cliente), a partir do `desfazer` devolvido por POST /api/agente. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { desfazer?: Desfazer };
  const { desfazer } = body;
  if (!desfazer) {
    return Response.json({ error: "Não há o que desfazer." }, { status: 400 });
  }
  try {
    const idVisitante = await visitanteId();
    const p = provedor(idVisitante);
    if (desfazer.tipo === "criar_cartao") {
      await p.arquivarCartao({ cartaoId: desfazer.cartaoId });
    } else if (desfazer.tipo === "mover_cartao") {
      await p.moverCartao({ cartaoId: desfazer.cartaoId, listaId: desfazer.listaOrigemId });
    } else if (desfazer.tipo === "comentar_cartao") {
      await p.removerComentario({ cartaoId: desfazer.cartaoId, comentarioId: desfazer.comentarioId });
    }
    const quadro = await p.obterQuadro();
    return Response.json({ ok: true, quadro });
  } catch (err) {
    return responderErro(err, "Não foi possível desfazer agora. Tente de novo em um minuto.");
  }
}
