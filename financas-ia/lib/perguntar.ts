// Resposta a perguntas sobre a planilha (IA real ou fallback de demonstração), reaproveitada por app/api/perguntar/route.ts e lib/ferramentas.ts (MCP).
import { aiEnabled, askText } from "./ai";
import { esperar, perguntarDemo } from "./demo";
import type { LancamentoResumo, Resumo } from "./types";

const SYSTEM_PERGUNTAR = `Você é um analista financeiro que responde perguntas sobre a planilha de despesas de uma empresa brasileira.
Você recebe um resumo agregado (totais, por mês, por categoria, variações e maiores lançamentos) e uma amostra de linhas reais da planilha (data, categoria, descrição e valor).
Regras:
- Responda em português do Brasil, em texto direto, sem introdução do tipo "com base nos dados".
- Use apenas os números do resumo e da amostra recebidos. Se a pergunta pedir algo que não dá para calcular com o que foi enviado, diga isso e sugira o que o executivo poderia olhar na planilha completa.
- Formate valores em reais (R$) com separador de milhar e vírgula decimal.
- Seja objetivo: no máximo um parágrafo curto, ou uma lista curta quando fizer sentido.`;

export async function responderPergunta({ resumo, amostra, pergunta }: { resumo: Resumo; amostra: LancamentoResumo[]; pergunta: string }): Promise<{ demo: boolean; resposta: string }> {
  if (!aiEnabled()) {
    await esperar(1000);
    return { demo: true, resposta: perguntarDemo({ resumo, pergunta }) };
  }
  const prompt = `Resumo agregado:\n${JSON.stringify(resumo, null, 2)}\n\nAmostra de linhas da planilha (até 60):\n${JSON.stringify((amostra || []).slice(0, 60), null, 2)}\n\nPergunta do executivo: ${pergunta}`;
  const resposta = await askText({ system: SYSTEM_PERGUNTAR, prompt, maxTokens: 1000 });
  return { demo: false, resposta };
}
