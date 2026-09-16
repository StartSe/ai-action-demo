import { analisarESalvar, plural } from "@/lib/analise-salva";
import { respostaErro } from "@/lib/ai";
import { respostaVazia } from "@/lib/erro-fonte";
import { comentariosDoPeriodo } from "@/lib/pesquisas";

const PERIODOS_VALIDOS = [7, 30, 90];

/** "Analisar respostas recebidas" no painel: junta as respostas de todas as pesquisas no período escolhido e roda a mesma análise da tela principal. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const diasAtras = PERIODOS_VALIDOS.includes(body?.diasAtras) ? (body.diasAtras as number) : null;

  const { comentarios, total } = comentariosDoPeriodo(diasAtras);
  if (!total) {
    return respostaVazia(
      diasAtras
        ? `Nenhuma resposta nos últimos ${diasAtras} dias. Copie o link da pesquisa e envie aos clientes, ou amplie o período.`
        : "Nenhuma resposta recebida ainda. Copie o link da pesquisa e envie aos clientes."
    );
  }

  try {
    const resposta = await analisarESalvar({
      comentarios,
      contexto: diasAtras ? `respostas da pesquisa pública dos últimos ${diasAtras} dias` : "respostas da pesquisa pública (todo o período)",
      insumo: (n) => `${plural(n, "resposta coletada", "respostas coletadas")} na pesquisa pública`,
      titulo: (n) => `Análise da pesquisa NPS (${plural(n, "resposta", "respostas")})`,
    });
    return Response.json(resposta);
  } catch (err) {
    return respostaErro(err);
  }
}
