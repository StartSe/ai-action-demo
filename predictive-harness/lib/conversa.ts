// O laço do agente de FP&A, turno a turno: triagem (Jev) → roteamento (código) → especificação do
// cenário (LLM traduz, código valida) → motor (código) → narrativa (LLM, só com os números do motor) →
// verificação (Jev) → próximas perguntas (Jev ranqueia). Perguntas descritivas seguem pelos agregados
// da base. Cada decisão é registrada e devolvida com a mensagem, para a coluna "Como cheguei aqui".
// Sem OpenRouter (Jev) o harness não roda.
import { randomUUID } from "node:crypto";
import { abrirBanco } from "./store";
import { AppError } from "./api";
import { decidir, escolha, sim, pontuacao, jevDisponivel, type Pergunta, type Decisao } from "./jev";
import { perguntar, parseJSON, conversaPronta, rotuloModelo, aiConfig } from "./ai";
import { lerLinhas, resumoParaIA } from "./planilhas";
import { carregarBase, encontrarProduto, premissasDeTodos, resumoBaseParaIA, salvarPremissa, type Base } from "./base";
import { executarEspecificacao, recalcular } from "./cenarios";
import { respostaExemplo, SUGESTOES_EXEMPLO } from "./demo";
import { CHAVES_PREMISSA, FAIXAS, GLOSSARIO, MARGEM_ALVO_PADRAO, ROTULO_PREMISSA, UNIDADE_PREMISSA, VARIAVEIS_META, formatarPremissa, type ChavePremissa, type VariavelMeta } from "./fpa";
import { fmtBRL, fmtNum, fmtPctPontos, fmtPp } from "./formato";
import type { Cartao, CategoriaPergunta, Especificacao, Mensagem, RegistroDecisao, ResumoHarness, Sugestao } from "./types";

const LIMITE_PERGUNTA = 2000;
/** A conversa é da base inteira, não de uma planilha. */
const CHAVE_BASE = "base";
const ROTULO_TIPO: Record<string, string> = {
  descritiva: "Descritiva (o que a base diz)",
  diagnostica: "Diagnóstico (por que e onde)",
  cenario: "Cenário (e se)",
  previsao: "Previsão",
  meta_reversa: "Meta reversa (quanto cabe)",
  risco: "Risco (quando deixa de se pagar)",
  conceito: "Explicação de conceito",
  fora: "Fora do escopo da base",
};
const CATEGORIA: Record<string, CategoriaPergunta> = { descritiva: "descritiva", diagnostica: "diagnostico", cenario: "cenario", previsao: "descritiva", meta_reversa: "meta_reversa", risco: "risco", conceito: "conceito", fora: "outra" };
const ROTULO_HORIZONTE: Record<string, string> = { mes: "Mês", trimestre: "Trimestre", semestre: "Semestre", ano: "Ano" };
const ROTULO_VISUAL: Record<string, string> = { cascata: "Cascata do cenário", sensibilidade: "Barras de sensibilidade", ponto_equilibrio: "Curva do ponto de equilíbrio", tabela: "Tabela", texto: "Só texto" };
const NIVEIS_IMPACTO = ["Baixo", "Médio", "Alto"];
const NIVEIS_PLAUSIVEL = ["Implausível", "Possível", "Plausível"];

function db() {
  const b = abrirBanco();
  b.exec(`CREATE TABLE IF NOT EXISTS mensagens (id TEXT PRIMARY KEY, planilha_id TEXT NOT NULL, json TEXT NOT NULL, criado_em TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS mensagens_planilha ON mensagens(planilha_id, criado_em);`);
  return b;
}
export function listarMensagens(): Mensagem[] {
  const rows = db().prepare("SELECT json FROM mensagens WHERE planilha_id = ? ORDER BY criado_em, rowid").all(CHAVE_BASE) as { json: string }[];
  return rows.map((r) => JSON.parse(r.json) as Mensagem);
}
export function obterMensagem(id: string): Mensagem {
  const row = db().prepare("SELECT json FROM mensagens WHERE id = ? AND planilha_id = ?").get(id, CHAVE_BASE) as { json: string } | undefined;
  if (!row) throw new AppError("Resposta não encontrada.", 404);
  return JSON.parse(row.json) as Mensagem;
}
function gravar(m: Mensagem) {
  db().prepare("INSERT INTO mensagens (id, planilha_id, json, criado_em) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET json = excluded.json").run(m.id, CHAVE_BASE, JSON.stringify(m), m.criadoEm);
  return m;
}
export function limparConversa() {
  db().prepare("DELETE FROM mensagens WHERE planilha_id = ?").run(CHAVE_BASE);
}

// --- Perguntas sugeridas por categoria -----------------------------------------------------------------
export function sugestoesIniciais(base: Base): Sugestao[] {
  if (base.demo) return SUGESTOES_EXEMPLO;
  const prod = base.produtos[0]?.nome;
  if (!prod) return [];
  return [
    { categoria: "diagnostico", texto: "Qual produto tem a melhor margem de contribuição por turma?" },
    { categoria: "cenario", texto: `Se abrirmos uma nova turma de ${prod}, qual a contribuição para a margem do trimestre?` },
    { categoria: "meta_reversa", texto: `Quanto posso gastar em marketing por aluno em ${prod} e manter ${MARGEM_ALVO_PADRAO}% de margem?` },
    { categoria: "risco", texto: `Com quantos alunos uma turma de ${prod} deixa de se pagar?` },
  ];
}
function candidatasSeguintes(spec: Especificacao, produto: string, base: Base): string[] {
  const outro = base.produtos.find((p) => p.nome !== produto)?.nome;
  const lista = [
    spec.tipo === "cenario" ? `E se forem ${spec.turmas + 1} turmas de ${produto}?` : `Se abrirmos uma nova turma de ${produto}, qual a contribuição para a margem do trimestre?`,
    spec.tipo === "ponto_equilibrio" ? `E se o ticket de ${produto} cair 10%, quantos alunos passam a ser necessários?` : `Com quantos alunos uma turma de ${produto} deixa de se pagar?`,
    spec.tipo === "meta_reversa" ? `Qual o ticket mínimo de ${produto} para manter ${spec.meta?.margemAlvoPct ?? MARGEM_ALVO_PADRAO}% de margem?` : `Quanto posso gastar em marketing por aluno em ${produto} e manter ${MARGEM_ALVO_PADRAO}% de margem?`,
    `Qual produto tem a melhor margem de contribuição por turma?`,
    outro ? `Se abrirmos uma nova turma de ${outro}, qual a contribuição para a margem do trimestre?` : `E se o desconto de ${produto} subir para 15%?`,
  ];
  return [...new Set(lista)];
}

