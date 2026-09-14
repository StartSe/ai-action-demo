import { apagarTodos, listar } from "@/lib/historico";
import { gerarAvaliacaoExemplo } from "@/lib/bussola";
import type { DadosAvaliacao } from "@/lib/types";

export async function POST(req: Request) {
  const corpo = (await req.json().catch(() => ({}))) as Partial<DadosAvaliacao>;
  const dados: DadosAvaliacao = { empresa: corpo.empresa || "", titulo: corpo.titulo || "" };
  try {
    const resultado = await gerarAvaliacaoExemplo(dados);
    return Response.json(resultado);
  } catch (err) {
    console.error(err);
    const mensagem = err instanceof Error ? err.message : "Não foi possível gerar a avaliação agora. Tente novamente.";
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
