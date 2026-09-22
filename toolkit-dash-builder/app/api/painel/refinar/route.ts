// POST refina um painel a partir de um pedido em texto; grava o resultado quando `id` é informado.
import { respostaErro } from "@/lib/ai";
import { obter } from "@/lib/historico";
import { refinarPainel } from "@/lib/painel";
import { INSUMO_PLANILHA } from "@/lib/planilha";
import type { EspecPainel } from "@/lib/types";

/**
 * O refino (lib/painel.ts) pede à IA um painel novo com os NÚMEROS escritos por ela, e o caminho de
 * demonstração acrescenta um indicador de exemplo fixo. Nos dois casos, aplicar isso a um painel
 * calculado de planilha trocaria dado real por número inventado — mantendo o aviso "números
 * calculados a partir do seu arquivo" na tela. Enquanto o refino não souber editar a receita e
 * recalcular, a porta fica fechada. A origem vem do resultado salvo, não do corpo da requisição.
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
    return Response.json(
      {
        error:
          "Este painel é calculado a partir da sua planilha, e o ajuste conversando ainda reescreve os números. " +
          "Mudar o recorte aqui trocaria o seu dado por número de exemplo. Gere de novo com outra descrição.",
        codigo: "refino_indisponivel_com_dados",
      },
      { status: 409 },
    );
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