// --- Perguntas do Jev por estação -------------------------------------------------------------------
function perguntasTriagem(): Record<string, Pergunta> {
  const perguntas: Record<string, Pergunta> = {
    tipo_pergunta: {
      type: "choice",
      instructions: "O que a pessoa quer em `pergunta`, considerando `produtos`, `premissas_disponiveis` e `conversa_anterior`?",
      criteria: {
        descritiva: "Quer saber o que a base mostra: totais, médias, evolução, ranking simples.",
        diagnostica: "Quer entender por que ou onde: comparar produtos, margens, canais; achar o melhor ou o pior.",
        cenario: "Quer saber o efeito de uma hipótese futura: abrir turmas, mudar ticket, desconto ou custo (\"se...\", \"e se...\").",
        previsao: "Quer uma projeção do que vai acontecer sem hipótese própria (tendência à frente).",
        meta_reversa: "Parte de um resultado desejado (margem, contribuição) e pergunta quanto uma premissa pode variar (\"quanto posso gastar\", \"qual o mínimo de\").",
        risco: "Quer saber quando algo deixa de se pagar ou qual o pior caso: ponto de equilíbrio, ocupação mínima.",
        conceito: "Quer que um termo ou métrica seja explicado, sem calcular.",
        fora: "Saudação, agradecimento ou pedido sem relação com planejamento financeiro desta base.",
      },
    },
    horizonte: { type: "choice", instructions: "Qual horizonte de tempo `pergunta` considera? Se não disser, escolha o mais natural para a pergunta.", criteria: { mes: "Um mês.", trimestre: "Um trimestre (padrão para turmas e metas).", semestre: "Um semestre.", ano: "Um ano ou mais." } },
    premissas_ok: { type: "noul", instructions: "As `premissas_disponiveis` dos `produtos` bastam para calcular o que `pergunta` pede, sem que a pessoa precise informar algo novo?" },
    impacto: { type: "score", instructions: "Qual o impacto da decisão que `pergunta` orienta?", criteria: ["Baixo: leitura ou consulta, sem decisão associada.", "Médio: orienta uma decisão operacional, como abrir uma turma ou ajustar a verba de marketing.", "Alto: decisão estratégica ou de grande valor, como criar ou encerrar um produto, mudar preço geral ou cortar equipe."] },
    dado_sensivel: { type: "noul", instructions: "`pergunta` pede para expor dados de pessoas identificáveis (nomes, e-mails, documentos, telefones)?" },
  };
  for (const chave of CHAVES_PREMISSA) perguntas[`driver_${chave}`] = { type: "noul", instructions: `\`pergunta\` envolve ou altera a premissa "${ROTULO_PREMISSA[chave].toLowerCase()}"?` };
  return perguntas;
}
function perguntasVerificacaoMotor(): Record<string, Pergunta> {
  return {
    numeros_batem: { type: "noul", instructions: "Todos os números citados em `leitura` aparecem em `numeros_do_motor` (aceitando arredondamento para milhares ou uma casa decimal)?" },
    responde: { type: "noul", instructions: "A `leitura` responde diretamente ao que foi pedido em `pergunta`?" },
    premissa_implicita: { type: "noul", instructions: "A `leitura` afirma algo que depende de uma premissa que NÃO está em `premissas` (ex.: demanda garantida, preço de mercado, sazonalidade)?" },
    escalar: { type: "noul", instructions: "A `leitura` recomenda uma decisão de negócio (abrir turma, mudar verba, preço ou desconto) que mereça validação de quem responde pela área antes de agir?" },
    visual: { type: "choice", instructions: "Que visual ajuda mais a entender a `leitura`?", criteria: ROTULO_VISUAL },
  };
}
function perguntasVerificacaoAgregados(): Record<string, Pergunta> {
  return {
    responde: { type: "noul", instructions: "A `resposta` responde diretamente ao que foi pedido em `pergunta`?" },
    numeros_batem: { type: "noul", instructions: "Todos os números citados em `resposta` aparecem em `resumo_da_base` ou derivam de uma operação simples (soma, diferença, percentual) sobre eles?" },
    escalar: { type: "noul", instructions: "A `resposta` recomenda uma decisão de negócio relevante que mereça validação humana antes de agir?" },
    visual: { type: "choice", instructions: "Que visual ajuda mais a entender a `resposta`?", criteria: { tabela: "Vários números para consultar.", texto: "Um texto curto basta." } },
  };
}

