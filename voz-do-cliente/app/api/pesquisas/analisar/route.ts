import { meta } from "@/lib/ai";
import { analisarComentarios } from "@/lib/analise";
import { salvar } from "@/lib/historico";
import { comentariosDoPeriodo } from "@/lib/pesquisas";
import type { EntradaAnalise, SaidaAnalise } from "@/lib/types";

const PERIODOS_VALIDOS = [7, 30, 90];

/** "Analisar respostas recebidas" no painel: junta as respostas de todas as pesquisas no período escolhido e roda a mesma análise da tela principal. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const diasAtras = PERIODOS_VALIDOS.includes(body?.diasAtras) ? (body.diasAtras as number) : null;

  const { comentarios, total } = comentariosDoPeriodo(diasAtras);
  if (!total) {
    return Response.json({ error: "Nenhuma resposta encontrada no período escolhido." }, { status: 400 });
  }

  try {
    const { demo, analise, totalEnviado, totalAnalisado, truncado } = await analisarComentarios({ comentarios, contexto: "" });

    const contexto = diasAtras ? `respostas da pesquisa pública dos últimos ${diasAtras} dias` : "respostas da pesquisa pública (todo o período)";
    const insumo = `${totalEnviado} resposta${totalEnviado === 1 ? "" : "s"} coletada${totalEnviado === 1 ? "" : "s"} na pesquisa pública`;
    const metaGerada = meta({ demo, insumo });
    const titulo = `Análise da pesquisa NPS (${totalAnalisado} resposta${totalAnalisado === 1 ? "" : "s"})`;
    const id = salvar({
      tipo: "voz-do-cliente",
      titulo,
      entrada: { contexto } satisfies EntradaAnalise,
      saida: { analise, totalEnviado, totalAnalisado, truncado } satisfies SaidaAnalise,
      meta: metaGerada,
    });

    return Response.json({
      demo,
      truncado,
      total_enviado: totalEnviado,
      total_analisado: totalAnalisado,
      analise,
      meta: metaGerada,
      id,
      contexto,
    });
  } catch (err) {
    console.error(err);
    const mensagem = err instanceof Error ? err.message : "Não foi possível analisar as respostas agora. Tente novamente.";
    return Response.json({ error: mensagem }, { status: 500 });
  }
}
