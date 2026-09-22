import { respostaErro } from "@/lib/ai";
import { classificarLancamentos, ErroEntrada } from "@/lib/classificador";
import { apagarTodos, listar } from "@/lib/historico";

export async function POST(req: Request) {
  const formData = await req.formData().catch(() => null);
  if (!formData) {
    return Response.json({ error: "Não foi possível ler o formulário enviado." }, { status: 400 });
  }

  const arquivoHistorico = formData.get("historico");
  const arquivoNovos = formData.get("novos");
  const guardar = formData.get("guardar") === "1";

  if (!(arquivoHistorico instanceof File) || !(arquivoNovos instanceof File)) {
    return Response.json({ error: "Envie os dois arquivos CSV: o histórico já classificado e os lançamentos novos." }, { status: 400 });
  }

  try {
    const resultado = await classificarLancamentos({
      historicoTexto: await arquivoHistorico.text(),
      novosTexto: await arquivoNovos.text(),
      nomeHistorico: arquivoHistorico.name,
      nomeNovos: arquivoNovos.name,
      guardar,
    });
    return Response.json(resultado);
  } catch (err) {
    if (err instanceof ErroEntrada) {
      return Response.json({ error: err.message }, { status: 400 });
    }
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
