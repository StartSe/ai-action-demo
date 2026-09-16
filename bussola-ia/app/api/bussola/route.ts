import { respostaErro } from "@/lib/ai";
import { apagarTodos, listar } from "@/lib/historico";
import { gerarAvaliacaoExemplo } from "@/lib/bussola";
import type { DadosAvaliacao } from "@/lib/types";

/** "Ver um diagnóstico de exemplo": sempre a avaliação fictícia de lib/demo.ts, rotulada como exemplo. */
export async function POST(req: Request) {
  const corpo = (await req.json().catch(() => ({}))) as Partial<DadosAvaliacao>;
  const dados: DadosAvaliacao = { empresa: corpo.empresa || "", titulo: corpo.titulo || "" };
  try {
    const resultado = await gerarAvaliacaoExemplo(dados);
    return Response.json(resultado);
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
