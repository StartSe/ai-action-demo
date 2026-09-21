// Motor de FP&A: código determinístico, nunca o LLM. A unidade econômica é a turma (cohort).
// Recebe premissas validadas e devolve contribuição, ponto de equilíbrio, cenário de novas turmas,
// sensibilidade e meta reversa, mais a fórmula em português com os números substituídos.
import { fmtBRL, fmtNum, fmtPctPontos } from "./formato";

export type ChavePremissa = "alunosPorTurma" | "ticket" | "descontoPct" | "custoFixoTurma" | "custoVariavelAluno" | "cacAluno";
export const CHAVES_PREMISSA: ChavePremissa[] = ["alunosPorTurma", "ticket", "descontoPct", "custoFixoTurma", "custoVariavelAluno", "cacAluno"];
export const ROTULO_PREMISSA: Record<ChavePremissa, string> = {
  alunosPorTurma: "Alunos por turma",
  ticket: "Ticket cheio por aluno",
  descontoPct: "Desconto médio",
  custoFixoTurma: "Custo fixo por turma",
  custoVariavelAluno: "Custo variável por aluno",
  cacAluno: "Marketing por aluno",
};
export const UNIDADE_PREMISSA: Record<ChavePremissa, "moeda" | "numero" | "percentual"> = {
  alunosPorTurma: "numero",
  ticket: "moeda",
  descontoPct: "percentual",
  custoFixoTurma: "moeda",
  custoVariavelAluno: "moeda",
  cacAluno: "moeda",
};
export const GLOSSARIO: Record<string, string> = {
  "margem de contribuição": "O que sobra da receita depois de pagar os custos variáveis, o marketing e o custo fixo da turma.",
  "ponto de equilíbrio": "Quantidade mínima de alunos para a turma pagar o próprio custo fixo.",
  premissa: "Número usado na conta: pode vir do histórico da base, ser informado por você ou sugerido pelo modelo.",
  cenário: "Uma hipótese sobre o futuro calculada a partir das premissas, como abrir uma nova turma.",
  "meta reversa": "Dado o resultado que você quer, quanto uma premissa pode variar sem perder a meta.",
  sensibilidade: "Quanto o resultado muda quando cada premissa piora 10%.",
};

export type OrigemPremissa = "base" | "informada" | "sugerida";
export type Premissa = { chave: ChavePremissa; valor: number; origem: OrigemPremissa; quando: string; detalhe?: string };
export type Premissas = Record<ChavePremissa, number>;

export function formatarPremissa(chave: ChavePremissa, valor: number) {
  const u = UNIDADE_PREMISSA[chave];
  return u === "moeda" ? fmtBRL(valor) : u === "percentual" ? fmtPctPontos(valor) : fmtNum(valor, 1);
}

/** Faixas aceitas para cada premissa; fora delas a especificação é recusada, nunca assumida. */
export const FAIXAS: Record<ChavePremissa, { min: number; max: number }> = {
  alunosPorTurma: { min: 1, max: 5000 },
  ticket: { min: 1, max: 10_000_000 },
  descontoPct: { min: 0, max: 95 },
  custoFixoTurma: { min: 0, max: 1_000_000_000 },
  custoVariavelAluno: { min: 0, max: 10_000_000 },
  cacAluno: { min: 0, max: 10_000_000 },
};
export function validarPremissas(parcial: Partial<Record<ChavePremissa, number | null | undefined>>): { premissas: Premissas | null; faltantes: ChavePremissa[]; erros: string[] } {
  const faltantes: ChavePremissa[] = [];
  const erros: string[] = [];
  const saida: Partial<Premissas> = {};
  for (const chave of CHAVES_PREMISSA) {
    const v = parcial[chave];
    if (v === null || v === undefined || Number.isNaN(v)) {
      faltantes.push(chave);
      continue;
    }
    if (typeof v !== "number" || !Number.isFinite(v)) {
      erros.push(`${ROTULO_PREMISSA[chave]} precisa ser um número.`);
      continue;
    }
    const f = FAIXAS[chave];
    if (v < f.min || v > f.max) {
      erros.push(`${ROTULO_PREMISSA[chave]} fora da faixa aceita (${formatarPremissa(chave, f.min)} a ${formatarPremissa(chave, f.max)}).`);
      continue;
    }
    saida[chave] = v;
  }
  return { premissas: faltantes.length || erros.length ? null : (saida as Premissas), faltantes, erros };
}

