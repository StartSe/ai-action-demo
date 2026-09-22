// A base de FP&A: as planilhas com papel (matrículas, custos, marketing) viram produtos e turmas,
// premissas "da base" com o detalhe de onde vieram, o livro de premissas (informadas sobrepõem a base)
// e o trimestre de referência para medir o impacto de um cenário na margem do período.
import { contexto } from "./contexto";
import { abrirBanco } from "./store";
import { AppError } from "./api";
import { listarPlanilhas, lerLinhas, paraNumero, paraData, type Linha } from "./planilhas";
import { CHAVES_PREMISSA, ROTULO_PREMISSA, formatarPremissa, validarPremissas, type Baseline, type ChavePremissa, type Premissa, type Premissas, type OrigemPremissa } from "./fpa";
import { fmtMes, fmtNum } from "./formato";
import type { Coluna, PapelFPA, Planilha, ProdutoResumo, PremissasProduto } from "./types";

export const PRODUTO_UNICO = "Todos os produtos";
export type Base = {
  planilhas: Planilha[];
  matriculas: Planilha | null;
  custos: Planilha | null;
  marketing: Planilha | null;
  produtos: ProdutoResumo[];
  periodo: { inicio: string; fim: string } | null;
  baseline: Baseline | null;
  avisos: string[];
  /** Só planilhas de exemplo: a conversa responde com as perguntas roteirizadas quando a IA não está conectada. */
  demo: boolean;
};

function colunaPor(p: Planilha, papel: PapelFPA): Coluna | null {
  return p.colunas.find((c) => c.papel === papel) || null;
}
const media = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
function percentual(v: number | null, col: Coluna | null): number | null {
  if (v === null) return null;
  // Desconto em fração (0,08) vira pontos (8); se a coluna toda fica até 1, é fração.
  const max = typeof col?.max === "number" ? col.max : null;
  return max !== null && max <= 1 ? v * 100 : v;
}

type Matricula = { produto: string; turma: string; data: string | null; alunos: number; receita: number; ticketCheio: number | null; descontoPct: number | null };
function lerMatriculas(p: Planilha, linhas: Linha[]): Matricula[] {
  const cProd = colunaPor(p, "produto");
  const cTurma = colunaPor(p, "turma");
  const cData = colunaPor(p, "data");
  const cAlunos = colunaPor(p, "alunos");
  const cRec = colunaPor(p, "receita");
  const cDesc = colunaPor(p, "desconto");
  if (!cRec) return [];
  const saida: Matricula[] = [];
  for (const l of linhas) {
    const receita = paraNumero(l[cRec.nome] || "");
    if (receita === null) continue;
    const alunos = cAlunos ? paraNumero(l[cAlunos.nome] || "") ?? 1 : 1;
    if (alunos <= 0) continue;
    const data = cData ? paraData(l[cData.nome] || "") : null;
    const descontoPct = cDesc ? percentual(paraNumero(l[cDesc.nome] || ""), cDesc) : null;
    const liquidoPorAluno = receita / alunos;
    const ticketCheio = descontoPct !== null && descontoPct < 100 ? liquidoPorAluno / (1 - descontoPct / 100) : liquidoPorAluno;
    saida.push({
      produto: (cProd && l[cProd.nome]) || PRODUTO_UNICO,
      turma: (cTurma && l[cTurma.nome]) || (data ? data.slice(0, 7) : "única"),
      data,
      alunos,
      receita,
      ticketCheio,
      descontoPct,
    });
  }
  return saida;
}
type CustoLinha = { produto: string | null; fixo: number | null; variavel: number | null };
function lerCustos(p: Planilha | null, linhas: Linha[]): CustoLinha[] {
  if (!p) return [];
  const cProd = colunaPor(p, "produto");
  const cFixo = colunaPor(p, "custo_fixo");
  const cVar = colunaPor(p, "custo_variavel");
  return linhas.map((l) => ({ produto: cProd ? l[cProd.nome] || null : null, fixo: cFixo ? paraNumero(l[cFixo.nome] || "") : null, variavel: cVar ? paraNumero(l[cVar.nome] || "") : null }));
}
type GastoLinha = { produto: string | null; data: string | null; gasto: number };
function lerMarketing(p: Planilha | null, linhas: Linha[]): GastoLinha[] {
  if (!p) return [];
  const cProd = colunaPor(p, "produto");
  const cData = colunaPor(p, "data");
  const cGasto = colunaPor(p, "marketing");
  if (!cGasto) return [];
  return linhas.map((l) => ({ produto: cProd ? l[cProd.nome] || null : null, data: cData ? paraData(l[cData.nome] || "") : null, gasto: paraNumero(l[cGasto.nome] || "") || 0 }));
}

