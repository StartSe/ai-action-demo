// POST gera um painel (aceita `forcar` para ignorar o cache) · GET lista os salvos · DELETE apaga tudo.
import { interpretarFalha, respostaErro } from "@/lib/ai";
import { obterDados } from "@/lib/dados-store";
import { apagarTodos, listarPorTipo } from "@/lib/historico";
import { gerarPainel } from "@/lib/painel";
import { gerarPainelDeDados } from "@/lib/painel-dados";
import { lerPedido, MAXIMO_DESCRICAO } from "@/lib/pedido";

export async function POST(req: Request) {
  const corpo = (await req.json().catch(() => ({}))) as { descricao?: unknown; esclarecimentos?: unknown; forcar?: unknown; dadosId?: unknown };

  // Com planilha enviada o caminho é outro: a IA escolhe o recorte e o servidor calcula em cima das
  // linhas reais (lib/painel-dados.ts). A descrição vira opcional — o arquivo já diz o que existe.
  if (typeof corpo.dadosId === "string" && corpo.dadosId) {
    const dados = obterDados(corpo.dadosId);
    if (!dados) {
      return Response.json({ error: "Não encontrei essa planilha. Envie o arquivo de novo." }, { status: 404 });
    }
    const descricao = typeof corpo.descricao === "string" ? corpo.descricao.trim().slice(0, MAXIMO_DESCRICAO) : "";
    try {
      return Response.json(await gerarPainelDeDados(dados, descricao, { dadosId: corpo.dadosId }));
    } catch (err) {
      return respostaErro(err);
    }
  }

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
