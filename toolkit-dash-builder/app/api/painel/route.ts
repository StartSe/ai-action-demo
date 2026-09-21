// POST gera um painel (aceita `forcar` para ignorar o cache) · GET lista os salvos · DELETE apaga tudo.
import { interpretarFalha, respostaErro } from "@/lib/ai";
import { apagarTodos, listarPorTipo } from "@/lib/historico";
import { gerarPainel } from "@/lib/painel";
import { lerPedido } from "@/lib/pedido";

export async function POST(req: Request) {
  const corpo = (await req.json().catch(() => ({}))) as { descricao?: unknown; esclarecimentos?: unknown; forcar?: unknown };
  const pedido = lerPedido(corpo);
  if (pedido instanceof Response) return pedido;
  try {
    // Caso de demonstração local para capturar a tela do ErrorBox (só em dev, nunca em produção).
    if (process.env.NODE_ENV !== "production" && new URL(req.url).searchParams.get("erro") === "sem_credito") {
      throw interpretarFalha(new Response(null, { status: 402 }), "");
    }
    const resultado = await gerarPainel(pedido, { forcar: corpo.forcar === true });
    return Response.json(resultado);
  } catch (err) {
    return respostaErro(err);
  }
}

/** Últimos painéis salvos (só o tipo deste app), para a lista "Últimos painéis" na tela. */
export async function GET() {
  return Response.json({ itens: listarPorTipo("painel", 10).map(({ id, tipo, titulo, resumo, criadoEm }) => ({ id, tipo, titulo, resumo, criadoEm })) });
}

/** Apaga todo o histórico salvo (botão "Apagar tudo"). */
export async function DELETE() {
  apagarTodos();
  return Response.json({ ok: true });
}
