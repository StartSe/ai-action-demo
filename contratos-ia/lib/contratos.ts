// Análise de contratos (IA real ou fallback de demonstração), reaproveitada por app/api/analisar/route.ts e lib/ferramentas.ts (MCP).
import { aiEnabled, askJSON, meta } from "./ai";
import { analiseDemo, esperar } from "./demo";
import { getPolitica, politicaCadastrada, politicaComoTexto } from "./politica";
import { PAPEIS, type Analise } from "./types";

export const VALORES_PAPEL = PAPEIS.map((p) => p.valor);

const SYSTEM_ANALISE = `Você é um advogado experiente em contratos empresariais brasileiros que apoia executivos não juristas.
Sua tarefa é ler um contrato e apontar, do ponto de vista do papel informado pelo usuário, os riscos, os prazos e o que está faltando, para que ele decida o que negociar antes de enviar ao departamento jurídico.
Regras:
- Escreva em português do Brasil, direto, sem juridiquês. Explique o impacto prático de cada risco.
- Avalie tudo pela ótica do papel informado (quem está do outro lado se beneficia do que pesa contra ele).
- Cite trechos curtos e literais do contrato (até 200 caracteres) em "trecho". Não invente cláusulas: se algo não estiver no contrato, registre em "pontos_ausentes".
- nota_risco vai de 0 a 10, onde 10 é o mais arriscado para o papel informado. Seja calibrado: 3 a 4 para contratos equilibrados, 7 ou mais quando há cláusulas claramente desfavoráveis.
- Se o usuário indicou uma preocupação, trate-a explicitamente em pelo menos um item.
- Se uma política de contratos da empresa for informada, avalie o contrato contra cada item dela e liste em "fora_da_politica" toda cláusula que viole um item, citando o item da política e a cláusula do contrato. Sem política informada, ou sem violação encontrada, devolva a lista vazia.
- Máximo de 8 cláusulas de risco, 8 prazos, 8 obrigações, 8 pontos ausentes, 6 perguntas e 8 itens fora da política.
- Se o documento não for um contrato ou não tiver texto legível, explique isso no resumo_executivo e devolva as listas vazias.
Formato de saída (JSON):
{
  "tipo_contrato": "ex.: Contrato de prestação de serviços de tecnologia",
  "resumo_executivo": "3 frases: o que é, o que mais pesa contra o papel informado e o que fazer antes de assinar",
  "partes": [{"nome": "", "papel": ""}],
  "objeto": "1 a 2 frases",
  "essencial": {
    "valor_mensal": {"numero": "curto, ex.: R$ 48.000/mês (ou 'Não especificado')", "detalhe": "até 2 linhas: periodicidade, reajuste e penalidade por atraso"},
    "prazo": {"numero": "curto, ex.: 24 meses", "detalhe": "até 2 linhas: renovação e aviso prévio"},
    "multa": {"numero": "curto, ex.: 30% do saldo (ou 'Não especificada')", "detalhe": "até 2 linhas: quando incide e para quem"}
  },
  "nota_risco": 0,
  "prazos_criticos": [{"evento": "", "prazo": ""}],
  "clausulas_risco": [{"clausula": "", "trecho": "", "risco": "", "severidade": "alta|média|baixa", "sugestao_negociacao": ""}],
  "obrigacoes_principais": ["obrigação do papel informado"],
  "pontos_ausentes": ["o que um contrato deste tipo costuma ter e este não tem"],
  "perguntas_para_o_juridico": ["pergunta objetiva"],
  "fora_da_politica": [{"item_da_politica": "ex.: Multa máxima aceitável: 15%", "clausula": "ex.: Cláusula 10 – Rescisão", "detalhe": "por que essa cláusula viola o item"}]
}`;

export async function analisarContrato({
  texto,
  papel,
  preocupacao,
}: {
  texto: string;
  papel: string;
  preocupacao: string;
}): Promise<{ demo: boolean; analise: Analise; meta: ReturnType<typeof meta> }> {
  const insumo = "todo o contrato enviado e o papel informado";
  const politica = getPolitica();
  const temPolitica = politicaCadastrada(politica);

  if (!aiEnabled()) {
    await esperar(1400);
    return { demo: true, analise: analiseDemo({ papel, preocupacao, politica: temPolitica ? politica : undefined }), meta: meta({ demo: true, insumo }) };
  }
  const blocoPolitica = temPolitica
    ? `\n\nPolítica de contratos da empresa (avalie o contrato contra cada item e preencha "fora_da_politica" citando o item violado):\n${politicaComoTexto(politica)}`
    : "";
  const prompt = `Papel do usuário neste contrato: ${papel}.\nO que mais preocupa o usuário: ${preocupacao || "não informado"}.${blocoPolitica}\n\nContrato (texto integral):\n"""\n${texto}\n"""\n\nAnalise o contrato acima e devolva o JSON pedido.`;
  const analise = await askJSON<Analise>({ system: SYSTEM_ANALISE, prompt, maxTokens: 8000 });
  return { demo: false, analise, meta: meta({ demo: false, insumo }) };
}
