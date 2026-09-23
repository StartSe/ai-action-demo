// Da especificação fechada ao resultado: escolhe as premissas efetivas, roda o motor (lib/fpa.ts) e
// monta os cartões tipados e a linha "Base: ...". Nada aqui chama IA; a demonstração e o recálculo
// local usam exatamente este caminho.
import { premissasEfetivas, type Base, type Efetivas } from "./base";
import { calcularTurmas, cenarioNovasTurmas, formulaMargemPeriodo, formulaMetaReversa, formulaPontoEquilibrio, formulaTurmas, formatarPremissa, metaReversa, pontoEquilibrio, sensibilidade, validarPremissas, MARGEM_ALVO_PADRAO, ROTULO_PREMISSA, type ChavePremissa, type Premissa } from "./fpa";
import { fmtBRL, fmtNum, fmtPctPontos, fmtPp } from "./formato";
import type { Cartao, Especificacao, LinhaCenario, ResultadoFPA } from "./types";

export type Execucao = { ok: true; fpa: ResultadoFPA; cartoes: Cartao[] } | { ok: false; faltantes: ChavePremissa[]; erros: string[]; efetivas: Efetivas };

const ROTULO_HORIZONTE: Record<Especificacao["horizonte"], string> = { mes: "do mês", trimestre: "do trimestre", semestre: "do semestre", ano: "do ano" };

export function linhaBase(premissas: Premissa[], base: Base): string {
  const daBase = premissas.filter((p) => p.origem === "base");
  const informadas = premissas.filter((p) => p.origem === "informada");
  const partes: string[] = [];
  if (daBase.length) partes.push(`${base.matriculas?.nome || "matrículas"}${base.custos && daBase.some((p) => p.chave === "custoFixoTurma" || p.chave === "custoVariavelAluno") ? ` e ${base.custos.nome}` : ""}${base.marketing && daBase.some((p) => p.chave === "cacAluno") ? ` e ${base.marketing.nome}` : ""} (${daBase.map((p) => ROTULO_PREMISSA[p.chave].toLowerCase()).join(", ")})`);
  if (informadas.length) partes.push(`${informadas.map((p) => ROTULO_PREMISSA[p.chave].toLowerCase()).join(", ")} ${informadas.length === 1 ? "informado" : "informados"} por você${informadas.every((p) => p.detalhe === "informada na pergunta") ? " na pergunta" : ""}`);
  return `Base: ${partes.join("; ")}.`;
}

export function executarEspecificacao(base: Base, spec: Especificacao, produto: string, quando = new Date().toISOString()): Execucao {
  const efetivas = premissasEfetivas(base, produto, spec.premissas, quando);
  const v = validarPremissas(efetivas.valores);
  if (!v.premissas) return { ok: false, faltantes: v.faltantes, erros: v.erros, efetivas };
  const valores = v.premissas;
  const turmas = Math.max(1, Math.min(200, Math.round(spec.turmas || 1)));
  const resultado = calcularTurmas(valores, turmas);
  const sens = sensibilidade(valores, turmas).itens;
  const formula: string[] = [];
  let cenario: ResultadoFPA["cenario"] = null;
  let ponto: ResultadoFPA["ponto"] = null;
  let meta: ResultadoFPA["meta"] = null;
  if (spec.tipo === "cenario") {
    cenario = cenarioNovasTurmas(valores, turmas, base.baseline);
    ponto = pontoEquilibrio(valores);
    formula.push(...formulaTurmas(valores, resultado), ...formulaMargemPeriodo(cenario));
  } else if (spec.tipo === "ponto_equilibrio") {
    ponto = pontoEquilibrio(valores);
    formula.push(...formulaPontoEquilibrio(valores, ponto), ...formulaTurmas(valores, resultado).slice(-1));
  } else {
    const alvo = spec.meta?.margemAlvoPct ?? MARGEM_ALVO_PADRAO;
    meta = metaReversa(valores, spec.meta?.variavel || "cacAluno", alvo, turmas);
    formula.push(...formulaMetaReversa(valores, meta, turmas), ...formulaTurmas(valores, resultado).slice(-1));
  }
  const fpa: ResultadoFPA = { produto, especificacao: { ...spec, turmas, produto }, premissas: efetivas.premissas, valores, turmas: resultado, cenario, ponto, meta, sensibilidade: sens, formula, baseline: base.baseline, base: linhaBase(efetivas.premissas, base) };
  return { ok: true, fpa, cartoes: cartoesDe(fpa) };
}