// --- Registro das decisões -------------------------------------------------------------------------------
type Contexto = { decisoes: RegistroDecisao[]; harness: ResumoHarness; inicio: number; signal?: AbortSignal };
function registrar(ctx: Contexto, d: Decisao) {
  ctx.harness.chamadasJev++;
  ctx.harness.latenciaJevMs += d.latenciaMs;
  ctx.harness.custoJevUsd += d.custoUsd;
  ctx.harness.tokensJev += d.tokens;
  ctx.harness.caminho = d.caminho;
}
const pf = (n: number | null) => (n === null ? "" : ` (${n.toFixed(1).replace(".", ",")})`);
function anotar(ctx: Contexto, estacao: RegistroDecisao["estacao"], chave: string, rotulo: string, valor: string) {
  ctx.decisoes.push({ estacao, chave, rotulo, valor, probabilidade: null, confianca: null, baixaConfianca: false });
}
function anotarEscolha(ctx: Contexto, estacao: RegistroDecisao["estacao"], d: Decisao, chave: string, rotulo: string, rotulos: Record<string, string>) {
  const e = escolha(d, chave);
  ctx.decisoes.push({ estacao, chave, rotulo, valor: e.valor ? rotulos[e.valor] || e.valor : "Sem resposta", probabilidade: e.probabilidade, confianca: e.confianca, baixaConfianca: e.baixa });
  return e;
}
function anotarSim(ctx: Contexto, estacao: RegistroDecisao["estacao"], d: Decisao, chave: string, rotulo: string) {
  const s = sim(d, chave);
  ctx.decisoes.push({ estacao, chave, rotulo, valor: s.valor === null ? "Sem resposta" : s.valor ? "Sim" : "Não", probabilidade: s.probabilidade, confianca: null, baixaConfianca: s.baixa });
  return s;
}
function anotarNivel(ctx: Contexto, estacao: RegistroDecisao["estacao"], d: Decisao, chave: string, rotulo: string, niveis: string[]) {
  const p = pontuacao(d, chave);
  const idx = p.valor === null ? -1 : Math.min(niveis.length - 1, Math.max(0, Math.round(p.valor)));
  ctx.decisoes.push({ estacao, chave, rotulo, valor: idx < 0 ? "Sem resposta" : niveis[idx] + pf(p.valor), probabilidade: null, confianca: p.confianca, baixaConfianca: p.baixa });
  return p;
}

// --- Especificação: o LLM traduz, o código valida -----------------------------------------------------
export type Triagem = { tipo: string; horizonte: Especificacao["horizonte"]; drivers: ChavePremissa[] };
/** Exportada para teste: é a única fronteira em que o LLM produz estrutura, e ela é validada campo a campo. */
export function normalizarEspecificacao(bruto: unknown, triagem: Triagem, base: Base, avisos: string[]): Especificacao {
  const r = (bruto && typeof bruto === "object" ? bruto : {}) as Record<string, unknown>;
  const tipoTriagem: Especificacao["tipo"] = triagem.tipo === "meta_reversa" ? "meta_reversa" : triagem.tipo === "risco" ? "ponto_equilibrio" : "cenario";
  const tipo = r.tipo === "cenario" || r.tipo === "ponto_equilibrio" || r.tipo === "meta_reversa" ? r.tipo : tipoTriagem;
  const turmasBruto = typeof r.turmas === "number" ? r.turmas : typeof r.turmas === "string" ? Number(r.turmas) : 1;
  const turmas = Number.isFinite(turmasBruto) && turmasBruto >= 1 && turmasBruto <= 200 ? Math.round(turmasBruto) : 1;
  if (turmasBruto !== turmas && Number.isFinite(turmasBruto)) avisos.push(`Número de turmas fora do razoável (${turmasBruto}); considerei ${turmas}.`);
  const horizonte = ["mes", "trimestre", "semestre", "ano"].includes(String(r.horizonte)) ? (r.horizonte as Especificacao["horizonte"]) : triagem.horizonte;
  const numeros = (obj: unknown, rotulo: string): Partial<Record<ChavePremissa, number>> => {
    const saida: Partial<Record<ChavePremissa, number>> = {};
    if (!obj || typeof obj !== "object") return saida;
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (!CHAVES_PREMISSA.includes(k as ChavePremissa)) continue;
      const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(/\./g, "").replace(",", ".")) : NaN;
      const f = FAIXAS[k as ChavePremissa];
      if (!Number.isFinite(n)) continue;
      if (n < f.min || n > f.max) {
        avisos.push(`${ROTULO_PREMISSA[k as ChavePremissa]} ${rotulo} (${formatarPremissa(k as ChavePremissa, n)}) está fora da faixa aceita e foi ignorado.`);
        continue;
      }
      saida[k as ChavePremissa] = n;
    }
    return saida;
  };
  const premissas = numeros(r.premissas, "dita na pergunta");
  const sugestoes = numeros(r.sugestoes, "sugerida");
  let meta: Especificacao["meta"] = null;
  if (tipo === "meta_reversa") {
    const m = (r.meta && typeof r.meta === "object" ? r.meta : {}) as Record<string, unknown>;
    const variavel = VARIAVEIS_META.includes(m.variavel as VariavelMeta) ? (m.variavel as VariavelMeta) : triagem.drivers.find((d): d is VariavelMeta => VARIAVEIS_META.includes(d as VariavelMeta)) || "cacAluno";
    const alvoBruto = typeof m.margemAlvoPct === "number" ? m.margemAlvoPct : typeof m.margemAlvoPct === "string" ? Number(m.margemAlvoPct) : NaN;
    const margemAlvoPct = Number.isFinite(alvoBruto) && alvoBruto > 0 && alvoBruto < 95 ? alvoBruto : MARGEM_ALVO_PADRAO;
    if (!Number.isFinite(alvoBruto)) avisos.push(`A pergunta não disse a margem-alvo; usei ${MARGEM_ALVO_PADRAO}%.`);
    meta = { variavel, margemAlvoPct };
  }
  return { tipo, produto: typeof r.produto === "string" ? r.produto : null, turmas, horizonte, premissas, sugestoes, meta };
}
async function traduzirEspecificacao(texto: string, base: Base, triagem: Triagem, historico: { papel: string; texto: string }[], signal?: AbortSignal): Promise<{ spec: Especificacao; avisos: string[] }> {
  const faltantes = premissasDeTodos(base).filter((p) => p.faltantes.length).map((p) => `${p.produto}: ${p.faltantes.map((f) => f).join(", ")}`);
  const system = `Você traduz uma pergunta de planejamento financeiro por turma em uma ESPECIFICAÇÃO FECHADA. Devolva SOMENTE um JSON com este formato exato:
{"tipo":"cenario|ponto_equilibrio|meta_reversa","produto":"<nome EXATO de um dos PRODUTOS, ou null se a pergunta não permite decidir>","turmas":<inteiro ≥ 1; turmas novas do cenário; 1 se não dito>,"horizonte":"mes|trimestre|semestre|ano","premissas":{...},"sugestoes":{...},"meta":{"variavel":"cacAluno|ticket|alunosPorTurma|custoFixoTurma|descontoPct","margemAlvoPct":<número>} ou null}
Chaves de premissa: alunosPorTurma (alunos), ticket (R$ cheio por aluno), descontoPct (0 a 95, em pontos), custoFixoTurma (R$ por turma), custoVariavelAluno (R$ por aluno), cacAluno (R$ de marketing por aluno).
"premissas": SOMENTE valores ditos explicitamente na pergunta (ex.: "com custo fixo de 38 mil" → custoFixoTurma: 38000). Nunca invente.
"sugestoes": valores plausíveis APENAS para premissas listadas em FALTAM, com base no contexto; ficam vazias se nada falta.
"tipo": cenario = efeito de abrir turmas ou mudar premissas; ponto_equilibrio = quantos alunos para se pagar; meta_reversa = quanto uma premissa pode variar mantendo uma margem.
Tipo sugerido pela triagem: ${triagem.tipo}. Horizonte sugerido: ${triagem.horizonte}.
PRODUTOS: ${base.produtos.map((p) => p.nome).join(" | ") || "(nenhum)"}
FALTAM: ${faltantes.join("; ") || "nada"}`;
  const prompt = historico.length ? `Conversa anterior:\n${historico.map((h) => `${h.papel === "usuario" ? "Pessoa" : "Analista"}: ${h.texto}`).join("\n")}\n\nPergunta agora: ${texto}` : texto;
  const bruto = await perguntar({ system, prompt, signal, maxTokens: 500 });
  const avisos: string[] = [];
  const json = parseJSON<unknown>(bruto);
  if (!json) avisos.push("O modelo não devolveu uma especificação legível; usei a triagem do Jev e as premissas da base.");
  return { spec: normalizarEspecificacao(json, triagem, base, avisos), avisos };
}