export function resumirProdutos(matriculas: Matricula[], custos: CustoLinha[], gastos: GastoLinha[]): ProdutoResumo[] {
  const nomes = [...new Set(matriculas.map((m) => m.produto))];
  const gastoSemProduto = gastos.filter((g) => !g.produto).reduce((a, g) => a + g.gasto, 0);
  const alunosTotal = matriculas.reduce((a, m) => a + m.alunos, 0);
  const igual = (a: string | null, b: string) => !!a && a.trim().toLowerCase() === b.trim().toLowerCase();
  return nomes
    .map((nome) => {
      const ms = matriculas.filter((m) => m.produto === nome);
      const alunos = ms.reduce((a, m) => a + m.alunos, 0);
      const receita = ms.reduce((a, m) => a + m.receita, 0);
      const turmas = new Set(ms.map((m) => m.turma)).size;
      const datas = ms.map((m) => m.data).filter((d): d is string => !!d).sort();
      const ticketMedio = alunos ? ms.reduce((a, m) => a + (m.ticketCheio ?? 0) * m.alunos, 0) / alunos : null;
      const comDesc = ms.filter((m) => m.descontoPct !== null);
      const descontoMedioPct = comDesc.length ? comDesc.reduce((a, m) => a + m.descontoPct! * m.alunos, 0) / comDesc.reduce((a, m) => a + m.alunos, 0) : ms.length ? 0 : null;
      const cs = custos.filter((c) => c.produto === null || igual(c.produto, nome));
      const custoFixoTurma = media(cs.map((c) => c.fixo).filter((v): v is number => v !== null));
      const custoVariavelAluno = media(cs.map((c) => c.variavel).filter((v): v is number => v !== null));
      const gastoProduto = gastos.filter((g) => igual(g.produto, nome)).reduce((a, g) => a + g.gasto, 0);
      const cacAluno = gastos.length ? (gastoProduto > 0 ? gastoProduto / alunos : alunosTotal ? gastoSemProduto / alunosTotal : null) : null;
      const margemHistoricaPct = custoFixoTurma !== null && custoVariavelAluno !== null && receita > 0 ? ((receita - alunos * custoVariavelAluno - alunos * (cacAluno ?? 0) - turmas * custoFixoTurma) / receita) * 100 : null;
      return {
        nome,
        matriculas: alunos,
        turmas,
        alunosPorTurma: turmas ? alunos / turmas : null,
        ticketMedio,
        descontoMedioPct,
        receita,
        custoFixoTurma,
        custoVariavelAluno,
        cacAluno,
        margemHistoricaPct,
        primeiraTurma: datas[0] ? datas[0].slice(0, 7) : null,
        ultimaTurma: datas.length ? datas[datas.length - 1].slice(0, 7) : null,
      };
    })
    .sort((a, b) => b.receita - a.receita);
}

// --- Livro de premissas (SQLite) -------------------------------------------------------------------
function db() {
  const b = abrirBanco();
  b.exec(`CREATE TABLE IF NOT EXISTS premissas (produto TEXT NOT NULL, chave TEXT NOT NULL, json TEXT NOT NULL, PRIMARY KEY (produto, chave));`);
  return b;
}
export function livroSalvo(): Record<string, Partial<Record<ChavePremissa, Premissa>>> {
  const rows = db().prepare("SELECT produto, chave, json FROM premissas").all() as { produto: string; chave: string; json: string }[];
  const livro: Record<string, Partial<Record<ChavePremissa, Premissa>>> = {};
  for (const r of rows) (livro[r.produto] ||= {})[r.chave as ChavePremissa] = JSON.parse(r.json) as Premissa;
  return livro;
}
export function salvarPremissa(produto: string, chave: string, valor: unknown, origem: OrigemPremissa = "informada", detalhe?: string): Premissa {
  if (!CHAVES_PREMISSA.includes(chave as ChavePremissa)) throw new AppError(`Premissa "${chave}" não existe.`);
  const n = typeof valor === "number" ? valor : typeof valor === "string" ? paraNumero(valor) : null;
  if (n === null) throw new AppError(`Informe um número para ${ROTULO_PREMISSA[chave as ChavePremissa].toLowerCase()}.`);
  const v = validarPremissas({ [chave]: n });
  if (v.erros.length) throw new AppError(v.erros[0]);
  const premissa: Premissa = { chave: chave as ChavePremissa, valor: n, origem, quando: new Date().toISOString(), detalhe: detalhe || (origem === "informada" ? "informada por você" : origem === "sugerida" ? "sugerida pelo modelo" : undefined) };
  db().prepare("INSERT INTO premissas (produto, chave, json) VALUES (?, ?, ?) ON CONFLICT(produto, chave) DO UPDATE SET json = excluded.json").run(produto.trim(), chave, JSON.stringify(premissa));
  return premissa;
}
export function removerPremissa(produto: string, chave?: string) {
  if (chave) db().prepare("DELETE FROM premissas WHERE produto = ? AND chave = ?").run(produto.trim(), chave);
  else db().prepare("DELETE FROM premissas WHERE produto = ?").run(produto.trim());
}