export function cartoesDe(fpa: ResultadoFPA): Cartao[] {
  const cartoes: Cartao[] = [];
  const r = fpa.turmas;
  const t = r.turmas === 1 ? "nova turma" : `${fmtNum(r.turmas)} novas turmas`;
  if (fpa.especificacao.tipo === "cenario" && fpa.cenario) {
    const linhas: LinhaCenario[] = [
      { rotulo: "Receita", valor: r.receita, tipo: "entrada" },
      { rotulo: "Custo variável", valor: -r.custoVariavel, tipo: "saida" },
      { rotulo: "Marketing", valor: -r.marketing, tipo: "saida" },
      { rotulo: "Custo fixo", valor: -r.custoFixo, tipo: "saida" },
      { rotulo: "Contribuição", valor: r.contribuicao, tipo: "total" },
    ];
    const c = fpa.cenario;
    cartoes.push({ tipo: "cenario", titulo: `Cenário: ${t} de ${fpa.produto}`, produto: fpa.produto, turmas: r.turmas, linhas, margemPct: r.margemPct, margem: c.base && c.margemAntesPct !== null && c.margemDepoisPct !== null && c.deltaPp !== null ? { antes: c.margemAntesPct, depois: c.margemDepoisPct, deltaPp: c.deltaPp, periodo: c.base.rotulo } : null });
    cartoes.push({ tipo: "sensibilidade", titulo: "O que mais move o resultado", base: r.contribuicao, itens: fpa.sensibilidade.slice(0, 3) });
  } else if (fpa.especificacao.tipo === "ponto_equilibrio" && fpa.ponto) {
    cartoes.push({ tipo: "ponto_equilibrio", titulo: `Ponto de equilíbrio: ${fpa.produto}`, produto: fpa.produto, alunosPorTurma: fpa.valores.alunosPorTurma, ponto: fpa.ponto });
    cartoes.push({ tipo: "sensibilidade", titulo: "O que mais move o resultado", base: r.contribuicao, itens: fpa.sensibilidade.slice(0, 3) });
  } else if (fpa.meta) {
    cartoes.push({ tipo: "meta_reversa", titulo: `Meta reversa: ${fpa.meta.rotulo.toLowerCase()} para ${fmtPctPontos(fpa.meta.margemAlvoPct)} de margem`, produto: fpa.produto, meta: fpa.meta });
  }
  return cartoes;
}

