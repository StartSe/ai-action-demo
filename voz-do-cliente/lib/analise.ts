// Análise de comentários (IA real ou fallback de demonstração), reaproveitada por app/api/analisar/route.ts e lib/ferramentas.ts (MCP).
import { aiEnabled, askJSON } from "./ai";
import { analiseDemo, esperar } from "./demo";
import type { Analise, AnaliseBruta, Comentario, ContagemSentimento, Nps, Sentimento, Tema, TemaBruto } from "./types";

const LIMITE_COMENTARIOS = 500;
const TAMANHO_LOTE = 60; // acima de 120 comentários, classificamos em lotes desse tamanho
const LIMITE_LOTES_EM_PARALELO = 3;

/** Encontra, entre os comentários enviados, aquele de onde uma citação (exemplo) provavelmente veio, comparando o texto (não é feito pela IA, que só cita o trecho). */
function origemDoExemplo(exemplo: string, comentarios: Comentario[]): Comentario["origem"] {
  const alvo = exemplo.trim().toLowerCase();
  if (!alvo) return undefined;
  const achado = comentarios.find((c) => {
    const texto = c.texto.trim().toLowerCase();
    return !!texto && (texto.includes(alvo) || alvo.includes(texto));
  });
  return achado?.origem;
}

/** Quando todos os comentários enviados vêm da mesma origem (o caso comum: uma análise só junta pesquisa, ou só arquivo, ou só tickets importados), usada como resposta de todos os exemplos que o casamento por texto não encontrar — inclusive no modo demonstração, cujas citações são fixas e nunca batem literalmente com o texto enviado. */
function origemComum(comentarios: Comentario[]): Comentario["origem"] {
  const origens = new Set(comentarios.map((c) => c.origem).filter((o): o is NonNullable<typeof o> => !!o));
  return origens.size === 1 ? [...origens][0] : undefined;
}

function comOrigem(temas: TemaBruto[], comentarios: Comentario[]): Tema[] {
  const fallback = origemComum(comentarios);
  return temas.map((t) => ({
    ...t,
    exemplos: (t.exemplos || []).map((texto) => ({ texto, origem: origemDoExemplo(texto, comentarios) ?? fallback })),
  }));
}

// --- NPS: sempre calculado no servidor a partir das notas, nunca pela IA. ---
function calcularNps(comentarios: Comentario[]): Nps | null {
  const comNota = comentarios.filter((c) => typeof c.nota === "number" && Number.isFinite(c.nota));
  if (!comNota.length) return null;
  const promotores = comNota.filter((c) => (c.nota as number) >= 9).length;
  const detratores = comNota.filter((c) => (c.nota as number) <= 6).length;
  const neutros = comNota.length - promotores - detratores;
  const score = Math.round(((promotores - detratores) / comNota.length) * 100);
  return { promotores, neutros, detratores, score };
}

// Garante que positivo + neutro + negativo somem exatamente o total de comentários analisados,
// mesmo que a IA erre a conta. Ajusta o maior balde para absorver a diferença.
function corrigirSentimento(sentimento: Partial<ContagemSentimento> | undefined, total: number): ContagemSentimento {
  const s: ContagemSentimento = {
    positivo: Math.max(0, Math.round(Number(sentimento?.positivo) || 0)),
    neutro: Math.max(0, Math.round(Number(sentimento?.neutro) || 0)),
    negativo: Math.max(0, Math.round(Number(sentimento?.negativo) || 0)),
  };
  const soma = s.positivo + s.neutro + s.negativo;
  const diferenca = total - soma;
  if (diferenca !== 0) {
    const chaves: (keyof ContagemSentimento)[] = ["positivo", "neutro", "negativo"];
    const maiorChave = chaves.reduce((a, b) => (s[a] >= s[b] ? a : b));
    s[maiorChave] = Math.max(0, s[maiorChave] + diferenca);
  }
  return s;
}

function limitarComentarios(comentarios: Comentario[]) {
  const totalEnviado = comentarios.length;
  const truncado = totalEnviado > LIMITE_COMENTARIOS;
  const lista = truncado ? comentarios.slice(0, LIMITE_COMENTARIOS) : comentarios;
  return { lista, truncado, totalEnviado, totalAnalisado: lista.length };
}

