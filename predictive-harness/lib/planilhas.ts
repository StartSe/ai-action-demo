// Planilhas: leitura (CSV e JSON), perfil estatístico local, classificação semântica das colunas pelo
// Jev (uma chamada com uma pergunta por coluna), agregados para o LLM e persistência em SQLite.
// As linhas nunca vão para a IA: só perfil e agregados.
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { abrirBanco } from "./store";
import { AppError } from "./api";
import { decidir, escolha, sim, jevDisponivel, type Pergunta } from "./jev";
import { papeisHeuristicos, papelDaPlanilha, perguntasPapeis, PAPEIS_VALIDOS } from "./papeis";
import type { Coluna, PapelFPA, Planilha, Qualidade, TipoBase, TipoSemantico } from "./types";

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
const PASTA = path.join(DATA_DIR, "planilhas");
export const LIMITE_BYTES = 20 * 1024 * 1024;
export const LIMITE_LINHAS = 200_000;
export const LIMITE_COLUNAS = 120;
const COLUNAS_JEV = 40;
export type Linha = Record<string, string>;

// --- Leitura -------------------------------------------------------------------------------------
function detectarSeparador(linha: string) {
  let melhor = ",";
  let maior = -1;
  for (const sep of [",", ";", "\t", "|"]) {
    let n = 0;
    let aspas = false;
    for (const ch of linha) {
      if (ch === '"') aspas = !aspas;
      else if (ch === sep && !aspas) n++;
    }
    if (n > maior) {
      maior = n;
      melhor = sep;
    }
  }
  return melhor;
}
export function parseCSV(texto: string): { cabecalho: string[]; linhas: Linha[]; linhasVazias: number } {
  const t = texto.replace(/^﻿/, "");
  const primeira = t.split(/\r?\n/, 1)[0] || "";
  const sep = detectarSeparador(primeira);
  const registros: string[][] = [];
  let atual: string[] = [];
  let campo = "";
  let aspas = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (aspas) {
      if (ch === '"') {
        if (t[i + 1] === '"') {
          campo += '"';
          i++;
        } else aspas = false;
      } else campo += ch;
    } else if (ch === '"') aspas = true;
    else if (ch === sep) {
      atual.push(campo);
      campo = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && t[i + 1] === "\n") i++;
      atual.push(campo);
      registros.push(atual);
      atual = [];
      campo = "";
    } else campo += ch;
  }
  if (campo.length || atual.length) {
    atual.push(campo);
    registros.push(atual);
  }
  if (!registros.length) throw new AppError("O arquivo está vazio.");
  const vistos = new Map<string, number>();
  const cabecalho = registros[0].map((c, i) => {
    let nome = c.trim() || `coluna_${i + 1}`;
    const n = vistos.get(nome) || 0;
    vistos.set(nome, n + 1);
    if (n) nome = `${nome}_${n + 1}`;
    return nome;
  });
  if (cabecalho.length > LIMITE_COLUNAS) throw new AppError(`A planilha tem ${cabecalho.length} colunas; o limite é ${LIMITE_COLUNAS}.`);
  const linhas: Linha[] = [];
  let linhasVazias = 0;
  for (const reg of registros.slice(1)) {
    if (reg.every((v) => !v.trim())) {
      linhasVazias++;
      continue;
    }
    const linha: Linha = {};
    cabecalho.forEach((nome, i) => (linha[nome] = (reg[i] ?? "").trim()));
    linhas.push(linha);
    if (linhas.length > LIMITE_LINHAS) throw new AppError(`A planilha passa de ${LIMITE_LINHAS.toLocaleString("pt-BR")} linhas. Envie um recorte menor.`);
  }
  return { cabecalho, linhas, linhasVazias };
}
export function parseJSONTabela(texto: string): { cabecalho: string[]; linhas: Linha[]; linhasVazias: number } {
  let dados: unknown;
  try {
    dados = JSON.parse(texto.replace(/^﻿/, ""));
  } catch {
    throw new AppError("O arquivo JSON não pôde ser lido.");
  }
  if (!Array.isArray(dados) && dados && typeof dados === "object") {
    const listas = Object.values(dados as Record<string, unknown>).filter(Array.isArray);
    if (listas.length === 1) dados = listas[0];
  }
  if (!Array.isArray(dados) || !dados.length) throw new AppError("O JSON precisa ser uma lista de registros (objetos).");
  const cabecalho: string[] = [];
  for (const item of dados.slice(0, 5000) as unknown[]) {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new AppError("Cada item do JSON precisa ser um objeto com campos.");
    for (const k of Object.keys(item)) if (!cabecalho.includes(k)) cabecalho.push(k);
  }
  if (cabecalho.length > LIMITE_COLUNAS) throw new AppError(`O JSON tem ${cabecalho.length} campos; o limite é ${LIMITE_COLUNAS}.`);
  if (dados.length > LIMITE_LINHAS) throw new AppError(`O JSON passa de ${LIMITE_LINHAS.toLocaleString("pt-BR")} registros. Envie um recorte menor.`);
  const linhas = (dados as Record<string, unknown>[]).map((item) => {
    const l: Linha = {};
    for (const k of cabecalho) {
      const v = item[k];
      l[k] = v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v).trim();
    }
    return l;
  });
  return { cabecalho, linhas, linhasVazias: 0 };
}