// --- Turno -------------------------------------------------------------------------------------------------
export async function executarTurno(perguntaBruta: unknown, signal?: AbortSignal): Promise<{ pergunta: Mensagem; resposta: Mensagem }> {
  const texto = typeof perguntaBruta === "string" ? perguntaBruta.trim().slice(0, LIMITE_PERGUNTA) : "";
  if (!texto) throw new AppError("Escreva uma pergunta.");
  const base = carregarBase();
  const pergunta: Mensagem = { id: randomUUID(), papel: "usuario", texto, criadoEm: new Date().toISOString() };

  // Sem harness (OpenRouter) ou sem LLM: em demonstração respondem as perguntas roteirizadas; fora dela, erro claro.
  const harnessLigado = jevDisponivel();
  const llmPronto = await conversaPronta();
  if (!harnessLigado || !llmPronto) {
    if (base.demo) {
      const ex = respostaExemplo(texto, base);
      if (ex) {
        gravar(pergunta);
        return { pergunta, resposta: gravar({ id: randomUUID(), papel: "assistente", criadoEm: new Date().toISOString(), ...ex }) };
      }
      throw new AppError(!harnessLigado ? "Em demonstração respondo só às perguntas sugeridas. Conecte o OpenRouter (Jev) e o ChatGPT em Configurações para perguntar qualquer coisa." : "Conecte o ChatGPT em Configurações, ou escolha um modelo do OpenRouter, para perguntar qualquer coisa.", 409);
    }
    throw new AppError(!harnessLigado ? "Conecte o OpenRouter em Configurações: o harness precisa do Jev para triar e verificar cada resposta." : "Conecte o ChatGPT em Configurações, ou escolha um modelo do OpenRouter, para conversar sobre a base.", 409);
  }
  if (!base.matriculas) throw new AppError("Envie uma planilha de matrículas (ou vendas) e confirme o mapeamento das colunas para começar.", 409);

  const ctx: Contexto = { decisoes: [], harness: { chamadasJev: 0, latenciaJevMs: 0, custoJevUsd: 0, tokensJev: 0, modelo: rotuloModelo(), latenciaTotalMs: 0, caminho: "", avisos: [] }, inicio: Date.now(), signal };
  const historico = listarMensagens().slice(-6).map((m) => ({ papel: m.papel, texto: m.texto.slice(0, 600) }));
  const premissasDisponiveis = premissasDeTodos(base).map((p) => ({ produto: p.produto, tem: p.premissas.map((x) => x.chave), faltam: p.faltantes }));

  // 1. Triagem (Jev, uma chamada)
  const triagem = await decidir({ pergunta: texto, produtos: base.produtos.map((p) => p.nome), premissas_disponiveis: premissasDisponiveis, periodo_de_referencia: base.baseline?.rotulo || null, conversa_anterior: historico }, perguntasTriagem(), { signal });
  registrar(ctx, triagem);
  const tipo = anotarEscolha(ctx, "triagem", triagem, "tipo_pergunta", "Tipo da pergunta", ROTULO_TIPO);
  const drivers = CHAVES_PREMISSA.filter((c) => sim(triagem, `driver_${c}`).valor);
  anotar(ctx, "triagem", "drivers", "Premissas envolvidas", drivers.length ? drivers.map((d) => ROTULO_PREMISSA[d]).join(", ") : "Nenhuma específica");
  const horizonte = anotarEscolha(ctx, "triagem", triagem, "horizonte", "Horizonte", ROTULO_HORIZONTE);
  const premissasOk = anotarSim(ctx, "triagem", triagem, "premissas_ok", "Base e premissas bastam");
  const impacto = anotarNivel(ctx, "triagem", triagem, "impacto", "Impacto da decisão", NIVEIS_IMPACTO);
  const sensivel = anotarSim(ctx, "triagem", triagem, "dado_sensivel", "Pede dado pessoal");

  // 2. Roteamento (código)
  const config = aiConfig();
  const tipoFinal = tipo.valor && !tipo.baixa ? tipo.valor : "diagnostica";
  if (tipo.baixa) ctx.harness.avisos.push("O tipo da pergunta veio com baixa confiança; tratei como diagnóstico sobre a base, sem montar cenário.");
  const motor = ["cenario", "meta_reversa", "risco"].includes(tipoFinal);
  const forte = !!config.modelForte && motor;
  ctx.harness.modelo = rotuloModelo(config, forte);
  const impactoAlto = impacto.valor !== null && impacto.valor >= 1.5 && !impacto.baixa;
  anotar(ctx, "roteamento", "caminho", "Caminho", tipoFinal === "fora" ? "Resposta curta sem tocar na base" : tipoFinal === "conceito" ? "Explicar o conceito, sem números" : motor ? "Especificar o cenário e calcular no motor" : "Responder com os agregados da base");
  anotar(ctx, "roteamento", "modelo", "Modelo escolhido", forte ? "Modelo forte (cenário)" : config.modelForte ? "Modelo padrão" : "Modelo padrão (sem modelo forte configurado)");
  if (sensivel.valor) ctx.harness.avisos.push("A pergunta toca em dado pessoal: a resposta usa só agregados, sem listar pessoas.");
  if (premissasOk.valor === false && !premissasOk.baixa && motor) ctx.harness.avisos.push("O Jev avalia que a base pode não bastar; o que faltar aparece como premissa a informar.");
  const categoria = CATEGORIA[tipoFinal] || "outra";
  const baseCurta = `Você é um analista de FP&A (planejamento financeiro) sênior falando com um executivo brasileiro. Português do Brasil, direto, sem títulos, 1 a 2 parágrafos. Pode usar **negrito**.`;

  let resposta = "";
  let cartoes: Cartao[] = [];
  let fpa: Mensagem["fpa"];
  let sugestoes: string[] = [];

  if (tipoFinal === "fora" || tipoFinal === "conceito") {
    const glossario = Object.entries(GLOSSARIO).map(([t, d]) => `${t}: ${d}`).join("\n");
    resposta = await perguntar({ system: tipoFinal === "fora" ? `${baseCurta} A mensagem não é sobre planejamento financeiro desta base. Responda em uma ou duas frases, sem inventar números, e lembre que você analisa produtos, turmas, custos e marketing da empresa.` : `${baseCurta} Explique o conceito pedido em até 4 frases, sem números da base, com um exemplo do dia a dia de uma escola de negócios (turma, ticket, custo fixo). Use estas definições quando couber:\n${glossario}`, prompt: texto, signal, maxTokens: 350 });
  } else if (motor) {
    // 3. Especificação (LLM traduz, código valida)
    const tri: Triagem = { tipo: tipoFinal, horizonte: (horizonte.valor as Especificacao["horizonte"]) || "trimestre", drivers };
    const { spec, avisos } = await traduzirEspecificacao(texto, base, tri, historico, signal);
    ctx.harness.avisos.push(...avisos);
    const produto = encontrarProduto(spec.produto, base.produtos) || encontrarProduto(texto, base.produtos);
    anotar(ctx, "especificacao", "tipo", "Tipo do cálculo", spec.tipo === "cenario" ? "Cenário de novas turmas" : spec.tipo === "ponto_equilibrio" ? "Ponto de equilíbrio" : "Meta reversa");
    anotar(ctx, "especificacao", "produto", "Produto identificado", produto ? produto.nome : "Não identificado");
    if (spec.tipo === "cenario") anotar(ctx, "especificacao", "turmas", "Turmas novas", String(spec.turmas));
    if (spec.meta) anotar(ctx, "especificacao", "meta", "Meta", `Margem de ${fmtPctPontos(spec.meta.margemAlvoPct)}, variável: ${ROTULO_PREMISSA[spec.meta.variavel].toLowerCase()}`);
    const ditas = Object.entries(spec.premissas) as [ChavePremissa, number][];
    if (ditas.length) anotar(ctx, "especificacao", "premissas", "Premissas ditas na pergunta", ditas.map(([k, v]) => `${ROTULO_PREMISSA[k]} = ${formatarPremissa(k, v)}`).join("; "));
    if (!produto) {
      resposta = base.produtos.length ? `Para calcular preciso saber de qual produto você fala. A base tem ${base.produtos.map((p) => `**${p.nome}**`).join(", ")}. Escolha um abaixo ou repita a pergunta com o nome.` : "A base ainda não tem produtos mapeados. Envie a planilha de matrículas e confirme a coluna de produto em Base e premissas.";
      sugestoes = base.produtos.slice(0, 3).map((p) => `${texto.replace(/[?？]\s*$/, "")} (${p.nome})?`);
      anotar(ctx, "roteamento", "esclarecimento", "Esclarecimento", "Perguntar o produto antes de calcular");
    } else {
      // 4. Motor (código)
      const ex = executarEspecificacao(base, { ...spec, produto: produto.nome }, produto.nome);
      if (!ex.ok) {
        if (ex.erros.length) ctx.harness.avisos.push(...ex.erros);
        // Premissas faltantes: o LLM sugeriu valores; o Jev pontua a plausibilidade; nada entra sem confirmação.
        const itens = ex.faltantes.map((chave) => ({ chave, rotulo: ROTULO_PREMISSA[chave], unidade: UNIDADE_PREMISSA[chave], sugerida: spec.sugestoes[chave] ?? null, plausibilidade: null as number | null }));
        const comSugestao = itens.filter((i) => i.sugerida !== null);
        if (comSugestao.length) {
          const perguntas: Record<string, Pergunta> = {};
          comSugestao.forEach((i) => (perguntas[`plaus_${i.chave}`] = { type: "score", instructions: `Quão plausível é o valor sugerido em \`sugestoes.${i.chave}\` para "${i.rotulo.toLowerCase()}" do produto \`produto\`, dado \`contexto\`?`, criteria: NIVEIS_PLAUSIVEL }));
          try {
            const plaus = await decidir({ produto: produto.nome, contexto: { ticket: produto.ticketMedio, alunos_por_turma: produto.alunosPorTurma, receita_total: produto.receita, turmas: produto.turmas }, sugestoes: Object.fromEntries(comSugestao.map((i) => [i.chave, i.sugerida])) }, perguntas, { signal });
            registrar(ctx, plaus);
            for (const i of comSugestao) {
              const p = pontuacao(plaus, `plaus_${i.chave}`);
              i.plausibilidade = p.valor === null ? null : Math.max(0, Math.min(1, p.valor / 2));
              ctx.decisoes.push({ estacao: "especificacao", chave: `plaus_${i.chave}`, rotulo: `Sugestão para ${i.rotulo.toLowerCase()}`, valor: `${formatarPremissa(i.chave, i.sugerida!)} · ${p.valor === null ? "sem avaliação" : NIVEIS_PLAUSIVEL[Math.min(2, Math.max(0, Math.round(p.valor)))].toLowerCase()}`, probabilidade: i.plausibilidade, confianca: p.confianca, baixaConfianca: p.baixa });
            }
          } catch (e) {
            ctx.harness.avisos.push(`Sem avaliação das sugestões: ${e instanceof Error ? e.message : "o Jev não respondeu."}`);
          }
        }
        anotar(ctx, "motor", "faltantes", "Premissas faltantes", itens.map((i) => i.rotulo).join(", "));
        cartoes = [{ tipo: "premissas_faltantes", produto: produto.nome, pergunta: texto, itens }];
        resposta = `Para calcular **${produto.nome}** ${ex.faltantes.length === 1 ? "falta uma premissa" : `faltam ${ex.faltantes.length} premissas`}: ${itens.map((i) => i.rotulo.toLowerCase()).join(", ")}. ${base.custos ? "" : "A base não tem planilha de custos; "}Informe abaixo${comSugestao.length ? " ou use as sugestões, que só entram na conta depois que você confirmar" : ""}.`;
      } else {
        fpa = ex.fpa;
        cartoes = ex.cartoes;
        anotar(ctx, "motor", "premissas", "Premissas usadas", `${fpa.premissas.filter((p) => p.origem === "base").length} da base, ${fpa.premissas.filter((p) => p.origem === "informada").length} informadas`);
        anotar(ctx, "motor", "resultado", "Contribuição por turma", `${fmtBRL(fpa.turmas.contribuicao / fpa.turmas.turmas)} (${fmtPctPontos(fpa.turmas.margemPct)})`);
        // 5. Narrativa (LLM, só com os números do motor)
        const numeros = numerosDoMotor(fpa);
        const leituraBruta = await perguntar({ system: `${baseCurta} Escreva a leitura executiva do RESULTADO abaixo em até 110 palavras, respondendo à pergunta. Use SOMENTE números do RESULTADO (pode arredondar para milhares). Não faça contas novas, não cite outros produtos, não invente premissas nem contexto de mercado. Não escreva a linha "Base:"; ela é adicionada depois. Termine apontando o principal risco ou a principal alavanca listada em RESULTADO.\n\nRESULTADO:\n${numeros.join("\n")}`, prompt: `Pergunta: ${texto}`, forte, signal, maxTokens: 500 });
        let leitura = leituraBruta.trim().replace(/\n*Base:[\s\S]*$/i, "").trim();
        // 6. Verificação (Jev)
        const estado = () => ({ pergunta: texto, leitura, numeros_do_motor: numeros, premissas: fpa!.premissas.map((p) => `${ROTULO_PREMISSA[p.chave]} = ${formatarPremissa(p.chave, p.valor)} (${p.origem})`) });
        let verif = await decidir(estado(), perguntasVerificacaoMotor(), { signal });
        registrar(ctx, verif);
        let batem = sim(verif, "numeros_batem");
        if (batem.valor === false && !batem.baixa) {
          leitura = (await perguntar({ system: `${baseCurta} A leitura abaixo citou números que não estão no RESULTADO. Reescreva-a usando exclusivamente números do RESULTADO (arredondar para milhares é aceitável), em até 110 palavras, sem a linha "Base:".\n\nRESULTADO:\n${numeros.join("\n")}`, prompt: `Pergunta: ${texto}\n\nLeitura a corrigir:\n${leitura}`, forte, signal, maxTokens: 500 })).trim().replace(/\n*Base:[\s\S]*$/i, "").trim();
          ctx.decisoes.push({ estacao: "verificacao", chave: "reescrita", rotulo: "Leitura reescrita", valor: "Sim: números fora do motor", probabilidade: batem.probabilidade, confianca: null, baixaConfianca: false });
          verif = await decidir(estado(), perguntasVerificacaoMotor(), { signal });
          registrar(ctx, verif);
          batem = sim(verif, "numeros_batem");
          if (batem.valor === false && !batem.baixa) ctx.harness.avisos.push("Mesmo após reescrever, a leitura pode citar números fora do motor. Confie nos cartões e na fórmula.");
        }
        anotarSim(ctx, "verificacao", verif, "responde", "Responde à pergunta");
        anotarSim(ctx, "verificacao", verif, "numeros_batem", "Números conferem com o motor");
        const implicita = anotarSim(ctx, "verificacao", verif, "premissa_implicita", "Premissa implícita não declarada");
        const escalar = anotarSim(ctx, "verificacao", verif, "escalar", "Pede validação humana");
        anotarEscolha(ctx, "verificacao", verif, "visual", "Visual escolhido", ROTULO_VISUAL);
        if (implicita.valor) ctx.harness.avisos.push("A leitura pode depender de uma premissa não declarada (demanda, mercado, sazonalidade). Trate como hipótese.");
        if (escalar.valor || impactoAlto) cartoes.push({ tipo: "recomendacao", texto: impactoAlto ? "Decisão de impacto alto: leve os números e as premissas ao comitê antes de agir." : "Esta leitura orienta uma decisão de negócio: valide com quem responde pela área antes de agir.", pedeValidacao: true });
        resposta = `${leitura}\n\n${fpa.base}`;
        // 7. Próximas perguntas: o código propõe cinco, o Jev ranqueia, ficam três.
        sugestoes = await ranquear(ctx, texto, leitura, candidatasSeguintes(fpa.especificacao, produto.nome, base), base);
      }
    }
  } else {
    // Descritiva, diagnóstica ou previsão: agregados da base (nunca as linhas).
    const resumo = `${resumoBaseParaIA(base)}\n\n${resumoParaIA(base.matriculas, lerLinhas(base.matriculas), 6000)}`;
    const sens = sensivel.valor ? " Nunca liste nomes, e-mails, documentos ou telefones; fale só em agregados." : "";
    const prev = tipoFinal === "previsao" ? " Se fizer uma projeção, deixe explícito que é uma extrapolação simples da tendência dos agregados e ofereça transformar em cenário com premissas." : "";
    const regra = `Use SOMENTE números presentes no RESUMO DA BASE ou derivados deles por soma, diferença ou percentual. Se um número necessário não estiver lá, diga o que falta em vez de estimar. Pode usar uma tabela em Markdown ao comparar produtos ou períodos.`;
    resposta = await perguntar({ system: `${baseCurta} ${regra}${sens}${prev} Termine com uma linha "Base: ..." dizendo quais planilhas e agregados usou.\n\nRESUMO DA BASE:\n${resumo}`, prompt: historico.length ? `Conversa anterior:\n${historico.map((h) => `${h.papel === "usuario" ? "Pessoa" : "Analista"}: ${h.texto}`).join("\n")}\n\nPergunta agora: ${texto}` : texto, signal });
    let verif = await decidir({ pergunta: texto, resposta, resumo_da_base: resumo.slice(0, 7000) }, perguntasVerificacaoAgregados(), { signal });
    registrar(ctx, verif);
    let batem = sim(verif, "numeros_batem");
    if (batem.valor === false && !batem.baixa) {
      resposta = await perguntar({ system: `${baseCurta} A resposta abaixo citou números que não estão no RESUMO DA BASE. Reescreva-a usando exclusivamente números do resumo (ou somas, diferenças e percentuais deles) e diga o que não dá para afirmar. Termine com a linha "Base: ...".\n\nRESUMO DA BASE:\n${resumo}`, prompt: `Pergunta: ${texto}\n\nResposta a corrigir:\n${resposta}`, signal });
      ctx.decisoes.push({ estacao: "verificacao", chave: "reescrita", rotulo: "Resposta reescrita", valor: "Sim: números fora do resumo", probabilidade: batem.probabilidade, confianca: null, baixaConfianca: false });
      verif = await decidir({ pergunta: texto, resposta, resumo_da_base: resumo.slice(0, 7000) }, perguntasVerificacaoAgregados(), { signal });
      registrar(ctx, verif);
      batem = sim(verif, "numeros_batem");
      if (batem.valor === false && !batem.baixa) ctx.harness.avisos.push("Mesmo após reescrever, alguns números podem não estar nos agregados. Confira antes de usar.");
    }
    anotarSim(ctx, "verificacao", verif, "responde", "Responde à pergunta");
    anotarSim(ctx, "verificacao", verif, "numeros_batem", "Números conferem com a base");
    const escalar = anotarSim(ctx, "verificacao", verif, "escalar", "Pede validação humana");
    anotarEscolha(ctx, "verificacao", verif, "visual", "Visual escolhido", ROTULO_VISUAL);
    if (escalar.valor || impactoAlto) cartoes.push({ tipo: "recomendacao", texto: "A resposta sugere uma decisão de negócio: valide com quem responde pela área antes de agir.", pedeValidacao: true });
    // Próximas perguntas: o LLM propõe cinco, o Jev ranqueia, ficam três.
    try {
      const bruto = await perguntar({ system: `Proponha 5 perguntas curtas de acompanhamento (até 100 caracteres cada) que um executivo faria em seguida sobre planejamento financeiro por turma desta base, misturando diagnóstico, cenário ("se abrirmos..."), meta reversa ("quanto posso...") e risco ("com quantos alunos..."). Use os nomes exatos dos produtos. Devolva SOMENTE um JSON: lista de 5 strings em português.\n\nPRODUTOS: ${base.produtos.map((p) => p.nome).join(" | ")}`, prompt: `Pergunta: ${texto}\nResposta dada: ${resposta.slice(0, 1200)}`, signal, maxTokens: 400 });
      const lista = (parseJSON<unknown>(bruto) as unknown[] | null)?.filter((s): s is string => typeof s === "string" && s.trim().length > 5).slice(0, 5) || [];
      if (lista.length) sugestoes = await ranquear(ctx, texto, resposta, lista, base);
    } catch (e) {
      ctx.harness.avisos.push(`Sem sugestões neste turno: ${e instanceof Error ? e.message : "falha ao propor perguntas."}`);
    }
  }

  ctx.harness.latenciaTotalMs = Date.now() - ctx.inicio;
  gravar(pergunta);
  const final: Mensagem = { id: randomUUID(), papel: "assistente", texto: resposta.trim(), criadoEm: new Date().toISOString(), cartoes: cartoes.length ? cartoes : undefined, decisoes: ctx.decisoes, harness: ctx.harness, sugestoes, fpa, categoria };
  return { pergunta, resposta: gravar(final) };
}

