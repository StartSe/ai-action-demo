// POST refina um painel a partir de um pedido em texto; grava o resultado quando `id` é informado.
import { respostaErro } from "@/lib/ai";
import { obterDados, obterReceitas } from "@/lib/dados-store";
import { obter } from "@/lib/historico";
import { refinarPainel } from "@/lib/painel";
import { refinarPainelDeDados } from "@/lib/painel-dados";
import { INSUMO_PLANILHA } from "@/lib/planilha";
import type { EspecPainel } from "@/lib/types";

/**
 * Painel de planilha tem refino próprio: `refinarPainelDeDados` edita a RECEITA e recalcula das
 * linhas do arquivo. O refino comum (lib/painel.ts) pede à IA um painel novo com os números escritos
 * por ela, e o caminho de demonstração acrescenta um indicador de exemplo fixo — os dois trocariam
 * dado real por invenção. A origem vem do resultado salvo, nunca de um campo do corpo: quem pede o
 * ajuste não decide se pode reescrever o próprio dado.
 */
function veioDePlanilha(id: unknown): boolean {
  if (typeof id !== "string" || !id) return false;
  const registro = obter<unknown, unknown, { insumo?: string }>(id);
  return Boolean(registro?.meta?.insumo?.startsWith(INSUMO_PLANILHA));
}

export async function POST(req: Request) {
  const corpo = (await req.json().catch(() => ({}))) as { painel?: EspecPainel; pedido?: unknown; id?: unknown };
  const pedido = typeof corpo.pedido === "string" ? corpo.pedido.trim() : "";
  if (pedido.length < 3) {
    return Response.json({ error: "Diga o que você quer mudar no painel." }, { status: 400 });
  }
  if (veioDePlanilha(corpo.id)) {
    const painelId = corpo.id as string;
    const guardado = obterReceitas(painelId);
    if (!guardado) {
      return Response.json(
        { error: "Não encontrei a planilha deste painel para recalcular. Envie o arquivo e gere de novo." },
        { status: 409 },
      );
    }
    const dados = obterDados(guardado.dadosId);
    if (!dados) {
      return Response.json(
        { error: "A planilha deste painel não está mais guardada (elas ficam 30 dias). Envie o arquivo e gere de novo." },
        { status: 409 },
      );
    }
    try {
      const r = await refinarPainelDeDados(dados, guardado.receitas, pedido.slice(0, 500), painelId, guardado.dadosId);
      if (r.tipo === "esclarecimento") return Response.json({ demo: false, esclarecimento: r.mensagem });
      return Response.json({ demo: false, painel: r.painel, mensagem: r.mensagem, componentesAlterados: r.componentesAlterados, restaurados: [], meta: r.meta });
    } catch (err) {
      return respostaErro(err);
    }
  }
  if (!corpo.painel || !Array.isArray(corpo.painel.componentes) || corpo.painel.componentes.length === 0) {
    return Response.json({ error: "Gere um painel antes de pedir um ajuste." }, { status: 400 });
  }
  try {
    const id = typeof corpo.id === "string" && corpo.id ? corpo.id : undefined;
    return Response.json(await refinarPainel(corpo.painel, pedido.slice(0, 500), id));
  } catch (err) {
    return respostaErro(err);
  }
}