// --- Tipos e estatística --------------------------------------------------------------------------
export function paraNumero(s: string): number | null {
  let v = s.trim().replace(/^(R\$|US\$|€|\$)\s*/i, "").replace(/\s|%$/g, "");
  if (!v || /[a-zA-Z]/.test(v)) return null;
  const virgulas = (v.match(/,/g) || []).length;
  const pontos = (v.match(/\./g) || []).length;
  if (virgulas && pontos) {
    if (v.lastIndexOf(",") > v.lastIndexOf(".")) v = v.replace(/\./g, "").replace(",", ".");
    else v = v.replace(/,/g, "");
  } else if (virgulas === 1) v = v.replace(",", ".");
  else if (virgulas > 1) v = v.replace(/,/g, "");
  else if (pontos > 1) v = v.replace(/\./g, "");
  else if (pontos === 1 && /^\-?\d{1,3}\.\d{3}$/.test(v)) v = v.replace(".", "");
  if (!/^-?\d*\.?\d+$/.test(v) && !/^-?\d+\.?$/.test(v)) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
export function paraData(s: string): string | null {
  const v = s.trim();
  let m = /^(\d{4})-(\d{2})(?:-(\d{2}))?(?:[T ].*)?$/.exec(v);
  if (m) return `${m[1]}-${m[2]}-${m[3] || "01"}`;
  m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(v);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  m = /^(\d{4})\/(\d{2})\/(\d{2})/.exec(v);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{2})\/(\d{4})$/.exec(v);
  if (m) return `${m[2]}-${m[1]}-01`;
  return null;
}
const BOOLEANOS = new Set(["sim", "não", "nao", "true", "false", "yes", "no", "verdadeiro", "falso"]);
export function inferirTipo(valores: string[]): TipoBase {
  const cheios = valores.filter((v) => v !== "");
  if (!cheios.length) return "texto";
  const amostra = cheios.slice(0, 2000);
  const conta = (fn: (v: string) => boolean) => amostra.filter(fn).length / amostra.length;
  if (conta((v) => BOOLEANOS.has(v.toLowerCase())) >= 0.95) return "booleano";
  if (conta((v) => paraData(v) !== null) >= 0.9) return "data";
  if (conta((v) => paraNumero(v) !== null) >= 0.9) return "numero";
  return "texto";
}
const NOME = {
  moeda: /receita|valor|pre[cç]o|custo|faturamento|ticket|sal[aá]rio|montante|total|lucro|pagamento|despesa|gasto|venda(s)?_?(brutas|liquidas)?$|amount|price|revenue|cost/i,
  percentual: /pct|percent|%|taxa|margem|rate|share/i,
  identificador: /(^|_)(id|codigo|código|cod|sku|cpf|cnpj|matricula|matrícula|pedido|nota|nf)(_|$)|_id$|^id_/i,
  geografia: /regi[aã]o|estado|cidade|pa[ií]s|^uf$|bairro|cep|munic[ií]pio|country|city|state|region/i,
  pessoal: /^nome|e-?mail|cpf|telefone|celular|whatsapp|endere[cç]o|^rg$|passaporte|nascimento/i,
};
export function semanticoHeuristico(nome: string, tipo: TipoBase, c: { distintos: number; linhas: number; mediaTamanho: number; min?: number; max?: number }): TipoSemantico {
  if (tipo === "data") return "data";
  if (tipo === "booleano") return "categoria";
  if (tipo === "numero") {
    if (NOME.identificador.test(nome) && c.distintos >= c.linhas * 0.9) return "identificador";
    if (NOME.percentual.test(nome) || (c.min !== undefined && c.max !== undefined && c.min >= 0 && c.max <= 1 && !NOME.moeda.test(nome))) return "percentual";
    if (NOME.moeda.test(nome)) return "moeda";
    return "quantidade";
  }
  if (NOME.geografia.test(nome)) return "geografia";
  if (NOME.identificador.test(nome) && c.mediaTamanho <= 40) return "identificador";
  if (c.distintos >= c.linhas * 0.9 && c.linhas > 20) return c.mediaTamanho > 40 ? "texto_livre" : "identificador";
  if (c.mediaTamanho > 60) return "texto_livre";
  return "categoria";
}
export function perfilar(cabecalho: string[], linhas: Linha[], linhasVazias: number): { colunas: Coluna[]; qualidade: Qualidade; periodo: Planilha["periodo"] } {
  const colunas: Coluna[] = cabecalho.map((nome) => {
    const valores = linhas.map((l) => l[nome] ?? "");
    const cheios = valores.filter((v) => v !== "");
    const tipo = inferirTipo(valores);
    const contagem = new Map<string, number>();
    for (const v of cheios) contagem.set(v, (contagem.get(v) || 0) + 1);
    const distintos = contagem.size;
    const exemplos = [...contagem.keys()].slice(0, 3).map((v) => v.slice(0, 40));
    const mediaTamanho = cheios.length ? cheios.reduce((a, v) => a + v.length, 0) / cheios.length : 0;
    const col: Coluna = { nome, tipo, semantico: "categoria", origem: "heuristica", confianca: null, alvoPrevisao: null, dadoPessoal: null, nulos: valores.length - cheios.length, distintos, exemplos, papel: "nenhum", papelOrigem: "heuristica", papelConfianca: null };
    if (tipo === "numero") {
      const nums = cheios.map(paraNumero).filter((n): n is number => n !== null);
      if (nums.length) {
        col.min = Math.min(...nums);
        col.max = Math.max(...nums);
        col.soma = nums.reduce((a, b) => a + b, 0);
        col.media = col.soma / nums.length;
      }
    } else if (tipo === "data") {
      const datas = cheios.map(paraData).filter((d): d is string => d !== null).sort();
      if (datas.length) {
        col.min = datas[0];
        col.max = datas[datas.length - 1];
      }
    }
    if (tipo !== "numero" && distintos <= 50) col.topo = [...contagem.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([valor, n]) => ({ valor: valor.slice(0, 40), n }));
    col.semantico = semanticoHeuristico(nome, tipo, { distintos, linhas: linhas.length, mediaTamanho, min: typeof col.min === "number" ? col.min : undefined, max: typeof col.max === "number" ? col.max : undefined });
    col.alvoPrevisao = col.semantico === "moeda" || col.semantico === "quantidade" ? 0.6 : 0.1;
    col.dadoPessoal = NOME.pessoal.test(nome) ? 0.9 : 0.05;
    return col;
  });
  papeisHeuristicos(colunas).forEach((papel, i) => (colunas[i].papel = papel));
  const chaves = linhas.map((l) => cabecalho.map((c) => l[c]).join("\u0001"));
  const duplicadas = chaves.length - new Set(chaves).size;
  const avisos: string[] = [];
  if (duplicadas) avisos.push(`${duplicadas} linha(s) repetida(s).`);
  if (linhasVazias) avisos.push(`${linhasVazias} linha(s) em branco ignorada(s).`);
  for (const c of colunas) if (c.nulos > linhas.length * 0.3) avisos.push(`"${c.nome}" está vazia em ${Math.round((c.nulos / linhas.length) * 100)}% das linhas.`);
  const dataCol = colunas.find((c) => c.tipo === "data" && typeof c.min === "string");
  const periodo = dataCol ? { coluna: dataCol.nome, inicio: String(dataCol.min), fim: String(dataCol.max) } : null;
  return { colunas, qualidade: { duplicadas, linhasVazias, avisos }, periodo };
}