const SYSTEM_ANALISE = `Você é um analista de experiência do cliente que lê grandes volumes de comentários (NPS, avaliações de loja, tickets de suporte) e transforma isso em decisões para um time de produto/CX no Brasil.
Regras:
- Escreva em português do Brasil, direto, sem jargão.
- Agrupe os comentários em 5 a 8 temas, ordenados do mais para o menos mencionado.
- "sentimento" deve ser a contagem de comentários positivos, neutros e negativos, e a soma das três precisa ser exatamente igual ao número total de comentários fornecidos.
- Para cada tema, cite de 1 a 2 trechos reais dos comentários recebidos (não invente citações).
- Ações prioritárias devem ser concretas e realistas para um time de produto/CX.
Formato de saída (JSON), sem o campo "nps" (ele é calculado fora da IA):
{
  "resumo_executivo": "3 frases sobre o que os comentários revelam e o que fazer a respeito",
  "sentimento": {"positivo": 0, "neutro": 0, "negativo": 0},
  "temas": [{"tema": "", "mencoes": 0, "sentimento_dominante": "positivo|neutro|negativo", "exemplos": ["trecho real de um comentário"], "acao_sugerida": ""}],
  "elogios_frequentes": ["frase curta"],
  "reclamacoes_frequentes": ["frase curta"],
  "citacoes_marcantes": [{"texto": "trecho real de um comentário", "sentimento": "positivo|neutro|negativo"}],
  "acoes_prioritarias": [{"acao": "", "impacto": "alto|médio|baixo", "esforco": "alto|médio|baixo", "justificativa": ""}]
}`;

function formatarComentarios(lista: Comentario[]) {
  return lista
    .map((c, i) => `${i + 1}. ${c.texto}${typeof c.nota === "number" ? ` (nota NPS: ${c.nota})` : ""}`)
    .join("\n");
}

async function analiseUnica(lista: Comentario[], contexto: string) {
  const prompt = `Contexto: os comentários são sobre "${contexto || "o produto/serviço"}".\nTotal de comentários: ${lista.length}.\n\nComentários:\n${formatarComentarios(lista)}`;
  return askJSON<AnaliseBruta>({ system: SYSTEM_ANALISE, prompt, maxTokens: 8000 });
}

// --- Classificação em lotes para volumes grandes (> 120 comentários) ---
const SYSTEM_CLASSIFICACAO = `Você classifica comentários de clientes um a um para alimentar uma análise agregada depois.
Para cada comentário numerado, identifique um tema curto (2 a 4 palavras, ex.: "atendimento lento", "app trava") e o sentimento predominante.
Responda somente com JSON no formato:
{"classificacoes": [{"indice": 1, "tema": "", "sentimento": "positivo|neutro|negativo"}]}
A lista "classificacoes" deve ter exatamente um item para cada comentário recebido, na mesma ordem.`;

interface Classificacao {
  indice?: number;
  tema?: string;
  sentimento?: string;
}

async function classificarLote(lote: Comentario[], contexto: string): Promise<Classificacao[]> {
  const prompt = `Contexto: os comentários são sobre "${contexto || "o produto/serviço"}".\n\nComentários:\n${formatarComentarios(lote)}`;
  const resultado = await askJSON<{ classificacoes?: Classificacao[] }>({ system: SYSTEM_CLASSIFICACAO, prompt, maxTokens: 4000 });
  return Array.isArray(resultado?.classificacoes) ? resultado.classificacoes : [];
}

function normalizarSentimento(valor: unknown): Sentimento {
  const v = String(valor || "").toLowerCase();
  if (v.startsWith("posit")) return "positivo";
  if (v.startsWith("negat")) return "negativo";
  return "neutro";
}

interface GrupoTema {
  tema: string;
  mencoes: number;
  positivo: number;
  neutro: number;
  negativo: number;
  exemplos: string[];
}

async function classificarEmLotes(lista: Comentario[], contexto: string) {
  const lotes: Comentario[][] = [];
  for (let i = 0; i < lista.length; i += TAMANHO_LOTE) lotes.push(lista.slice(i, i + TAMANHO_LOTE));

  const classificacoesPorLote: Classificacao[][] = new Array(lotes.length);
  for (let i = 0; i < lotes.length; i += LIMITE_LOTES_EM_PARALELO) {
    const fatia = lotes.slice(i, i + LIMITE_LOTES_EM_PARALELO);
    const resultados = await Promise.all(fatia.map((lote) => classificarLote(lote, contexto)));
    resultados.forEach((r, j) => (classificacoesPorLote[i + j] = r));
  }

  const sentimentoTotais: ContagemSentimento = { positivo: 0, neutro: 0, negativo: 0 };
  const grupos = new Map<string, GrupoTema>();

  lotes.forEach((lote, idxLote) => {
    const classificacoes = classificacoesPorLote[idxLote] || [];
    lote.forEach((comentario, idxLocal) => {
      const c = classificacoes[idxLocal] || {};
      const sentimento = normalizarSentimento(c.sentimento);
      const tema = String(c.tema || "outros").trim().toLowerCase() || "outros";
      sentimentoTotais[sentimento] += 1;

      if (!grupos.has(tema)) grupos.set(tema, { tema, mencoes: 0, positivo: 0, neutro: 0, negativo: 0, exemplos: [] });
      const grupo = grupos.get(tema) as GrupoTema;
      grupo.mencoes += 1;
      grupo[sentimento] += 1;
      if (grupo.exemplos.length < 3) grupo.exemplos.push(comentario.texto);
    });
  });

  const gruposOrdenados = [...grupos.values()].sort((a, b) => b.mencoes - a.mencoes);
  return { sentimentoTotais, gruposOrdenados };
}