// --- Premissas: da base, do livro e da pergunta ---------------------------------------------------
export function premissasDaBase(prod: ProdutoResumo, nomeMatriculas: string, nomeCustos: string | null, nomeMarketing: string | null, quando = new Date().toISOString()): Partial<Record<ChavePremissa, Premissa>> {
  const turmas = `${fmtNum(prod.turmas)} ${prod.turmas === 1 ? "turma" : "turmas"}`;
  const periodo = prod.primeiraTurma && prod.ultimaTurma ? ` (${fmtMes(prod.primeiraTurma)} a ${fmtMes(prod.ultimaTurma)})` : "";
  const p = (chave: ChavePremissa, valor: number | null, detalhe: string): [ChavePremissa, Premissa] | null => (valor === null ? null : [chave, { chave, valor, origem: "base", quando, detalhe }]);
  const pares = [
    p("alunosPorTurma", prod.alunosPorTurma, `média de ${turmas} em ${nomeMatriculas}${periodo}`),
    p("ticket", prod.ticketMedio, `ticket cheio médio ponderado em ${nomeMatriculas}`),
    p("descontoPct", prod.descontoMedioPct, `desconto médio em ${nomeMatriculas}`),
    p("custoFixoTurma", prod.custoFixoTurma, nomeCustos ? `média por turma em ${nomeCustos}` : ""),
    p("custoVariavelAluno", prod.custoVariavelAluno, nomeCustos ? `média por aluno em ${nomeCustos}` : ""),
    p("cacAluno", prod.cacAluno, nomeMarketing ? `gasto total em ${nomeMarketing} ÷ matrículas` : ""),
  ].filter((x): x is [ChavePremissa, Premissa] => !!x);
  return Object.fromEntries(pares) as Partial<Record<ChavePremissa, Premissa>>;
}
export type Efetivas = PremissasProduto & { valores: Partial<Premissas> };
/** Informadas na pergunta > livro (informadas) > da base. Sugeridas nunca entram sem confirmação. */
export function premissasEfetivas(base: Base, produto: string, daPergunta: Partial<Record<ChavePremissa, number>> = {}, quando = new Date().toISOString()): Efetivas {
  const prod = base.produtos.find((p) => p.nome === produto) || null;
  const daBase = prod ? premissasDaBase(prod, base.matriculas?.nome || "matrículas", base.custos?.nome || null, base.marketing?.nome || null, quando) : {};
  const livro = livroSalvo()[produto] || {};
  const premissas: Premissa[] = [];
  const valores: Partial<Premissas> = {};
  const faltantes: ChavePremissa[] = [];
  for (const chave of CHAVES_PREMISSA) {
    const daQ = daPergunta[chave];
    const escolhida: Premissa | null = daQ !== undefined && daQ !== null ? { chave, valor: daQ, origem: "informada", quando, detalhe: "informada na pergunta" } : livro[chave]?.origem === "informada" ? livro[chave]! : daBase[chave] || (livro[chave] && livro[chave]!.origem !== "sugerida" ? livro[chave]! : null);
    if (escolhida) {
      premissas.push(escolhida);
      valores[chave] = escolhida.valor;
    } else faltantes.push(chave);
  }
  return { produto, premissas, faltantes, daBase, valores };
}