// --- Contribuição por turma ------------------------------------------------------------------------
export type ResultadoTurmas = {
  turmas: number;
  alunos: number;
  receitaBruta: number;
  desconto: number;
  receita: number;
  custoVariavel: number;
  marketing: number;
  custoFixo: number;
  contribuicao: number;
  /** Margem de contribuição sobre a receita líquida, em pontos percentuais. */
  margemPct: number;
  contribuicaoPorAluno: number;
  receitaPorAluno: number;
};
export function calcularTurmas(p: Premissas, turmas = 1): ResultadoTurmas {
  const alunos = p.alunosPorTurma * turmas;
  const receitaBruta = alunos * p.ticket;
  const desconto = receitaBruta * (p.descontoPct / 100);
  const receita = receitaBruta - desconto;
  const custoVariavel = alunos * p.custoVariavelAluno;
  const marketing = alunos * p.cacAluno;
  const custoFixo = p.custoFixoTurma * turmas;
  const contribuicao = receita - custoVariavel - marketing - custoFixo;
  const receitaPorAluno = p.ticket * (1 - p.descontoPct / 100);
  return {
    turmas,
    alunos,
    receitaBruta,
    desconto,
    receita,
    custoVariavel,
    marketing,
    custoFixo,
    contribuicao,
    margemPct: receita > 0 ? (contribuicao / receita) * 100 : 0,
    contribuicaoPorAluno: receitaPorAluno - p.custoVariavelAluno - p.cacAluno,
    receitaPorAluno,
  };
}

// --- Ponto de equilíbrio ---------------------------------------------------------------------------
export type PontoEquilibrio = {
  /** Alunos mínimos para a turma se pagar; null quando cada aluno já dá prejuízo. */
  alunosMinimos: number | null;
  contribuicaoPorAluno: number;
  custoFixo: number;
  /** Alunos previstos menos os mínimos: quanto a turma pode encolher sem dar prejuízo. */
  folga: number | null;
  ocupacaoMinimaPct: number | null;
  curva: { alunos: number; contribuicao: number }[];
};
export function pontoEquilibrio(p: Premissas): PontoEquilibrio {
  const porAluno = p.ticket * (1 - p.descontoPct / 100) - p.custoVariavelAluno - p.cacAluno;
  const alunosMinimos = porAluno > 0 ? Math.ceil(p.custoFixoTurma / porAluno) : null;
  const teto = Math.max(Math.ceil(p.alunosPorTurma * 1.5), (alunosMinimos ?? 0) + 2, 4);
  const passo = Math.max(1, Math.round(teto / 12));
  const curva: { alunos: number; contribuicao: number }[] = [];
  for (let a = 0; a <= teto; a += passo) curva.push({ alunos: a, contribuicao: a * porAluno - p.custoFixoTurma });
  if (curva[curva.length - 1].alunos !== teto) curva.push({ alunos: teto, contribuicao: teto * porAluno - p.custoFixoTurma });
  return {
    alunosMinimos,
    contribuicaoPorAluno: porAluno,
    custoFixo: p.custoFixoTurma,
    folga: alunosMinimos === null ? null : p.alunosPorTurma - alunosMinimos,
    ocupacaoMinimaPct: alunosMinimos === null || !p.alunosPorTurma ? null : (alunosMinimos / p.alunosPorTurma) * 100,
    curva,
  };
}

// --- Cenário: novas turmas e impacto na margem do período ----------------------------------------
export type Baseline = { rotulo: string; receita: number; contribuicao: number; inicio: string; fim: string };
export type Cenario = {
  turmas: number;
  resultado: ResultadoTurmas;
  base: Baseline | null;
  margemAntesPct: number | null;
  margemDepoisPct: number | null;
  deltaPp: number | null;
};
export function cenarioNovasTurmas(p: Premissas, turmas: number, base: Baseline | null): Cenario {
  const resultado = calcularTurmas(p, turmas);
  if (!base || base.receita <= 0) return { turmas, resultado, base: null, margemAntesPct: null, margemDepoisPct: null, deltaPp: null };
  const antes = (base.contribuicao / base.receita) * 100;
  const receitaDepois = base.receita + resultado.receita;
  const depois = receitaDepois > 0 ? ((base.contribuicao + resultado.contribuicao) / receitaDepois) * 100 : antes;
  return { turmas, resultado, base, margemAntesPct: antes, margemDepoisPct: depois, deltaPp: depois - antes };
}

