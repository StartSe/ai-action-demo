import { aiEnabled, askJSON } from "@/lib/ai";
import { esperar, insightsDemo } from "@/lib/demo";
import type { Insights, Resumo } from "@/lib/types";

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

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { resumo?: Resumo };
  const { resumo } = body;
  if (!resumo || typeof resumo !== "object") {
    return Response.json({ error: "Envie o resumo da planilha analisada." }, { status: 400 });
  }
  try {
    if (!aiEnabled()) {
      await esperar(1100);
      return Response.json({ demo: true, insights: insightsDemo(resumo) });
    }
    const prompt = `Resumo agregado da planilha de despesas:\n${JSON.stringify(resumo, null, 2)}`;
    const insights = await askJSON<Insights>({ system: SYSTEM_INSIGHTS, prompt });
    return Response.json({ demo: false, insights });
  } catch (err) {
    console.error(err);
    const mensagem = err instanceof Error ? err.message : "Não foi possível gerar a leitura agora. Tente novamente.";
    return Response.json({ error: mensagem }, { status: 500 });
  }
}