// --- Trimestre de referência ---------------------------------------------------------------------
function ultimosMeses(matriculas: Matricula[], n: number): { meses: string[]; inicio: string; fim: string } | null {
  const meses = [...new Set(matriculas.map((m) => m.data?.slice(0, 7)).filter((d): d is string => !!d))].sort();
  if (meses.length < 1) return null;
  const ult = meses.slice(-n);
  return { meses: ult, inicio: ult[0], fim: ult[ult.length - 1] };
}
export function baselineTrimestre(base: Omit<Base, "baseline" | "avisos" | "demo">, matriculas: Matricula[], avisos: string[]): Baseline | null {
  const janela = ultimosMeses(matriculas, 3);
  if (!janela) return null;
  const dentro = matriculas.filter((m) => m.data && janela.meses.includes(m.data.slice(0, 7)));
  let receita = 0;
  let contribuicao = 0;
  for (const prod of base.produtos) {
    const ms = dentro.filter((m) => m.produto === prod.nome);
    if (!ms.length) continue;
    const ef = premissasEfetivas({ ...base, baseline: null, avisos: [], demo: false }, prod.nome);
    const v = ef.valores;
    if (v.custoFixoTurma === undefined || v.custoVariavelAluno === undefined) {
      avisos.push(`Sem custo fixo e variável de "${prod.nome}", a margem do período não pode ser medida. Informe as premissas ou envie a planilha de custos.`);
      return null;
    }
    const alunos = ms.reduce((a, m) => a + m.alunos, 0);
    const rec = ms.reduce((a, m) => a + m.receita, 0);
    const turmas = new Set(ms.map((m) => m.turma)).size;
    receita += rec;
    contribuicao += rec - alunos * v.custoVariavelAluno - alunos * (v.cacAluno ?? 0) - turmas * v.custoFixoTurma;
    if (v.cacAluno === undefined) avisos.push(`Sem gasto de marketing para "${prod.nome}", a margem do período não desconta marketing.`);
  }
  if (receita <= 0) return null;
  const rotulo = janela.meses.length === 1 ? fmtMes(janela.inicio) : `${fmtMes(janela.inicio)} a ${fmtMes(janela.fim)}`;
  return { rotulo, receita, contribuicao, inicio: janela.inicio, fim: janela.fim };
}

// --- Montagem ------------------------------------------------------------------------------------------
export function montarBase(planilhas: Planilha[], ler: (p: Planilha) => Linha[], selecao?: string[]): Base {
  const proprias = planilhas.filter((p) => !p.demo);
  const ativas = selecao ? planilhas.filter(p => selecao.includes(p.id)) : proprias.length ? proprias : planilhas;
  const avisos: string[] = [];
  if (selecao?.some(id => !planilhas.some(p => p.id === id))) avisos.push("Uma fonte desta conversa foi excluída. Selecione novas fontes em Conectores para continuar a análise.");
  if (!selecao && proprias.length && planilhas.length > proprias.length) avisos.push("As planilhas de exemplo ficam de fora enquanto houver planilhas suas.");
  const escolher = (papel: Planilha["papelPlanilha"]) => ativas.filter((p) => p.papelPlanilha === papel).sort((a, b) => b.criadoEm.localeCompare(a.criadoEm))[0] || null;
  const matriculas = escolher("matriculas");
  const custos = escolher("custos");
  const marketing = escolher("marketing");
  if (ativas.filter((p) => p.papelPlanilha === "matriculas").length > 1) avisos.push(`Há mais de uma planilha de matrículas; a base usa a mais recente (${matriculas!.nome}).`);
  const ms = matriculas ? lerMatriculas(matriculas, ler(matriculas)) : [];
  const produtos = resumirProdutos(ms, lerCustos(custos, custos ? ler(custos) : []), lerMarketing(marketing, marketing ? ler(marketing) : []));
  const datas = ms.map((m) => m.data).filter((d): d is string => !!d).sort();
  const parcial = { planilhas, matriculas, custos, marketing, produtos, periodo: datas.length ? { inicio: datas[0].slice(0, 7), fim: datas[datas.length - 1].slice(0, 7) } : null };
  if (matriculas && !colunaPor(matriculas, "produto")) avisos.push(`"${matriculas.nome}" não tem uma coluna de produto: os cenários valem para o conjunto.`);
  if (matriculas && !custos) avisos.push("Sem planilha de custos, os cenários usam custo fixo e variável informados por você.");
  const baseline = matriculas ? baselineTrimestre(parcial, ms, avisos) : null;
  return { ...parcial, baseline, avisos: [...new Set(avisos)], demo: ativas.length > 0 && ativas.every((p) => p.demo) };
}
export function carregarBase(): Base {
  return montarBase(listarPlanilhas(), lerLinhas, contexto.getStore()?.fontes);
}
export function premissasDeTodos(base: Base): PremissasProduto[] {
  return base.produtos.map((p) => {
    const e = premissasEfetivas(base, p.nome);
    return { produto: e.produto, premissas: e.premissas, faltantes: e.faltantes, daBase: e.daBase };
  });
}

