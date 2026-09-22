// Decisões rápidas e tipadas pelo Jev (System One model da TypeSafe), servido pelo OpenRouter.
// O Jev não gera texto: recebe um estado e perguntas tipadas e devolve escolhas com probabilidade.
// Tudo o que o harness decide passa por aqui; o LLM (lib/ai.ts) só raciocina e escreve.
import { getConfig, setConfig } from "./store";
import { AppError } from "./api";

export const JEV_MODELO = "typesafe/jev-1.13";
/** Preço de entrada anunciado pelo OpenRouter em 21/09/2026; a saída é gratuita. */
export const JEV_USD_POR_MILHAO = 0.042;
/** O caminho documentado vem primeiro; o segundo é o citado por terceiros durante a beta. */
export const JEV_CAMINHOS = ["/api/v1/systemone", "/api/alpha/decisions"];
const ORIGEM = "https://openrouter.ai";

export type PerguntaChoice = { type: "choice"; instructions: string; criteria: Record<string, string> };
export type PerguntaScore = { type: "score"; instructions: string; criteria: string[] };
export type PerguntaNoul = { type: "noul"; instructions: string; criteria?: { yes?: string; no?: string } };
export type Pergunta = PerguntaChoice | PerguntaScore | PerguntaNoul;

export type Resposta = {
  tipo: Pergunta["type"];
  /** choice: a opção escolhida. */
  escolha?: string;
  /** score: posição contínua entre os níveis (0 é o primeiro). */
  pontuacao?: number;
  /** noul: probabilidade de a afirmação ser verdadeira. */
  sim?: number;
  probabilidades?: Record<string, number> | number[];
  confianca: number | null;
  bruto: unknown;
};
export type Decisao = {
  respostas: Record<string, Resposta>;
  modelo: string;
  caminho: string;
  latenciaMs: number;
  tokens: number;
  custoUsd: number;
  bruto: unknown;
};
export type OpcoesDecidir = { fetcher?: typeof fetch; signal?: AbortSignal; chave?: string };

export function chaveOpenRouter() {
  return getConfig("OPENROUTER_API_KEY") || "";
}
export function jevDisponivel() {
  return !!chaveOpenRouter();
}
export function custoJev(tokens: number) {
  return (tokens / 1_000_000) * JEV_USD_POR_MILHAO;
}

function numero(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
/** Aceita o formato documentado (choice/score/noul) e variações prováveis da beta. */
export function normalizar(pergunta: Pergunta, bruto: unknown): Resposta {
  const r = (bruto && typeof bruto === "object" ? bruto : {}) as Record<string, unknown>;
  const conf = numero(r.confidence);
  const probs = (Array.isArray(r.probabilities) || (r.probabilities && typeof r.probabilities === "object")) ? (r.probabilities as Record<string, number> | number[]) : undefined;
  if (pergunta.type === "noul") {
    const sim = numero(r.noul) ?? numero(r.probability) ?? numero(r.value) ?? numero(bruto) ?? (typeof r.answer === "boolean" ? (r.answer ? 1 : 0) : null);
    return { tipo: "noul", sim: sim ?? undefined, confianca: conf, bruto };
  }
  if (pergunta.type === "choice") {
    let escolha = typeof r.choice === "string" ? r.choice : typeof r.value === "string" ? r.value : typeof r.answer === "string" ? r.answer : undefined;
    if (!escolha && probs && !Array.isArray(probs)) {
      escolha = Object.entries(probs).sort((a, b) => b[1] - a[1])[0]?.[0];
    }
    return { tipo: "choice", escolha, probabilidades: probs, confianca: conf, bruto };
  }
  const pontuacao = numero(r.score) ?? numero(r.value);
  return { tipo: "score", pontuacao: pontuacao ?? undefined, probabilidades: probs, confianca: conf, bruto };
}

function extrairRespostas(dados: Record<string, unknown>): Record<string, unknown> {
  const candidato = dados.answers ?? dados.results ?? dados.decisions ?? dados.output;
  if (Array.isArray(candidato)) {
    const mapa: Record<string, unknown> = {};
    for (const item of candidato as Record<string, unknown>[]) {
      const id = typeof item.id === "string" ? item.id : typeof item.name === "string" ? item.name : typeof item.key === "string" ? item.key : null;
      if (id) mapa[id] = item;
    }
    return mapa;
  }
  return candidato && typeof candidato === "object" ? (candidato as Record<string, unknown>) : {};
}

/** Uma chamada ao Jev: todas as perguntas são avaliadas sobre o mesmo estado, em paralelo. */
export async function decidir(state: unknown, questions: Record<string, Pergunta>, opcoes: OpcoesDecidir = {}): Promise<Decisao> {
  const chave = opcoes.chave ?? chaveOpenRouter();
  if (!chave) throw new AppError("Conecte o OpenRouter em Configurações para ligar o harness.", 409);
  if (!Object.keys(questions).length) throw new AppError("Nenhuma pergunta para decidir.");
  const fetcher = opcoes.fetcher ?? fetch;
  const lembrado = getConfig("JEV_CAMINHO");
  const caminhos = lembrado && JEV_CAMINHOS.includes(lembrado) ? [lembrado, ...JEV_CAMINHOS.filter((c) => c !== lembrado)] : JEV_CAMINHOS;
  const inicio = Date.now();
  let ultimoErro: AppError | null = null;
  for (const caminho of caminhos) {
    const res = await fetcher(ORIGEM + caminho, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${chave}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/StartSe/ai-action-demo",
        "X-Title": "Cowork Jev",
      },
      body: JSON.stringify({ model: JEV_MODELO, state, questions }),
      signal: opcoes.signal ? AbortSignal.any([opcoes.signal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000),
    });
    if (res.status === 404 || res.status === 405) {
      ultimoErro = new AppError("O OpenRouter não reconheceu o endereço do Jev. O modelo está em beta; tente de novo mais tarde.", 502);
      continue;
    }
    if (!res.ok) {
      const texto = await res.text().catch(() => "");
      throw new AppError(
        res.status === 401 ? "A chave do OpenRouter não foi aceita. Reconecte em Configurações."
          : res.status === 402 ? "O saldo do OpenRouter é insuficiente para o Jev. Adicione créditos."
          : res.status === 429 ? "O Jev atingiu o limite de chamadas. Espere um pouco e tente de novo."
          : `O Jev não respondeu (${res.status}). ${texto.slice(0, 200)}`.trim(),
        502,
      );
    }
    const dados = (await res.json()) as Record<string, unknown>;
    if (lembrado !== caminho) setConfig("JEV_CAMINHO", caminho);
    const brutas = extrairRespostas(dados);
    const respostas: Record<string, Resposta> = {};
    for (const [id, pergunta] of Object.entries(questions)) respostas[id] = normalizar(pergunta, brutas[id]);
    const uso = (dados.usage || {}) as Record<string, unknown>;
    const tokens = numero(uso.prompt_tokens) ?? numero(uso.input_tokens) ?? numero(uso.total_tokens) ?? 0;
    return {
      respostas,
      modelo: typeof dados.model === "string" ? dados.model : JEV_MODELO,
      caminho,
      latenciaMs: Date.now() - inicio,
      tokens,
      custoUsd: numero(uso.cost) ?? custoJev(tokens),
      bruto: dados,
    };
  }
  throw ultimoErro || new AppError("O Jev não respondeu.", 502);
}