// --- Agregados para o LLM (nunca as linhas) ------------------------------------------------------
const fmt = (n: number) => (Math.abs(n) >= 100 ? Math.round(n).toLocaleString("pt-BR") : n.toLocaleString("pt-BR", { maximumFractionDigits: 2 }));
export function resumoParaIA(p: Planilha, linhas: Linha[], limite = 9000): string {
  const partes: string[] = [];
  partes.push(`Planilha "${p.nome}": ${p.linhas.toLocaleString("pt-BR")} linhas, ${p.colunas.length} colunas.` + (p.periodo ? ` Período (${p.periodo.coluna}): ${p.periodo.inicio} a ${p.periodo.fim}.` : ""));
  partes.push("Colunas:");
  for (const c of p.colunas) {
    let s = `- ${c.nome} (${c.semantico}, ${c.tipo})`;
    if (c.tipo === "numero" && c.soma !== undefined) s += `: soma ${fmt(c.soma)}, média ${fmt(c.media!)}, mín ${fmt(c.min as number)}, máx ${fmt(c.max as number)}`;
    else if (c.tipo === "data") s += `: de ${c.min} a ${c.max}`;
    else s += `: ${c.distintos} valores distintos` + (c.topo?.length && c.semantico !== "identificador" ? ` (mais frequentes: ${c.topo.map((t) => `${t.valor} ×${t.n}`).join(", ")})` : "");
    if (c.nulos) s += `; ${c.nulos} vazios`;
    partes.push(s);
  }
  const numericas = [...p.colunas.filter((c) => c.tipo === "numero" && c.semantico === "moeda"), ...p.colunas.filter((c) => c.tipo === "numero" && c.semantico === "quantidade")].slice(0, 4);
  const dataCol = p.colunas.find((c) => c.semantico === "data");
  if (dataCol && numericas.length) {
    const porMes = new Map<string, number[]>();
    for (const l of linhas) {
      const d = paraData(l[dataCol.nome] || "");
      if (!d) continue;
      const mes = d.slice(0, 7);
      const acc = porMes.get(mes) || numericas.map(() => 0);
      numericas.forEach((c, i) => (acc[i] += paraNumero(l[c.nome] || "") || 0));
      porMes.set(mes, acc);
    }
    const meses = [...porMes.keys()].sort().slice(-36);
    partes.push(`\nTotais por mês (${dataCol.nome}): mês | ${numericas.map((c) => c.nome).join(" | ")}`);
    for (const m of meses) partes.push(`${m} | ${porMes.get(m)!.map(fmt).join(" | ")}`);
  }
  const categorias = p.colunas.filter((c) => (c.semantico === "categoria" || c.semantico === "geografia") && c.distintos <= 30 && c.distintos > 1).slice(0, 4);
  for (const cat of categorias) {
    const grupos = new Map<string, { n: number; somas: number[] }>();
    for (const l of linhas) {
      const k = l[cat.nome] || "(vazio)";
      const g = grupos.get(k) || { n: 0, somas: numericas.map(() => 0) };
      g.n++;
      numericas.forEach((c, i) => (g.somas[i] += paraNumero(l[c.nome] || "") || 0));
      grupos.set(k, g);
    }
    const ordenados = [...grupos.entries()].sort((a, b) => (numericas.length ? b[1].somas[0] - a[1].somas[0] : b[1].n - a[1].n)).slice(0, 12);
    partes.push(`\nTotais por ${cat.nome}: ${cat.nome} | linhas${numericas.map((c) => ` | ${c.nome}`).join("")}`);
    for (const [k, g] of ordenados) partes.push(`${k} | ${g.n}${g.somas.map((s) => ` | ${fmt(s)}`).join("")}`);
    if (dataCol && numericas.length && meses12(linhas, dataCol.nome).length >= 2) {
      const [ant, ult] = meses12(linhas, dataCol.nome);
      const linha = (k: string, faixa: [string, string]) => linhas.filter((l) => (l[cat.nome] || "(vazio)") === k && dentro(paraData(l[dataCol.nome] || ""), faixa)).reduce((a, l) => a + (paraNumero(l[numericas[0].nome] || "") || 0), 0);
      partes.push(`Variação de ${numericas[0].nome} por ${cat.nome}, ${ult[0].slice(0, 7)}..${ult[1].slice(0, 7)} vs ${ant[0].slice(0, 7)}..${ant[1].slice(0, 7)}:`);
      for (const [k] of ordenados) {
        const a = linha(k, ant);
        const b = linha(k, ult);
        partes.push(`${k}: ${fmt(a)} -> ${fmt(b)}` + (a ? ` (${(((b - a) / a) * 100).toFixed(1)}%)` : ""));
      }
    }
  }
  if (p.qualidade.avisos.length) partes.push(`\nQualidade: ${p.qualidade.avisos.join(" ")}`);
  let texto = partes.join("\n");
  if (texto.length > limite) texto = texto.slice(0, limite) + "\n… (resumo cortado)";
  return texto;
}
function dentro(d: string | null, faixa: [string, string]) {
  return !!d && d >= faixa[0] && d <= faixa[1];
}
/** Duas janelas de até 6 meses consecutivos no fim do período: anterior e última. */
function meses12(linhas: Linha[], coluna: string): [string, string][] {
  const meses = [...new Set(linhas.map((l) => paraData(l[coluna] || "")).filter((d): d is string => !!d).map((d) => d.slice(0, 7)))].sort();
  if (meses.length < 2) return [];
  const n = Math.min(6, Math.floor(meses.length / 2));
  const ult = meses.slice(-n);
  const ant = meses.slice(-2 * n, -n);
  return [[ant[0] + "-01", ant[ant.length - 1] + "-31"], [ult[0] + "-01", ult[ult.length - 1] + "-31"]];
}

