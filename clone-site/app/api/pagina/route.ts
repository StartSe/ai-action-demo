// Porta antiga, mantida por compatibilidade (tela anterior e assistentes que já a usam): gera a página a partir
// da captura (POST) esperando o fim, lista as últimas páginas salvas (GET) e apaga o histórico (DELETE).
// Desde a US-001 desta rodada, toda página nasce como um SITE (lib/projetos.ts): o POST cria o projeto, dispara
// a geração em segundo plano e aguarda internamente, devolvendo a mesma resposta de antes mais `projetoId` e
// `slug`. Assim o que vem por aqui também aparece em "Meus sites".
import { aguardarGeracao, apagarTodos, criar, iniciarGeracao, paginaDoProjeto } from "@/lib/projetos";
import { apagarTodos as apagarHistorico, listar } from "@/lib/historico";
import { respostaErroSites } from "@/lib/resposta-sites";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const corpo = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  try {
    const criado = criar({ origem: "referencia", imagem: corpo?.imagem, stack: corpo?.stack, instrucoes: corpo?.instrucoes, marca: corpo?.marca, nome: corpo?.nome });
    iniciarGeracao(criado.id);
    const projeto = await aguardarGeracao(criado.id);
    if (projeto.estado === "falhou" || projeto.estado !== "pronto") {
      const erro = projeto.erro ?? { mensagem: "Não foi possível gerar a página desta vez. Tente de novo." };
      return Response.json({ error: erro.mensagem, codigo: erro.codigo, acao: erro.acao, projetoId: projeto.id }, { status: erro.codigo ? 502 : 400 });
    }
    const salva = paginaDoProjeto(projeto);
    if (!salva) return Response.json({ error: "A página foi gerada, mas não pôde ser lida. Abra o site na tela inicial." }, { status: 500 });
    return Response.json({ pagina: salva.pagina, meta: salva.meta, id: salva.pagina.id, demo: salva.meta.demo, projetoId: projeto.id, slug: projeto.slug });
  } catch (err) {
    return respostaErroSites(err);
  }
}

/** Últimas páginas salvas, para a lista "Últimos resultados" no painel. */
export async function GET() {
  return Response.json({ itens: listar(20).filter((r) => r.tipo === "pagina").slice(0, 10) });
}

/** Apaga todos os sites e todo o histórico salvo (botão "Apagar tudo"). */
export async function DELETE() {
  apagarTodos();
  apagarHistorico();
  return Response.json({ ok: true });
}
