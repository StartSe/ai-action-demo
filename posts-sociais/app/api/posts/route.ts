import { respostaErro } from "@/lib/ai";
import { apagarTodos, listar } from "@/lib/historico";
import { gerarPosts, REDES } from "@/lib/posts";
import type { DadosPosts, Rede } from "@/lib/types";

export async function POST(req: Request) {
  const dados = (await req.json().catch(() => ({}))) as Partial<DadosPosts>;
  const { empresa, tema, redes } = dados;
  const lista = (Array.isArray(redes) ? redes : []).filter((r) => REDES[r as Rede]) as Rede[];
  if (!empresa?.trim() || !tema?.trim()) {
    return Response.json({ error: "Preencha a empresa ou marca e o tema do post." }, { status: 400 });
  }
  if (!lista.length) {
    return Response.json({ error: "Escolha pelo menos uma rede social." }, { status: 400 });
  }
  try {
    const { resultado, meta: metaGerada, id } = await gerarPosts({ ...(dados as DadosPosts), redes: lista });
    return Response.json({ resultado, meta: metaGerada, id });
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