/** Leitura executiva escrita pelo código, para a demonstração e para quando a narrativa não vier. */
export function narrativaDeterministica(fpa: ResultadoFPA): string {
  const r = fpa.turmas;
  const p = fpa.valores;
  if (fpa.especificacao.tipo === "cenario" && fpa.cenario) {
    const c = fpa.cenario;
    const t = r.turmas === 1 ? "uma nova turma" : `${fmtNum(r.turmas)} novas turmas`;
    const margem = c.margemAntesPct !== null && c.margemDepoisPct !== null && c.deltaPp !== null && c.base ? ` A margem ${ROTULO_HORIZONTE[fpa.especificacao.horizonte]} de referência (${c.base.rotulo}) iria de ${fmtPctPontos(c.margemAntesPct)} para ${fmtPctPontos(c.margemDepoisPct)} (${fmtPp(c.deltaPp)}).` : "";
    const pe = fpa.ponto?.alunosMinimos !== null && fpa.ponto ? ` O risco está na ocupação: abaixo de ${fmtNum(fpa.ponto.alunosMinimos)} alunos a turma não se paga.` : "";
    const sens = fpa.sensibilidade[0];
    return `Abrir ${t} de **${fpa.produto}** com ${fmtNum(p.alunosPorTurma, 1)} alunos por turma e ticket de ${fmtBRL(p.ticket)} gera ${fmtBRL(r.receita)} de receita e **${fmtBRL(r.contribuicao)} de contribuição** (${fmtPctPontos(r.margemPct)} da receita).${margem}${pe} O que mais pesa é ${sens.rotulo.toLowerCase()}: ${sens.variacao} tiraria ${fmtBRL(Math.abs(sens.delta))} da contribuição.\n\n${fpa.base}`;
  }
  if (fpa.especificacao.tipo === "ponto_equilibrio" && fpa.ponto) {
    const pe = fpa.ponto;
    if (pe.alunosMinimos === null) return `Com estas premissas, cada aluno de **${fpa.produto}** rende ${fmtBRL(pe.contribuicaoPorAluno)} depois do custo variável e do marketing: a turma não se paga com nenhuma ocupação. Reveja ticket, desconto ou custos antes de abrir.\n\n${fpa.base}`;
    return `Uma turma de **${fpa.produto}** deixa de se pagar abaixo de **${fmtNum(pe.alunosMinimos)} alunos**: cada aluno contribui com ${fmtBRL(pe.contribuicaoPorAluno)} e o custo fixo é ${fmtBRL(pe.custoFixo)}. Com a média histórica de ${fmtNum(p.alunosPorTurma, 1)} alunos, a folga é de ${fmtNum(pe.folga ?? 0, 1)} alunos (ocupação mínima de ${fmtPctPontos(pe.ocupacaoMinimaPct ?? 0)}).\n\n${fpa.base}`;
  }
  if (fpa.meta) {
    const m = fpa.meta;
    const hoje = `Hoje a turma fecha com ${fmtPctPontos(r.margemPct)} de margem${m.atingeHoje ? ", acima" : ", abaixo"} da meta de ${fmtPctPontos(m.margemAlvoPct)}.`;
    if (m.valor === null) return `${hoje} Nenhum valor de ${m.rotulo.toLowerCase()} alcança a meta com as outras premissas como estão; é preciso mexer em mais de uma premissa.\n\n${fpa.base}`;
    return `Para manter **${fmtPctPontos(m.margemAlvoPct)} de margem** em **${fpa.produto}**, ${m.rotulo.toLowerCase()} pode chegar a **${formatarPremissa(m.variavel, m.valor)}** (${m.direcao}); hoje está em ${formatarPremissa(m.variavel, m.atual)}. ${hoje}\n\n${fpa.base}`;
  }
  return `Contribuição de ${fmtBRL(r.contribuicao)} por ${r.turmas === 1 ? "turma" : "conjunto de turmas"} de ${fpa.produto}.\n\n${fpa.base}`;
}

/** Recálculo local: troca premissas, roda só o motor e devolve novos cartões e fórmula. Nenhuma chamada de IA. */
export function recalcular(fpa: ResultadoFPA, base: Base, ajustes: Partial<Record<ChavePremissa, number>>, quando = new Date().toISOString()): Execucao {
  const daPergunta: Partial<Record<ChavePremissa, number>> = {};
  for (const p of fpa.premissas) if (p.origem === "informada") daPergunta[p.chave] = p.valor;
  Object.assign(daPergunta, ajustes);
  const spec: Especificacao = { ...fpa.especificacao, premissas: daPergunta };
  const ex = executarEspecificacao(base, spec, fpa.produto, quando);
  if (!ex.ok) return ex;
  const premissas = ex.fpa.premissas.map((p) => (ajustes[p.chave] !== undefined ? { ...p, detalhe: "ajustada por você" } : p));
  return { ok: true, fpa: { ...ex.fpa, premissas, base: linhaBase(premissas, base), recalculadoEm: quando }, cartoes: ex.cartoes };
}
