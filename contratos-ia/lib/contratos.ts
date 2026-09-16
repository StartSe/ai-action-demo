// Análise de contratos (IA real ou fallback de demonstração), reaproveitada por app/api/analisar/route.ts e lib/ferramentas.ts (MCP).
import { aiEnabled, askJSON, meta } from "./ai";
import { analiseDemo, esperar } from "./demo";
import { getPolitica, politicaCadastrada, politicaComoTexto } from "./politica";
import { PAPEIS, type Analise } from "./types";

export const VALORES_PAPEL = PAPEIS.map((p) => p.valor);

/** Teto de texto enviado ao modelo. Um PDF de 10 MB passa de meio milhão de caracteres e estoura a
 * janela de qualquer modelo: cortar aqui, avisando o que foi lido, é melhor do que devolver um erro
 * cru do provedor depois de a pessoa esperar meio minuto. */
export const LIMITE_CARACTERES = 120_000;

/** Corta o contrato no limite do modelo e devolve o aviso, em linguagem de negócio, do que foi lido.
 * `paginas` vem do PDF (uma entrada por página); texto colado chega como uma entrada só e o aviso fala
 * de caracteres, não de páginas — a tela nunca pode afirmar uma contagem de páginas que não existe. */
export function limitarTexto(paginas: string[]): { texto: string; aviso?: string } {
  const partes = paginas.map((p) => p.trim()).filter(Boolean);
  const inteiro = partes.join("\n\n");
  if (inteiro.length <= LIMITE_CARACTERES) return { texto: inteiro };

  if (partes.length > 1) {
    const lidas: string[] = [];
    let total = 0;
    for (const pagina of partes) {
      if (lidas.length > 0 && total + pagina.length > LIMITE_CARACTERES) break;
      lidas.push(pagina);
      total += pagina.length + 2;
    }
    const texto = lidas.join("\n\n").slice(0, LIMITE_CARACTERES);
    return { texto, aviso: `Contrato muito longo: analisamos as primeiras ${lidas.length} páginas, de ${partes.length}.` };
  }

  // Texto colado: corta na última quebra de linha antes do limite, para não partir uma cláusula no meio.
  const bruto = inteiro.slice(0, LIMITE_CARACTERES);
  const corte = bruto.lastIndexOf("\n");
  const texto = corte > LIMITE_CARACTERES * 0.9 ? bruto.slice(0, corte) : bruto;
  const mil = (n: number) => Math.round(n / 1000);
  return { texto, aviso: `Contrato muito longo: analisamos os primeiros ${mil(texto.length)} mil caracteres, de ${mil(inteiro.length)} mil.` };
}