// --- Classificação pelo Jev ------------------------------------------------------------------------
const CRITERIOS_TIPO: Record<TipoSemantico, string> = {
  data: "Datas ou períodos (dia, mês, ano).",
  moeda: "Valores monetários: receita, custo, preço, faturamento, salário.",
  quantidade: "Contagens ou medidas não monetárias: unidades, horas, peso, visitas.",
  percentual: "Taxas, proporções ou percentuais.",
  categoria: "Rótulos que se repetem e agrupam linhas: canal, produto, status, segmento.",
  identificador: "Códigos únicos que identificam um registro, cliente ou pedido; não servem para somar.",
  geografia: "Lugares: região, estado, cidade, país, endereço.",
  texto_livre: "Texto livre: descrições, comentários, observações.",
};
export function perguntasClassificacao(colunas: Coluna[]): Record<string, Pergunta> {
  const perguntas: Record<string, Pergunta> = {};
  colunas.forEach((c, i) => {
    perguntas[`tipo_${i}`] = { type: "choice", instructions: `Qual é o tipo semântico da coluna \`colunas[${i}]\` ("${c.nome}"), considerando nome, tipo detectado e exemplos?`, criteria: CRITERIOS_TIPO };
    perguntas[`alvo_${i}`] = { type: "noul", instructions: `A coluna \`colunas[${i}]\` ("${c.nome}") é algo que uma empresa quereria prever (um alvo plausível de previsão, como receita, demanda, cancelamento ou atraso)?` };
    perguntas[`pessoal_${i}`] = { type: "noul", instructions: `A coluna \`colunas[${i}]\` ("${c.nome}") contém dado pessoal que identifica uma pessoa (nome, e-mail, CPF, telefone, endereço)?` };
  });
  Object.assign(perguntas, perguntasPapeis(colunas));
  return perguntas;
}
export async function classificarComJev(p: Planilha, signal?: AbortSignal): Promise<Planilha> {
  const alvo = p.colunas.slice(0, COLUNAS_JEV);
  const state = {
    planilha: p.nome,
    linhas: p.linhas,
    colunas: alvo.map((c) => ({ nome: c.nome, tipo_detectado: c.tipo, exemplos: c.exemplos, distintos: c.distintos, vazios: c.nulos, min: c.min, max: c.max })),
  };
  const d = await decidir(state, perguntasClassificacao(alvo), { signal });
  const colunas = p.colunas.map((c, i) => {
    if (i >= alvo.length) return c;
    const t = escolha(d, `tipo_${i}`);
    const semantico = t.valor && t.valor in CRITERIOS_TIPO ? (t.valor as TipoSemantico) : c.semantico;
    const alvoP = sim(d, `alvo_${i}`).probabilidade;
    const pessoal = sim(d, `pessoal_${i}`).probabilidade;
    const pj = escolha(d, `papel_${i}`);
    // Papel confirmado pela pessoa nunca é sobrescrito pelo Jev; baixa confiança mantém a heurística.
    const papel = c.papelOrigem === "confirmado" ? c.papel : pj.valor && PAPEIS_VALIDOS.includes(pj.valor as PapelFPA) && !pj.baixa ? (pj.valor as PapelFPA) : c.papel;
    return { ...c, semantico: t.baixa && t.valor === null ? c.semantico : semantico, origem: "jev" as const, confianca: t.confianca, alvoPrevisao: alvoP ?? c.alvoPrevisao, dadoPessoal: pessoal ?? c.dadoPessoal, papel, papelOrigem: c.papelOrigem === "confirmado" ? c.papelOrigem : pj.valor ? ("jev" as const) : c.papelOrigem, papelConfianca: pj.confianca };
  });
  const unicas = garantirPapeisUnicos(colunas);
  return {
    ...p,
    colunas: unicas,
    papelPlanilha: papelDaPlanilha(unicas),
    classificacao: "jev",
    aviso: p.colunas.length > COLUNAS_JEV ? `Só as ${COLUNAS_JEV} primeiras colunas foram classificadas pelo Jev; as demais seguem a heurística local.` : null,
    harness: { quando: new Date().toISOString(), latenciaMs: d.latenciaMs, tokens: d.tokens, custoUsd: d.custoUsd, caminho: d.caminho, colunas: alvo.length },
  };
}