const SYSTEM_CONSOLIDACAO = `Você recebe uma lista de temas brutos já contados a partir de centenas de comentários de clientes (cada um com quantas vezes apareceu, o sentimento predominante e exemplos reais) e precisa consolidar isso em um relatório executivo para um time de produto/CX no Brasil.
Regras:
- Junte temas brutos parecidos em 5 a 8 temas finais, somando as menções dos temas que você juntar.
- Use os exemplos fornecidos como citações reais, não invente falas novas; escolha até 2 por tema final.
- Escreva em português do Brasil, direto, sem jargão.
Formato de saída (JSON), sem os campos "sentimento" e "nps" (são calculados fora da IA):
{
  "resumo_executivo": "3 frases sobre o que os comentários revelam e o que fazer a respeito",
  "temas": [{"tema": "", "mencoes": 0, "sentimento_dominante": "positivo|neutro|negativo", "exemplos": ["trecho real de um comentário"], "acao_sugerida": ""}],
  "elogios_frequentes": ["frase curta"],
  "reclamacoes_frequentes": ["frase curta"],
  "citacoes_marcantes": [{"texto": "trecho real de um comentário", "sentimento": "positivo|neutro|negativo"}],
  "acoes_prioritarias": [{"acao": "", "impacto": "alto|médio|baixo", "esforco": "alto|médio|baixo", "justificativa": ""}]
}`;

async function analiseEmLotes(lista: Comentario[], contexto: string): Promise<AnaliseBruta> {
  const { sentimentoTotais, gruposOrdenados } = await classificarEmLotes(lista, contexto);

  const resumoGrupos = gruposOrdenados
    .slice(0, 40)
    .map((g) => {
      const chaves: Sentimento[] = ["positivo", "neutro", "negativo"];
      const dominante = chaves.reduce((a, b) => (g[a] >= g[b] ? a : b));
      return `- tema "${g.tema}": ${g.mencoes} menções, sentimento predominante ${dominante}. Exemplos: ${g.exemplos.map((e) => `"${e}"`).join(" | ")}`;
    })
    .join("\n");

  const prompt = `Contexto: os comentários são sobre "${contexto || "o produto/serviço"}".\nTotal de comentários analisados: ${lista.length}.\nDistribuição de sentimento já calculada: ${sentimentoTotais.positivo} positivos, ${sentimentoTotais.neutro} neutros, ${sentimentoTotais.negativo} negativos.\n\nTemas brutos agregados:\n${resumoGrupos}`;

  const consolidado = await askJSON<Omit<AnaliseBruta, "sentimento">>({ system: SYSTEM_CONSOLIDACAO, prompt, maxTokens: 8000 });
  return { ...consolidado, sentimento: sentimentoTotais };
}

export async function analisarComentarios({ comentarios, contexto }: { comentarios: Comentario[]; contexto: string }): Promise<{
  demo: boolean;
  analise: Analise;
  totalEnviado: number;
  totalAnalisado: number;
  truncado: boolean;
}> {
  const { lista, truncado, totalEnviado, totalAnalisado } = limitarComentarios(comentarios);
  const demo = !aiEnabled();

  let resultado: AnaliseBruta;
  if (demo) {
    await esperar(1200);
    resultado = analiseDemo({ comentarios: lista, contexto });
  } else if (lista.length > 120) {
    resultado = await analiseEmLotes(lista, contexto);
  } else {
    resultado = await analiseUnica(lista, contexto);
  }

  const temasBrutos = Array.isArray(resultado.temas) ? resultado.temas.slice(0, 8) : [];
  const analise: Analise = {
    resumo_executivo: String(resultado.resumo_executivo || ""),
    sentimento: corrigirSentimento(resultado.sentimento, totalAnalisado),
    nps: calcularNps(lista),
    temas: comOrigem(temasBrutos, lista),
    elogios_frequentes: Array.isArray(resultado.elogios_frequentes) ? resultado.elogios_frequentes : [],
    reclamacoes_frequentes: Array.isArray(resultado.reclamacoes_frequentes) ? resultado.reclamacoes_frequentes : [],
    citacoes_marcantes: Array.isArray(resultado.citacoes_marcantes) ? resultado.citacoes_marcantes.slice(0, 4) : [],
    acoes_prioritarias: Array.isArray(resultado.acoes_prioritarias) ? resultado.acoes_prioritarias.slice(0, 6) : [],
  };

  return { demo, analise, totalEnviado, totalAnalisado, truncado };
}
