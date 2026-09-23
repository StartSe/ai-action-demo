// Prompt 1 — a leitura do corredor de um item, em linguagem de dono de negócio.
// A rota recalcula do lado do servidor em vez de aceitar números do corpo: assim a IA nunca lê um
// número que não veio do motor.
import { respostaErro } from "@/lib/ai";
import { precificarItem } from "@/lib/carteira";
import { lerCorredor } from "@/lib/ia";
import { calcularDerivados, montarCascata } from "@/lib/precificacao";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const corpo = (await req.json().catch(() => null)) as { itemId?: string; canalId?: string; preco?: number } | null;
  if (!corpo?.itemId) return Response.json({ error: "Informe o item." }, { status: 400 });

  const atual = precificarItem(corpo.itemId, corpo.canalId);
  if (!atual) return Response.json({ error: "Este item não existe mais." }, { status: 404 });

  // O preço que a tela está mostrando pode ainda não ter sido salvo (o debounce não venceu).
  // Recalculamos com ele, sem gravar: gravar é responsabilidade da rota de preço.
  const preco = Number(corpo.preco);
  const precificacao = Number.isFinite(preco) && preco > 0
    ? {
        corredor: atual.precificacao.corredor,
        derivados: calcularDerivados(atual.precificacao.corredor, preco),
        cascata: montarCascata(atual.precificacao.corredor, atual.cenario.negocio, atual.cenario.item.tipo, preco),
      }
    : atual.precificacao;

  try {
    const { leitura, meta } = await lerCorredor(atual.cenario, precificacao);
    return Response.json({ leitura, meta });
  } catch (err) {
    return respostaErro(err);
  }
}
