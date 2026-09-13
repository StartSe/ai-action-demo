import { aiEnabled, askJSON, meta } from "@/lib/ai";
import { esperar, insightsDemo } from "@/lib/demo";
import { apagarTodos, listar, salvar, SENSIVEL } from "@/lib/historico";
import type { EntradaInsights, Insights, Resumo, SaidaInsights } from "@/lib/types";

const SYSTEM_INSIGHTS = `Você é um analista financeiro que apoia executivos de pequenas e médias empresas brasileiras a entender a planilha de despesas do mês sem precisar destrinchar números.
Você recebe apenas um resumo agregado (nunca a planilha inteira): totais, valores por mês, valores por categoria, variação do último mês e os maiores lançamentos.
Regras:
- Escreva em português do Brasil, direto, sem jargão contábil.
- Use os números do resumo recebido. Nunca invente valores que não estejam lá.
- "leitura_geral" tem de 2 a 3 frases sobre o que mais importa neste período.
- "destaques" tem de 3 a 4 itens curtos, cada um com um título, um detalhe de uma frase e um tipo: "alerta" para algo que pede atenção (custo subindo, concentração de risco), "oportunidade" para algo que pode ser aproveitado ou economizado, "neutro" para uma constatação sem julgamento.
- "perguntas_sugeridas" tem exatamente 3 perguntas curtas que o executivo poderia querer fazer sobre esses números.
Formato de saída (JSON):
{
  "leitura_geral": "2 a 3 frases",
  "destaques": [{"titulo": "", "detalhe": "", "tipo": "alerta|oportunidade|neutro"}],
  "perguntas_sugeridas": ["", "", ""]
}`;

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
  const insumo = "totais e categorias da planilha enviada";
  try {
    if (!aiEnabled()) {
      await esperar(1100);
      const insights = insightsDemo(resumo);
      const metaGerada = meta({ demo: true, insumo });
      const id = idSalvo({ resumo, insights, nomeArquivo, metaGerada, guardar });
      return Response.json({ demo: true, insights, meta: metaGerada, id });
    }
    const prompt = `Resumo agregado da planilha de despesas:\n${JSON.stringify(resumo, null, 2)}`;
    const insights = await askJSON<Insights>({ system: SYSTEM_INSIGHTS, prompt });
    const metaGerada = meta({ demo: false, insumo });
    const id = idSalvo({ resumo, insights, nomeArquivo, metaGerada, guardar });
    return Response.json({ demo: false, insights, meta: metaGerada, id });
  } catch (err) {
    console.error(err);
    const mensagem = err instanceof Error ? err.message : "Não foi possível gerar a leitura agora. Tente novamente.";
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