function numerosDoMotor(fpa: NonNullable<Mensagem["fpa"]>): string[] {
  const r = fpa.turmas;
  const linhas = [
    `Produto: ${fpa.produto}. Turmas novas: ${r.turmas}. Alunos: ${fmtNum(r.alunos, 1)}.`,
    ...fpa.premissas.map((p) => `Premissa ${ROTULO_PREMISSA[p.chave].toLowerCase()}: ${formatarPremissa(p.chave, p.valor)} (${p.origem === "base" ? "da base" : p.origem})`),
    `Receita: ${fmtBRL(r.receita)}. Custo variável: ${fmtBRL(r.custoVariavel)}. Marketing: ${fmtBRL(r.marketing)}. Custo fixo: ${fmtBRL(r.custoFixo)}.`,
    `Contribuição: ${fmtBRL(r.contribuicao)} (${fmtPctPontos(r.margemPct)} da receita). Contribuição por aluno: ${fmtBRL(r.contribuicaoPorAluno)}.`,
  ];
  if (fpa.cenario?.base && fpa.cenario.margemAntesPct !== null && fpa.cenario.margemDepoisPct !== null && fpa.cenario.deltaPp !== null) linhas.push(`Margem do período de referência (${fpa.cenario.base.rotulo}): antes ${fmtPctPontos(fpa.cenario.margemAntesPct)}, depois ${fmtPctPontos(fpa.cenario.margemDepoisPct)} (${fmtPp(fpa.cenario.deltaPp)}).`);
  if (fpa.ponto) linhas.push(fpa.ponto.alunosMinimos === null ? "Ponto de equilíbrio: a turma não se paga com nenhuma ocupação (contribuição por aluno negativa)." : `Ponto de equilíbrio: ${fmtNum(fpa.ponto.alunosMinimos)} alunos (ocupação mínima ${fmtPctPontos(fpa.ponto.ocupacaoMinimaPct ?? 0)}; folga de ${fmtNum(fpa.ponto.folga ?? 0, 1)} alunos).`);
  if (fpa.meta) linhas.push(fpa.meta.valor === null ? `Meta reversa: nenhum valor de ${fpa.meta.rotulo.toLowerCase()} alcança ${fmtPctPontos(fpa.meta.margemAlvoPct)} de margem.` : `Meta reversa: ${fpa.meta.rotulo.toLowerCase()} ${fpa.meta.direcao} de ${formatarPremissa(fpa.meta.variavel, fpa.meta.valor)} para ${fmtPctPontos(fpa.meta.margemAlvoPct)} de margem (hoje ${formatarPremissa(fpa.meta.variavel, fpa.meta.atual)}; margem atual ${fmtPctPontos(r.margemPct)}).`);
  linhas.push(`Sensibilidade (variação adversa de 10%): ${fpa.sensibilidade.slice(0, 3).map((s) => `${s.rotulo.toLowerCase()} ${s.variacao} → contribuição ${fmtBRL(s.contribuicao)} (${fmtBRL(s.delta)})`).join("; ")}.`);
  return linhas;
}
async function ranquear(ctx: Contexto, pergunta: string, resposta: string, candidatas: string[], base: Base): Promise<string[]> {
  if (!candidatas.length) return [];
  try {
    const perguntas: Record<string, Pergunta> = {};
    candidatas.forEach((_, i) => (perguntas[`s_${i}`] = { type: "score", instructions: `Quão boa é \`candidatas[${i}]\` como próxima pergunta desta conversa de planejamento financeiro, considerando \`produtos\`?`, criteria: ["Sem relação com a conversa ou repetida.", "Relacionada, mas genérica.", "Continuação natural, específica e calculável com a base."] }));
    const rank = await decidir({ pergunta, resposta: resposta.slice(0, 1500), produtos: base.produtos.map((p) => p.nome), candidatas }, perguntas, { signal: ctx.signal });
    registrar(ctx, rank);
    const escolhidas = candidatas.map((s, i) => ({ s, v: pontuacao(rank, `s_${i}`).valor ?? 0 })).sort((a, b) => b.v - a.v).slice(0, 3).map((x) => x.s.trim());
    ctx.decisoes.push({ estacao: "sugestoes", chave: "ranking", rotulo: "Próximas perguntas ranqueadas", valor: `${candidatas.length} propostas, ${escolhidas.length} escolhidas`, probabilidade: null, confianca: null, baixaConfianca: false });
    return escolhidas;
  } catch (e) {
    ctx.harness.avisos.push(`Sem sugestões neste turno: ${e instanceof Error ? e.message : "o Jev não ranqueou."}`);
    return candidatas.slice(0, 3);
  }
}