const SYSTEM_ANALISE = `Você é um advogado experiente em contratos empresariais brasileiros que apoia executivos não juristas.
Sua tarefa é ler um contrato e apontar, do ponto de vista do papel informado pelo usuário, os riscos, os prazos e o que está faltando, para que ele decida o que negociar antes de enviar ao departamento jurídico.
Regras:
- Escreva em português do Brasil, direto, sem juridiquês. Explique o impacto prático de cada risco.
- Avalie tudo pela ótica do papel informado (quem está do outro lado se beneficia do que pesa contra ele).
- Cite trechos curtos e literais do contrato (até 200 caracteres) em "trecho". Não invente cláusulas: se algo não estiver no contrato, registre em "pontos_ausentes".
- nota_risco vai de 0 a 10, onde 10 é o mais arriscado para o papel informado. Seja calibrado: 3 a 4 para contratos equilibrados, 7 ou mais quando há cláusulas claramente desfavoráveis.
- Se o usuário indicou uma preocupação, trate-a explicitamente em pelo menos um item.
- Se uma política de contratos da empresa for informada, avalie o contrato contra cada item dela e liste em "fora_da_politica" toda cláusula que viole um item, citando o item da política e a cláusula do contrato. Sem política informada, ou sem violação encontrada, devolva a lista vazia.
- Em "prazos", extraia eventos de calendário que decidem uma ação do usuário (renovação automática e o aviso para evitá-la, reajuste de valor, fim de vigência, entrega de dados após rescisão etc.), cada um com uma data completa no formato AAAA-MM-DD (nunca só "90 dias antes" ou um dia da semana). Use a data de hoje informada no prompt como referência: quando o contrato tiver uma data de assinatura ou início explícita, calcule a partir dela; quando não tiver, estime a partir de hoje. Em "descricao", cite a cláusula de origem e a ação sugerida em até 2 frases.
- "tipo_contrato" tem no máximo 60 caracteres: só o tipo, sem as partes nem o objeto detalhado.
- Máximo de 8 cláusulas de risco, 8 prazos, 8 obrigações, 8 pontos ausentes, 6 perguntas e 8 itens fora da política.
- Se o documento não for um contrato ou não tiver texto legível, explique isso no resumo_executivo e devolva as listas vazias.
Formato de saída (JSON):
{
  "tipo_contrato": "até 60 caracteres, ex.: Contrato de prestação de serviços de tecnologia",
  "resumo_executivo": "3 frases: o que é, o que mais pesa contra o papel informado e o que fazer antes de assinar",
  "partes": [{"nome": "", "papel": ""}],
  "objeto": "1 a 2 frases",
  "essencial": {
    "valor_mensal": {"numero": "curto, ex.: R$ 48.000/mês (ou 'Não especificado')", "detalhe": "até 2 linhas: periodicidade, reajuste e penalidade por atraso"},
    "prazo": {"numero": "curto, ex.: 24 meses", "detalhe": "até 2 linhas: renovação e aviso prévio"},
    "multa": {"numero": "curto, ex.: 30% do saldo (ou 'Não especificada')", "detalhe": "até 2 linhas: quando incide e para quem"}
  },
  "nota_risco": 0,
  "prazos": [{"tipo": "ex.: Aviso de não renovação, Reajuste anual, Fim da vigência", "data": "AAAA-MM-DD", "descricao": "cláusula de origem e ação sugerida, até 2 frases"}],
  "clausulas_risco": [{"clausula": "", "trecho": "", "risco": "", "severidade": "alta|média|baixa", "sugestao_negociacao": ""}],
  "obrigacoes_principais": ["obrigação do papel informado"],
  "pontos_ausentes": ["o que um contrato deste tipo costuma ter e este não tem"],
  "perguntas_para_o_juridico": ["pergunta objetiva"],
  "fora_da_politica": [{"item_da_politica": "ex.: Multa máxima aceitável: 15%", "clausula": "ex.: Cláusula 10 – Rescisão", "detalhe": "por que essa cláusula viola o item"}]
}`;

/** `paginas`: o contrato dividido como veio (uma entrada por página do PDF, ou uma só com o texto colado). */
export async function analisarContrato({
  paginas,
  papel,
  preocupacao,
}: {
  paginas: string[];
  papel: string;
  preocupacao: string;
}): Promise<{ demo: boolean; analise: Analise; meta: ReturnType<typeof meta> }> {
  const insumo = "todo o contrato enviado e o papel informado";
  const politica = getPolitica();
  const temPolitica = politicaCadastrada(politica);
  const { texto, aviso } = limitarTexto(paginas);

  if (!aiEnabled()) {
    await esperar(1400);
    const analise = analiseDemo({ papel, preocupacao, politica: temPolitica ? politica : undefined });
    return { demo: true, analise: { ...analise, avisoTamanho: aviso }, meta: meta({ demo: true, insumo }) };
  }
  const blocoPolitica = temPolitica
    ? `\n\nPolítica de contratos da empresa (avalie o contrato contra cada item e preencha "fora_da_politica" citando o item violado):\n${politicaComoTexto(politica)}`
    : "";
  const trecho = aviso ? "Contrato (trecho inicial; o documento continua além do que foi enviado)" : "Contrato (texto integral)";
  const prompt = `Data de hoje: ${new Date().toISOString().slice(0, 10)}\nPapel do usuário neste contrato: ${papel}.\nO que mais preocupa o usuário: ${preocupacao || "não informado"}.${blocoPolitica}\n\n${trecho}:\n"""\n${texto}\n"""\n\nAnalise o contrato acima e devolva o JSON pedido.`;
  const analise = await askJSON<Analise>({ system: SYSTEM_ANALISE, prompt, maxTokens: 8000 });
  return { demo: false, analise: { ...analise, tipo_contrato: (analise.tipo_contrato || "").slice(0, 60).trim(), avisoTamanho: aviso }, meta: meta({ demo: false, insumo }) };
}
