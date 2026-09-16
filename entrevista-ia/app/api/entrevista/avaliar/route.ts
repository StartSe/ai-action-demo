import { responderErro } from "@/app/api/erros";
import { gerarScorecard, normalizarHistorico } from "@/lib/entrevista";
import { apagarTodos, listar } from "@/lib/historico";
import type { Vaga } from "@/lib/types";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { vaga, historico } = (body || {}) as { vaga?: Vaga; historico?: unknown };
  if (!vaga || !vaga.titulo || !vaga.requisitos) {
    return Response.json({ error: "Informe ao menos o título da vaga e os principais requisitos." }, { status: 400 });
  }
  const hist = normalizarHistorico(historico);
  if (!hist.length) {
    return Response.json({ error: "É preciso ter ao menos uma resposta do candidato para gerar o scorecard." }, { status: 400 });
  }
  try {
    const { scorecard, meta, id } = await gerarScorecard(vaga, hist);
    return Response.json({ scorecard, meta, id });
  } catch (err) {
    return responderErro(err, "Não foi possível montar o scorecard agora. A conversa continua salva: tente de novo.");
  }
}

/** Últimos resultados salvos, para a lista "Últimos resultados" no painel. */
export async function GET() {
  return Response.json({ itens: listar(10) });
}

/** Apaga todo o histórico salvo (botão "Apagar tudo"). */
export async function DELETE() {
  apagarTodos();
  return Response.json({ ok: true });
}