// --- Leitura das respostas com confiança como segundo eixo -------------------------------------
export const CONFIANCA_MINIMA = 0.6;
export function escolha(d: Decisao, chave: string): { valor: string | null; probabilidade: number | null; confianca: number | null; baixa: boolean } {
  const r = d.respostas[chave];
  const valor = r?.escolha ?? null;
  const probabilidade = valor && r?.probabilidades && !Array.isArray(r.probabilidades) ? numero(r.probabilidades[valor]) : null;
  const confianca = r?.confianca ?? probabilidade;
  return { valor, probabilidade, confianca, baixa: !valor || (confianca !== null && confianca < CONFIANCA_MINIMA) };
}
export function sim(d: Decisao, chave: string): { valor: boolean | null; probabilidade: number | null; baixa: boolean } {
  const p = d.respostas[chave]?.sim ?? null;
  return { valor: p === null ? null : p >= 0.5, probabilidade: p, baixa: p === null || Math.abs(p - 0.5) < 0.15 };
}
export function pontuacao(d: Decisao, chave: string): { valor: number | null; confianca: number | null; baixa: boolean } {
  const r = d.respostas[chave];
  const valor = r?.pontuacao ?? null;
  return { valor, confianca: r?.confianca ?? null, baixa: valor === null || (r?.confianca !== null && r?.confianca !== undefined && r.confianca < CONFIANCA_MINIMA) };
}

/** Estado e perguntas do botão "Testar decisão" em Configurações: um caso pequeno e em português. */
export const TESTE_JEV = {
  state: {
    planilha: "vendas_2025.csv",
    colunas: ["data", "regiao", "canal", "receita", "unidades"],
    pergunta_da_pessoa: "Qual região cresceu mais no último trimestre e por quê?",
  },
  questions: {
    intencao: {
      type: "choice",
      instructions: "O que a pessoa quer com `pergunta_da_pessoa`, considerando as `colunas` disponíveis?",
      criteria: {
        pergunta_dados: "Quer um número, comparação ou ranking calculado a partir da planilha.",
        previsao: "Quer saber o que vai acontecer no futuro.",
        grafico: "Pede explicitamente um gráfico ou visualização.",
        conversa: "Saudação ou comentário sem relação com dados.",
        fora_do_escopo: "Pede algo que a planilha não tem como responder.",
      },
    },
    precisa_codigo: { type: "noul", instructions: "Responder `pergunta_da_pessoa` exige agrupar, filtrar ou calcular sobre as linhas da planilha?" },
    complexidade: {
      type: "score",
      instructions: "Quão complexa é a análise pedida em `pergunta_da_pessoa`?",
      criteria: ["Consulta simples: um número ou uma lista direta.", "Análise composta: agrupar e comparar períodos ou categorias.", "Modelagem: previsão, correlação ou explicação causal."],
    },
  } satisfies Record<string, Pergunta>,
};