// --- Sensibilidade: variação adversa de X% em cada premissa, ranqueada pelo impacto ---------------
export type ItemSensibilidade = { chave: ChavePremissa; rotulo: string; variacao: string; valor: number; contribuicao: number; delta: number };
const SENTIDO_ADVERSO: Record<ChavePremissa, -1 | 1> = { alunosPorTurma: -1, ticket: -1, descontoPct: 1, custoFixoTurma: 1, custoVariavelAluno: 1, cacAluno: 1 };
export function sensibilidade(p: Premissas, turmas = 1, pct = 10): { base: number; itens: ItemSensibilidade[] } {
  const base = calcularTurmas(p, turmas).contribuicao;
  const itens = CHAVES_PREMISSA.map((chave) => {
    const fator = 1 + (SENTIDO_ADVERSO[chave] * pct) / 100;
    // Desconto zero não tem 10% para piorar: usa +pct pontos, para a sensibilidade não sumir.
    const valor = chave === "descontoPct" && p.descontoPct === 0 ? pct : p[chave] * fator;
    const alt = { ...p, [chave]: valor } as Premissas;
    const contribuicao = calcularTurmas(alt, turmas).contribuicao;
    const sinal = SENTIDO_ADVERSO[chave] < 0 ? "−" : "+";
    return { chave, rotulo: ROTULO_PREMISSA[chave], variacao: chave === "descontoPct" && p.descontoPct === 0 ? `+${pct} p.p.` : `${sinal}${pct}%`, valor, contribuicao, delta: contribuicao - base };
  }).sort((a, b) => a.delta - b.delta);
  return { base, itens };
}

// --- Meta reversa: quanto uma premissa pode variar mantendo a margem-alvo ---------------------------
export type VariavelMeta = "cacAluno" | "ticket" | "alunosPorTurma" | "custoFixoTurma" | "descontoPct";
export const VARIAVEIS_META: VariavelMeta[] = ["cacAluno", "ticket", "alunosPorTurma", "custoFixoTurma", "descontoPct"];
export type MetaReversa = {
  variavel: VariavelMeta;
  rotulo: string;
  margemAlvoPct: number;
  /** Valor-limite da premissa; null quando a meta é inalcançável com as outras premissas. */
  valor: number | null;
  atual: number;
  direcao: "máximo" | "mínimo";
  /** Contribuição por turma quando a premissa está no limite. */
  contribuicaoNaMeta: number | null;
  atingeHoje: boolean;
};
export const MARGEM_ALVO_PADRAO = 30;
export function metaReversa(p: Premissas, variavel: VariavelMeta, margemAlvoPct = MARGEM_ALVO_PADRAO, turmas = 1): MetaReversa {
  const m = margemAlvoPct / 100;
  const r = calcularTurmas(p, turmas);
  const liquido = 1 - p.descontoPct / 100;
  let valor: number | null = null;
  let direcao: "máximo" | "mínimo" = "máximo";
  if (variavel === "cacAluno") {
    valor = r.alunos > 0 ? (r.receita * (1 - m) - r.custoVariavel - r.custoFixo) / r.alunos : null;
  } else if (variavel === "custoFixoTurma") {
    valor = turmas > 0 ? (r.receita * (1 - m) - r.custoVariavel - r.marketing) / turmas : null;
  } else if (variavel === "ticket") {
    direcao = "mínimo";
    const receitaNecessaria = (r.custoVariavel + r.marketing + r.custoFixo) / (1 - m);
    valor = r.alunos > 0 && liquido > 0 && m < 1 ? receitaNecessaria / (r.alunos * liquido) : null;
  } else if (variavel === "alunosPorTurma") {
    direcao = "mínimo";
    const porAluno = p.ticket * liquido * (1 - m) - p.custoVariavelAluno - p.cacAluno;
    valor = porAluno > 0 ? Math.ceil(p.custoFixoTurma / porAluno) : null;
  } else {
    const receitaNecessaria = (r.custoVariavel + r.marketing + r.custoFixo) / (1 - m);
    const fator = r.receitaBruta > 0 ? receitaNecessaria / r.receitaBruta : null;
    valor = fator === null ? null : (1 - fator) * 100;
  }
  if (valor !== null && (!Number.isFinite(valor) || valor < 0)) valor = null;
  if (valor !== null && variavel === "descontoPct" && valor > 100) valor = null;
  const contribuicaoNaMeta = valor === null ? null : calcularTurmas({ ...p, [variavel]: valor } as Premissas, turmas).contribuicao;
  return { variavel, rotulo: ROTULO_PREMISSA[variavel], margemAlvoPct, valor, atual: p[variavel], direcao, contribuicaoNaMeta, atingeHoje: r.margemPct >= margemAlvoPct };
}