/** Papéis que só cabem em uma coluna: fica o de maior confiança, os demais voltam a "nenhum". */
const PAPEIS_UNICOS: PapelFPA[] = ["receita", "desconto", "produto", "turma", "alunos", "data", "canal", "custo_fixo", "custo_variavel", "marketing"];
export function garantirPapeisUnicos(colunas: Coluna[]): Coluna[] {
  const saida = colunas.map((c) => ({ ...c }));
  for (const papel of PAPEIS_UNICOS) {
    const idx = saida.map((c, i) => (c.papel === papel ? i : -1)).filter((i) => i >= 0);
    if (idx.length <= 1) continue;
    const peso = (i: number) => (saida[i].papelOrigem === "confirmado" ? 2 : 0) + (saida[i].papelConfianca ?? 0.5);
    const fica = idx.sort((a, b) => peso(b) - peso(a))[0];
    for (const i of idx) if (i !== fica) saida[i] = { ...saida[i], papel: "nenhum" };
  }
  return saida;
}
/** A pessoa confirma (ou corrige) o papel de cada coluna; o mapeamento passa a valer sobre Jev e heurística. */
export function definirPapeis(id: string, papeis: Record<string, string>): Planilha {
  const p = obterPlanilha(id);
  if (p.demo) throw new AppError("As planilhas de exemplo já vêm mapeadas. Envie as suas para mapear as colunas.", 409);
  const colunas = p.colunas.map((c) => {
    const novo = papeis[c.nome];
    if (novo === undefined) return c;
    if (!PAPEIS_VALIDOS.includes(novo as PapelFPA)) throw new AppError(`Papel "${novo}" não existe para a coluna "${c.nome}".`);
    return { ...c, papel: novo as PapelFPA, papelOrigem: "confirmado" as const };
  });
  const unicas = garantirPapeisUnicos(colunas);
  return salvarPlanilha({ ...p, colunas: unicas, papelPlanilha: papelDaPlanilha(unicas), mapeamentoConfirmado: true });
}