// --- Produto pela pergunta -----------------------------------------------------------------------------
const normalizar = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
export function encontrarProduto(nome: string | null | undefined, produtos: ProdutoResumo[]): ProdutoResumo | null {
  if (produtos.length === 1) return produtos[0];
  if (!nome) return null;
  const alvo = normalizar(nome);
  if (!alvo) return null;
  const exato = produtos.find((p) => normalizar(p.nome) === alvo);
  if (exato) return exato;
  const contem = produtos.filter((p) => normalizar(p.nome).includes(alvo) || alvo.includes(normalizar(p.nome)));
  if (contem.length === 1) return contem[0];
  const tokens = alvo.split(" ").filter((t) => t.length > 2);
  const pontuados = produtos.map((p) => ({ p, n: tokens.filter((t) => normalizar(p.nome).includes(t)).length })).filter((x) => x.n > 0).sort((a, b) => b.n - a.n);
  return pontuados.length && (pontuados.length === 1 || pontuados[0].n > pontuados[1].n) ? pontuados[0].p : null;
}

// --- Resumo da base para o LLM (perguntas descritivas e diagnósticas) -------------------------------
export function resumoBaseParaIA(base: Base): string {
  const partes: string[] = [];
  if (!base.matriculas) return "Nenhuma planilha de matrículas mapeada.";
  partes.push(`Base: ${base.matriculas.nome} (${base.matriculas.linhas.toLocaleString("pt-BR")} linhas${base.periodo ? `, ${fmtMes(base.periodo.inicio)} a ${fmtMes(base.periodo.fim)}` : ""})${base.custos ? `, custos em ${base.custos.nome}` : ", sem planilha de custos"}${base.marketing ? `, marketing em ${base.marketing.nome}` : ", sem planilha de marketing"}.`);
  partes.push("Produtos: produto | matrículas | turmas | alunos/turma | ticket cheio médio | desconto médio | receita | custo fixo/turma | custo variável/aluno | marketing/aluno | margem de contribuição histórica");
  for (const p of base.produtos) {
    const f = (v: number | null, chave?: ChavePremissa) => (v === null ? "—" : chave ? formatarPremissa(chave, v) : fmtNum(v));
    partes.push(`${p.nome} | ${fmtNum(p.matriculas)} | ${fmtNum(p.turmas)} | ${f(p.alunosPorTurma, "alunosPorTurma")} | ${f(p.ticketMedio, "ticket")} | ${f(p.descontoMedioPct, "descontoPct")} | ${formatarPremissa("ticket", p.receita)} | ${f(p.custoFixoTurma, "custoFixoTurma")} | ${f(p.custoVariavelAluno, "custoVariavelAluno")} | ${f(p.cacAluno, "cacAluno")} | ${p.margemHistoricaPct === null ? "—" : formatarPremissa("descontoPct", p.margemHistoricaPct)}`);
  }
  for (const pp of premissasDeTodos(base)) {
    const informadas = pp.premissas.filter((p) => p.origem !== "base");
    if (informadas.length) partes.push(`Premissas informadas para ${pp.produto}: ${informadas.map((p) => `${ROTULO_PREMISSA[p.chave]} = ${formatarPremissa(p.chave, p.valor)}`).join("; ")}`);
  }
  if (base.baseline) partes.push(`Período de referência (${base.baseline.rotulo}): receita ${formatarPremissa("ticket", base.baseline.receita)}, contribuição ${formatarPremissa("ticket", base.baseline.contribuicao)}, margem ${formatarPremissa("descontoPct", (base.baseline.contribuicao / base.baseline.receita) * 100)}.`);
  if (base.avisos.length) partes.push(`Avisos: ${base.avisos.join(" ")}`);
  return partes.join("\n");
}
