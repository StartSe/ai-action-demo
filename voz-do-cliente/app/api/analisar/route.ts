import { meta } from "@/lib/ai";
import { analisarComentarios } from "@/lib/analise";
import { apagarTodos, listar, salvar } from "@/lib/historico";
import type { Comentario, EntradaAnalise, SaidaAnalise } from "@/lib/types";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const contexto = String(body?.contexto || "").trim();
  const comentariosRecebidos = Array.isArray(body?.comentarios) ? body.comentarios : null;

  if (!comentariosRecebidos || !comentariosRecebidos.length) {
    return Response.json({ error: "Cole ao menos um comentário ou envie um arquivo antes de analisar." }, { status: 400 });
  }

  const comentarios: Comentario[] = comentariosRecebidos
    .map((c: { texto?: unknown; nota?: unknown }) => ({
      texto: String(c?.texto ?? "").trim(),
      nota: typeof c?.nota === "number" && Number.isFinite(c.nota) ? c.nota : undefined,
    }))
    .filter((c: Comentario) => c.texto.length > 0);

  if (!comentarios.length) {
    return Response.json({ error: "Não encontramos texto nos comentários enviados." }, { status: 400 });
  }

  try {
    const { demo, analise, totalEnviado, totalAnalisado, truncado } = await analisarComentarios({ comentarios, contexto });

    const insumo = "comentários enviados e o contexto informado";
    const metaGerada = meta({ demo, insumo });
    const titulo = `Análise de ${totalAnalisado} comentário${totalAnalisado === 1 ? "" : "s"}${contexto ? ` sobre ${contexto}` : ""}`;
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
    });
  } catch (err) {
    console.error(err);
    const mensagem = err instanceof Error ? err.message : "Não foi possível analisar os comentários agora. Tente novamente.";
    return Response.json({ error: mensagem }, { status: 500 });
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
