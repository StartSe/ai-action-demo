// Cria os três conceitos a partir do briefing (POST), lista as últimas campanhas salvas (GET) e apaga o histórico (DELETE).
// A lógica de criação vive em lib/conceitos.ts, compartilhada com a ferramenta MCP (lib/ferramentas.ts).
import { respostaErro } from "@/lib/ai";
import { ErroDePedido, gerarCampanha, normalizarBriefing } from "@/lib/conceitos";
import { apagarTodos, listar } from "@/lib/historico";
import { registrarEnderecoPublico } from "@/lib/setup-comum";
import type { Briefing } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  registrarEnderecoPublico(req);
  const corpo = await req.json().catch(() => null);
  if (!corpo || typeof corpo !== "object") return Response.json({ error: "Envie o briefing da campanha." }, { status: 400 });

  let briefing: Briefing;
  try {
    briefing = normalizarBriefing(corpo);
  } catch (err) {
    if (err instanceof ErroDePedido) return Response.json({ error: err.message }, { status: 400 });
    throw err;
  }

  try {
    const { campanha, meta, id, demo } = await gerarCampanha(briefing);
    return Response.json({ campanha, meta, id, demo });
  } catch (err) {
    // respostaErro leva código e ação (Conectar a IA, Trocar o modelo) até o ErrorBox da tela.
    return respostaErro(err);
  }
}

/** Últimas campanhas salvas, para a lista "Últimas campanhas" no painel. */
export async function GET() {
  return Response.json({ itens: listar(20).filter((r) => r.tipo === "campanha").slice(0, 10) });
}

/** Apaga todo o histórico salvo (botão "Apagar tudo"). */
export async function DELETE() {
  apagarTodos();
  return Response.json({ ok: true });
}
