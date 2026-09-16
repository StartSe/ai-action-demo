import { meta } from "@/lib/ai";
import { responderErro } from "../erros";
import { gerarInsights } from "@/lib/insights";
import { apagarTodos, listar, salvar, SENSIVEL } from "@/lib/historico";
import type { EntradaInsights, Insights, Resumo, SaidaInsights } from "@/lib/types";

/** Quando o app é sensível, só salva com opt-in explícito e por 30 dias; a amostra de lançamentos nunca é persistida. */
function idSalvo({ resumo, insights, nomeArquivo, metaGerada, guardar }: { resumo: Resumo; insights: Insights; nomeArquivo: string; metaGerada: ReturnType<typeof meta>; guardar: boolean }) {
  if (SENSIVEL && !guardar) return undefined;
  return salvar({
    tipo: "financas",
    titulo: `Leitura de ${nomeArquivo}`,
    entrada: { nomeArquivo } satisfies EntradaInsights,
    saida: { resumo, insights } satisfies SaidaInsights,
    meta: metaGerada,
    expiraEmDias: SENSIVEL ? 30 : undefined,
  });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { resumo?: Resumo; nomeArquivo?: string; guardar?: boolean };
  const { resumo } = body;
  const nomeArquivo = String(body.nomeArquivo || "planilha.csv");
  const guardar = Boolean(body.guardar);
  if (!resumo || typeof resumo !== "object") {
    return Response.json({ error: "Envie o resumo da planilha analisada." }, { status: 400 });
  }
  try {
    const { demo, insights, meta: metaGerada } = await gerarInsights(resumo);
    const id = idSalvo({ resumo, insights, nomeArquivo, metaGerada, guardar });
    return Response.json({ demo, insights, meta: metaGerada, id });
  } catch (err) {
    return responderErro(err, "Não foi possível gerar a leitura agora. Tente de novo em um minuto.");
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
