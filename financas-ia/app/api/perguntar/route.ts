import { aiEnabled, askText } from "@/lib/ai";
import { esperar, perguntarDemo } from "@/lib/demo";
import type { LancamentoResumo, Resumo } from "@/lib/types";

const SYSTEM_PERGUNTAR = `Você é um analista financeiro que responde perguntas sobre a planilha de despesas de uma empresa brasileira.
Você recebe um resumo agregado (totais, por mês, por categoria, variações e maiores lançamentos) e uma amostra de linhas reais da planilha (data, categoria, descrição e valor).
Regras:
- Responda em português do Brasil, em texto direto, sem introdução do tipo "com base nos dados".
- Use apenas os números do resumo e da amostra recebidos. Se a pergunta pedir algo que não dá para calcular com o que foi enviado, diga isso e sugira o que o executivo poderia olhar na planilha completa.
- Formate valores em reais (R$) com separador de milhar e vírgula decimal.
- Seja objetivo: no máximo um parágrafo curto, ou uma lista curta quando fizer sentido.`;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { resumo?: Resumo; amostra?: LancamentoResumo[]; pergunta?: string };
  const { resumo, amostra, pergunta } = body;
  if (!resumo || !pergunta) {
    return Response.json({ error: "Envie o resumo da planilha e a pergunta." }, { status: 400 });
  }
  try {
    if (!aiEnabled()) {
      await esperar(1000);
      return Response.json({ demo: true, resposta: perguntarDemo({ resumo, pergunta }) });
    }
    const prompt = `Resumo agregado:\n${JSON.stringify(resumo, null, 2)}\n\nAmostra de linhas da planilha (até 60):\n${JSON.stringify((amostra || []).slice(0, 60), null, 2)}\n\nPergunta do executivo: ${pergunta}`;
    const resposta = await askText({ system: SYSTEM_PERGUNTAR, prompt, maxTokens: 1000 });
    return Response.json({ demo: false, resposta });
  } catch (err) {
    console.error(err);
    const mensagem = err instanceof Error ? err.message : "Não foi possível responder agora. Tente novamente.";
    return Response.json({ error: mensagem }, { status: 500 });
  }
}
