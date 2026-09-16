import { respostaErro } from "@/lib/ai";
import { analisarESalvar, plural } from "@/lib/analise-salva";
import { apagarTodos, listar } from "@/lib/historico";
import type { Comentario } from "@/lib/types";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const contexto = String(body?.contexto || "").trim();
  const comentariosRecebidos = Array.isArray(body?.comentarios) ? body.comentarios : null;

  if (!comentariosRecebidos || !comentariosRecebidos.length) {
    return Response.json({ error: "Cole ao menos um comentário ou envie um arquivo antes de analisar." }, { status: 400 });
  }

  const comentarios: Comentario[] = comentariosRecebidos
    .map((c: { texto?: unknown; nota?: unknown; origem?: unknown }) => ({
      texto: String(c?.texto ?? "").trim(),
      nota: typeof c?.nota === "number" && Number.isFinite(c.nota) ? c.nota : undefined,
      origem: c?.origem === "arquivo" ? ("arquivo" as const) : undefined,
    }))
    .filter((c: Comentario) => c.texto.length > 0);

  if (!comentarios.length) {
    return Response.json({ error: "Não encontramos texto nos comentários enviados." }, { status: 400 });
  }

  try {
    const resposta = await analisarESalvar({
      comentarios,
      contexto,
      insumo: () => "comentários enviados e o contexto informado",
      titulo: (n) => `Análise de ${plural(n, "comentário", "comentários")}${contexto ? ` sobre ${contexto}` : ""}`,
    });
    return Response.json(resposta);
  } catch (err) {
    return respostaErro(err);
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