// --- Recálculo local: troca premissas, roda só o motor, sem chamada de IA ------------------------------------
export function recalcularMensagem(id: string, ajustesBrutos: unknown, salvar: boolean): Mensagem {
  const m = obterMensagem(id);
  if (!m.fpa) throw new AppError("Esta resposta não tem um cálculo do motor para recalcular.");
  const ajustes: Partial<Record<ChavePremissa, number>> = {};
  if (ajustesBrutos && typeof ajustesBrutos === "object") {
    for (const [k, v] of Object.entries(ajustesBrutos as Record<string, unknown>)) {
      if (!CHAVES_PREMISSA.includes(k as ChavePremissa)) throw new AppError(`Premissa "${k}" não existe.`);
      const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(/\./g, "").replace(",", ".")) : NaN;
      if (!Number.isFinite(n)) throw new AppError(`Informe um número para ${ROTULO_PREMISSA[k as ChavePremissa].toLowerCase()}.`);
      const f = FAIXAS[k as ChavePremissa];
      if (n < f.min || n > f.max) throw new AppError(`${ROTULO_PREMISSA[k as ChavePremissa]} fora da faixa aceita.`);
      ajustes[k as ChavePremissa] = n;
    }
  }
  if (!Object.keys(ajustes).length) throw new AppError("Ajuste pelo menos uma premissa.");
  // Salvar primeiro: a base (inclusive o período de referência) é montada já com as premissas novas.
  if (salvar) for (const [k, v] of Object.entries(ajustes)) salvarPremissa(m.fpa.produto, k, v, "informada", "informada em Como cheguei aqui");
  const re = recalcular(m.fpa, carregarBase(), ajustes);
  if (!re.ok) throw new AppError(re.erros[0] || `Faltam premissas: ${re.faltantes.map((f) => ROTULO_PREMISSA[f].toLowerCase()).join(", ")}.`);
  const outros = (m.cartoes || []).filter((c) => !["cenario", "sensibilidade", "ponto_equilibrio", "meta_reversa"].includes(c.tipo));
  const aviso = "Cartões e fórmula recalculados com premissas ajustadas por você; a leitura em texto foi escrita para os números anteriores.";
  const harness = m.harness ? { ...m.harness, avisos: m.harness.avisos.includes(aviso) ? m.harness.avisos : [...m.harness.avisos, aviso] } : m.harness;
  const decisoes = [...(m.decisoes || []).filter((d) => d.chave !== "recalculo"), { estacao: "motor" as const, chave: "recalculo", rotulo: "Recalculado localmente", valor: Object.entries(ajustes).map(([k, v]) => `${ROTULO_PREMISSA[k as ChavePremissa]} = ${formatarPremissa(k as ChavePremissa, v)}`).join("; "), probabilidade: null, confianca: null, baixaConfianca: false }];
  return gravar({ ...m, fpa: re.fpa, cartoes: [...re.cartoes, ...outros], harness, decisoes });
}