// --- Fórmula em português, com os números substituídos ---------------------------------------------
export function formulaTurmas(p: Premissas, r: ResultadoTurmas): string[] {
  const t = r.turmas === 1 ? "1 turma" : `${fmtNum(r.turmas)} turmas`;
  return [
    `Alunos = ${t} × ${fmtNum(p.alunosPorTurma, 1)} alunos por turma = ${fmtNum(r.alunos, 1)}`,
    `Receita = ${fmtNum(r.alunos, 1)} × ${fmtBRL(p.ticket)} × (1 − ${fmtPctPontos(p.descontoPct)}) = ${fmtBRL(r.receita)}`,
    `Custo variável = ${fmtNum(r.alunos, 1)} × ${fmtBRL(p.custoVariavelAluno)} = ${fmtBRL(r.custoVariavel)}`,
    `Marketing = ${fmtNum(r.alunos, 1)} × ${fmtBRL(p.cacAluno)} = ${fmtBRL(r.marketing)}`,
    `Custo fixo = ${t} × ${fmtBRL(p.custoFixoTurma)} = ${fmtBRL(r.custoFixo)}`,
    `Contribuição = ${fmtBRL(r.receita)} − ${fmtBRL(r.custoVariavel)} − ${fmtBRL(r.marketing)} − ${fmtBRL(r.custoFixo)} = ${fmtBRL(r.contribuicao)} (${fmtPctPontos(r.margemPct)} da receita)`,
  ];
}
export function formulaPontoEquilibrio(p: Premissas, pe: PontoEquilibrio): string[] {
  const linhas = [`Contribuição por aluno = ${fmtBRL(p.ticket)} × (1 − ${fmtPctPontos(p.descontoPct)}) − ${fmtBRL(p.custoVariavelAluno)} − ${fmtBRL(p.cacAluno)} = ${fmtBRL(pe.contribuicaoPorAluno)}`];
  linhas.push(pe.alunosMinimos === null ? `Cada aluno já custa mais do que rende: a turma não se paga com estas premissas.` : `Alunos mínimos = ${fmtBRL(p.custoFixoTurma)} ÷ ${fmtBRL(pe.contribuicaoPorAluno)} = ${fmtNum(pe.alunosMinimos)} (arredondado para cima)`);
  return linhas;
}
export function formulaMargemPeriodo(c: Cenario): string[] {
  if (!c.base || c.margemAntesPct === null || c.margemDepoisPct === null) return [];
  return [
    `Margem antes (${c.base.rotulo}) = ${fmtBRL(c.base.contribuicao)} ÷ ${fmtBRL(c.base.receita)} = ${fmtPctPontos(c.margemAntesPct)}`,
    `Margem depois = (${fmtBRL(c.base.contribuicao)} + ${fmtBRL(c.resultado.contribuicao)}) ÷ (${fmtBRL(c.base.receita)} + ${fmtBRL(c.resultado.receita)}) = ${fmtPctPontos(c.margemDepoisPct)}`,
  ];
}
export function formulaMetaReversa(p: Premissas, m: MetaReversa, turmas = 1): string[] {
  const r = calcularTurmas(p, turmas);
  const alvo = fmtPctPontos(m.margemAlvoPct);
  if (m.valor === null) return [`Com as outras premissas como estão, nenhuma ${m.rotulo.toLowerCase()} alcança ${alvo} de margem.`];
  if (m.variavel === "cacAluno") return [`Marketing máximo por aluno = (${fmtBRL(r.receita)} × (1 − ${alvo}) − ${fmtBRL(r.custoVariavel)} − ${fmtBRL(r.custoFixo)}) ÷ ${fmtNum(r.alunos, 1)} = ${fmtBRL(m.valor)}`];
  if (m.variavel === "custoFixoTurma") return [`Custo fixo máximo por turma = (${fmtBRL(r.receita)} × (1 − ${alvo}) − ${fmtBRL(r.custoVariavel)} − ${fmtBRL(r.marketing)}) ÷ ${fmtNum(turmas)} = ${fmtBRL(m.valor)}`];
  if (m.variavel === "ticket") return [`Ticket mínimo = (${fmtBRL(r.custoVariavel)} + ${fmtBRL(r.marketing)} + ${fmtBRL(r.custoFixo)}) ÷ (1 − ${alvo}) ÷ (${fmtNum(r.alunos, 1)} × (1 − ${fmtPctPontos(p.descontoPct)})) = ${fmtBRL(m.valor)}`];
  if (m.variavel === "alunosPorTurma") return [`Alunos mínimos = ${fmtBRL(p.custoFixoTurma)} ÷ (${fmtBRL(p.ticket)} × (1 − ${fmtPctPontos(p.descontoPct)}) × (1 − ${alvo}) − ${fmtBRL(p.custoVariavelAluno)} − ${fmtBRL(p.cacAluno)}) = ${fmtNum(m.valor)}`];
  return [`Desconto máximo = 1 − (${fmtBRL(r.custoVariavel)} + ${fmtBRL(r.marketing)} + ${fmtBRL(r.custoFixo)}) ÷ (1 − ${alvo}) ÷ ${fmtBRL(r.receitaBruta)} = ${fmtPctPontos(m.valor)}`];
}