// --- Persistência ----------------------------------------------------------------------------------
function db() {
  const b = abrirBanco();
  b.exec(`CREATE TABLE IF NOT EXISTS planilhas (id TEXT PRIMARY KEY, json TEXT NOT NULL, criado_em TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS mensagens (id TEXT PRIMARY KEY, planilha_id TEXT NOT NULL, json TEXT NOT NULL, criado_em TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS mensagens_planilha ON mensagens(planilha_id, criado_em);`);
  return b;
}
const cacheLinhas = new Map<string, Linha[]>();
/** Planilhas gravadas pela v0.1.0 não têm papéis: recebem a heurística ao serem lidas. */
function normalizar(p: Planilha): Planilha {
  if (p.colunas.every((c) => c.papel) && p.papelPlanilha) return p;
  const papeis = papeisHeuristicos(p.colunas);
  const colunas = p.colunas.map((c, i) => ({ ...c, papel: c.papel || papeis[i], papelOrigem: c.papelOrigem || ("heuristica" as const), papelConfianca: c.papelConfianca ?? null }));
  return { ...p, colunas, papelPlanilha: p.papelPlanilha || papelDaPlanilha(colunas), mapeamentoConfirmado: p.mapeamentoConfirmado ?? false };
}
export function listarPlanilhas(): Planilha[] {
  const rows = db().prepare("SELECT json FROM planilhas ORDER BY criado_em DESC").all() as { json: string }[];
  return rows.map((r) => normalizar(JSON.parse(r.json) as Planilha));
}
export function obterPlanilha(id: string): Planilha {
  const row = db().prepare("SELECT json FROM planilhas WHERE id = ?").get(id) as { json: string } | undefined;
  if (!row) throw new AppError("Planilha não encontrada.", 404);
  return normalizar(JSON.parse(row.json) as Planilha);
}
export function salvarPlanilha(p: Planilha) {
  db().prepare("INSERT INTO planilhas (id, json, criado_em) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET json = excluded.json").run(p.id, JSON.stringify(p), p.criadoEm);
  return p;
}
export function lerLinhas(p: Planilha): Linha[] {
  const cache = cacheLinhas.get(p.id);
  if (cache) return cache;
  const texto = fs.readFileSync(path.join(PASTA, `${p.id}.${p.formato}`), "utf8");
  const { linhas } = p.formato === "csv" ? parseCSV(texto) : parseJSONTabela(texto);
  cacheLinhas.set(p.id, linhas);
  return linhas;
}
export async function criarPlanilha({ nome, texto, formato, demo = false, classificar = true }: { nome: string; texto: string; formato: "csv" | "json"; demo?: boolean; classificar?: boolean }): Promise<Planilha> {
  if (Buffer.byteLength(texto) > LIMITE_BYTES) throw new AppError("O arquivo passa de 20 MB. Envie um recorte menor.", 413);
  const { cabecalho, linhas, linhasVazias } = formato === "csv" ? parseCSV(texto) : parseJSONTabela(texto);
  if (!linhas.length) throw new AppError("A planilha não tem linhas de dados.");
  const { colunas, qualidade, periodo } = perfilar(cabecalho, linhas, linhasVazias);
  const id = randomUUID();
  fs.mkdirSync(PASTA, { recursive: true });
  fs.writeFileSync(path.join(PASTA, `${id}.${formato}`), texto, { mode: 0o600 });
  let p: Planilha = {
    id,
    nome: nome.trim().slice(0, 120) || "Planilha",
    formato,
    linhas: linhas.length,
    tamanhoBytes: Buffer.byteLength(texto),
    colunas: demo ? colunas.map((c) => ({ ...c, origem: "exemplo" as const })) : colunas,
    qualidade,
    periodo,
    criadoEm: new Date().toISOString(),
    demo,
    classificacao: demo ? "exemplo" : "heuristica",
    harness: null,
    aviso: null,
    papelPlanilha: papelDaPlanilha(colunas),
    mapeamentoConfirmado: demo,
  };
  if (demo) p.colunas = p.colunas.map((c) => ({ ...c, papelOrigem: "exemplo" as const }));
  cacheLinhas.set(id, linhas);
  if (classificar && jevDisponivel()) {
    try {
      p = await classificarComJev(p);
    } catch (e) {
      p.aviso = `As colunas seguem a leitura local: ${e instanceof Error ? e.message : "o Jev não respondeu."}`;
    }
  }
  return salvarPlanilha(p);
}
export async function reclassificarPlanilha(id: string): Promise<Planilha> {
  const p = obterPlanilha(id);
  if (!jevDisponivel()) throw new AppError("Conecte o OpenRouter em Configurações para classificar com o Jev.", 409);
  return salvarPlanilha(await classificarComJev({ ...p, aviso: null }));
}
export function removerPlanilha(id: string) {
  const p = obterPlanilha(id);
  const b = db();
  b.prepare("DELETE FROM mensagens WHERE planilha_id = ?").run(id);
  b.prepare("DELETE FROM planilhas WHERE id = ?").run(id);
  cacheLinhas.delete(id);
  try {
    fs.unlinkSync(path.join(PASTA, `${p.id}.${p.formato}`));
  } catch {
    /* arquivo já removido */
  }
}
