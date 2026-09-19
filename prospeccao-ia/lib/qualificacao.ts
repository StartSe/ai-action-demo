// Qualificação por evidências (US-017): compara os critérios pedidos numa busca com o texto lido da
// página institucional de uma empresa e devolve evidências + aderência (Fit) — primeira história a
// preencher isso de verdade (antes, todo Conta/LeadProspeccao nascia com fit:null/evidencias:[], ver
// fronteira documentada em lib/execucao-prospeccao.ts). "Critério sem dado NUNCA conta como atendido"
// (prd.json > regras): um termo não encontrado no texto vira "nao_verificavel", nunca "nao_atende" —
// não dá para afirmar com segurança que uma página institucional NÃO atende um critério só porque o
// termo não apareceu nela. ÚNICA exceção (US-024): "Porte" é comparável numericamente (faixa do ICP x
// nº de funcionários extraído do texto), a única forma objetiva de recusar um critério aqui — ver
// avaliarPorte. Avaliação de critério INTERPRETATIVO por IA (o texto livre "outros critérios"/"contexto"
// do ICP) mora em `lib/qualificacao-ia.ts`, SEPARADO deste arquivo: este módulo é importado por Client
// Components (sinalAntigo, em ProspeccaoAndamento.tsx/ExploracaoEmpresa.tsx) e não pode puxar lib/ai.ts
// (que importa lib/store.ts, com node:sqlite) para dentro do bundle do navegador.
import type { Evidencia, Fit, LeadProspeccao, Papel, SinalProspeccao, StatusLead } from "./types";
import { ORDEM_STATUS_LEAD } from "./rotulos";

function normalizar(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Exportada para `lib/qualificacao-ia.ts` (fallback sem IA configurada) reaproveitar a mesma comparação
 * de termo, em vez de reimplementar a normalização de acentos. */
export function contemTermo(conteudo: string, termo: string): boolean {
  const t = termo.trim();
  if (!t) return false;
  return normalizar(conteudo).includes(normalizar(t));
}

const FAIXA_PORTE = /(\d[\d.,]*)\s*(?:a|-|até)\s*(\d[\d.,]*)/i;
const PISO_PORTE = /(?:mais de|acima de|\+)\s*(\d[\d.,]*)/i;
const NUMERO_FUNCIONARIOS = /(\d[\d.,]*)\s*(?:funcion[aá]rios|colaboradores|empregados)/i;

function numeroDe(s: string): number {
  return Number(s.replace(/\./g, "").replace(",", "."));
}

/** Faixa numérica (nº de funcionários) a partir de um texto livre do ICP ("51-200 funcionários", "mais de
 * 500 colaboradores"): sem um padrão reconhecível, devolve null e o critério cai no term-match comum — não
 * dá pra comparar numericamente um texto como "Startup enxuta". */
function faixaDePorte(valor: string): { min: number; max: number } | null {
  const faixa = valor.match(FAIXA_PORTE);
  if (faixa) return { min: numeroDe(faixa[1]), max: numeroDe(faixa[2]) };
  const piso = valor.match(PISO_PORTE);
  if (piso) return { min: numeroDe(piso[1]), max: Infinity };
  return null;
}

/** "Porte" é o único critério com comparação NUMÉRICA determinística (US-024, prd.json > regras: "a regra
 * é determinística onde o dado é objetivo"): quando o ICP pede uma faixa reconhecível e a página cita um
 * número de funcionários fora dela, o critério realmente "não atende" — a única forma seguramente
 * objetiva de recusar um critério nesta camada, sem inferir negação de texto livre (ver comentário de topo
 * do arquivo). Sem faixa OU sem número extraível de um dos dois lados, cai no term-match de sempre. */
function avaliarPorte(conteudo: string, valor: string): Evidencia["resultado"] {
  const faixaAlvo = faixaDePorte(valor);
  const encontrado = conteudo.match(NUMERO_FUNCIONARIOS);
  if (!faixaAlvo || !encontrado) return contemTermo(conteudo, valor) ? "atende" : "nao_verificavel";
  const numero = numeroDe(encontrado[1]);
  return numero >= faixaAlvo.min && numero <= faixaAlvo.max ? "atende" : "nao_atende";
}

/** Uma Evidencia por critério que tinha valor para checar (campo vazio não vira evidência nenhuma). */
export function avaliarCriterios(conteudo: string, criterios: { criterio: string; valor: string }[]): Evidencia[] {
  return criterios
    .filter((c) => c.valor.trim())
    .map((c): Evidencia => ({
      criterio: c.criterio,
      valor: c.valor,
      resultado: c.criterio === "Porte" ? avaliarPorte(conteudo, c.valor) : contemTermo(conteudo, c.valor) ? "atende" : "nao_verificavel",
    }));
}

/** Nenhum critério verificável → "media" (não há base para julgar); todos atendem → "alta"; nenhum atende → "baixa"; caso misto → "media". */
export function calcularFit(evidencias: Evidencia[]): Fit {
  if (evidencias.length === 0) return "media";
  const atende = evidencias.filter((e) => e.resultado === "atende").length;
  if (atende === 0) return "baixa";
  if (atende === evidencias.length) return "alta";
  return "media";
}

const DATA_BR = /\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/;

/** Data de um sinal (US-020): procura uma data no formato brasileiro perto do termo encontrado no
 * conteúdo (ex.: "Vaga publicada em 12/05/2026") — sem nenhuma data reconhecível ali perto, ou com uma
 * data no futuro (não confiável, provavelmente outra coisa no texto), cai na data da própria consulta. */
function dataDoSinal(conteudo: string, termo: string, consultadoEm: string): string {
  const idx = normalizar(conteudo).indexOf(normalizar(termo));
  if (idx === -1) return consultadoEm;
  const janela = conteudo.slice(Math.max(0, idx - 120), idx + termo.length + 120);
  const m = janela.match(DATA_BR);
  if (!m) return consultadoEm;
  const ano = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  const encontrada = new Date(ano, Number(m[2]) - 1, Number(m[1]));
  if (Number.isNaN(encontrada.getTime()) || encontrada.getTime() > Date.now()) return consultadoEm;
  return encontrada.toISOString();
}

/** Sinal sem fonte é descartado: só entra aqui quem já tem origem (a página lida) e data (a data do
 * próprio sinal no texto quando existe; senão, a da consulta de agora, ver dataDoSinal). */
export function sinaisEncontrados(conteudo: string, sinaisAlvo: string[], origem: string, consultadoEm: string): SinalProspeccao[] {
  return sinaisAlvo.filter((s) => contemTermo(conteudo, s)).map((s) => ({ descricao: s, data: dataDoSinal(conteudo, s, consultadoEm), tipo: "sinal", origem }));
}

// Sinal com mais de 90 dias é "antigo" (US-020, prd.json > regras: "sinal com mais de 90 dias é marcado
// como antigo"). Calculado na LEITURA, nunca gravado (mesmo padrão de todo status derivado do tempo).
export const DIAS_SINAL_ANTIGO = 90;

export function sinalAntigo(sinal: SinalProspeccao): boolean {
  const dias = (Date.now() - new Date(sinal.data).getTime()) / (24 * 60 * 60 * 1000);
  return dias > DIAS_SINAL_ANTIGO;
}

/** O sinal mais recente de um lead (US-033, coluna "Sinal" da lista): `null` sem nenhum sinal. */
export function sinalMaisRecente(sinais: SinalProspeccao[]): SinalProspeccao | null {
  if (sinais.length === 0) return null;
  return [...sinais].sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime())[0];
}

export type FunilContagens = { encontrados: number; qualificados: number; selecionados: number; contatados: number; respondidos: number };

/** Funil de uma prospecção (US-035): contagens ACUMULATIVAS pela ordem fixa de progressão do lead
 * (`ORDEM_STATUS_LEAD`) — um lead "abordado" também conta como "qualificado" e "selecionado". Leads
 * "descartado" (fora dessa ordem, `indexOf` -1) só entram em `encontrados` (a busca encontrou a pessoa,
 * mesmo que ela não siga adiante), nunca nas contagens de progresso. Reaproveitada pelo cabeçalho de
 * `/prospeccoes/[id]` e pela lista de `/prospeccoes` (components/Prospeccoes.tsx) — sempre a partir dos
 * leads JÁ FILTRADOS por prospecção, nunca do total do produto/app inteiro. */
export function funilContagens(leads: LeadProspeccao[]): FunilContagens {
  const emOuDepoisDe = (minimo: StatusLead) => {
    const indiceMinimo = ORDEM_STATUS_LEAD.indexOf(minimo);
    return leads.filter((l) => ORDEM_STATUS_LEAD.indexOf(l.status) >= indiceMinimo).length;
  };
  return {
    encontrados: leads.length,
    qualificados: emOuDepoisDe("qualificado"),
    selecionados: emOuDepoisDe("selecionado"),
    contatados: emOuDepoisDe("abordado"),
    respondidos: emOuDepoisDe("respondeu"),
  };
}

/** Texto do funil ("42 encontrados → 18 qualificados → 7 abordagens → 3 respostas", prd.json > AC da
 * US-035) — "Selecionados" tem sua própria aba na tela (US-035), mas não ganha um número aqui: o
 * cabeçalho mostra só os 4 marcos que a AC pede, na ordem literal do exemplo. */
export function formatarFunil(c: FunilContagens): string {
  const item = (n: number, singular: string, plural: string) => `${n} ${n === 1 ? singular : plural}`;
  return [
    item(c.encontrados, "encontrado", "encontrados"),
    item(c.qualificados, "qualificado", "qualificados"),
    item(c.contatados, "abordagem", "abordagens"),
    item(c.respondidos, "resposta", "respostas"),
  ].join(" → ");
}

const ORDEM_FIT: Record<Fit, number> = { alta: 0, media: 1, baixa: 2 };

/** Ordenação padrão da lista de leads (US-033, prd.json > AC: "fit alta primeiro, depois sinal mais
 * recente"): lead sem fit avaliado vai depois de todos os fits conhecidos; dentro do mesmo fit, lead sem
 * nenhum sinal vai por último. */
export function ordenarLeadsPorPrioridade(leads: LeadProspeccao[]): LeadProspeccao[] {
  return [...leads].sort((a, b) => {
    const fitA = a.fit ? ORDEM_FIT[a.fit] : 3;
    const fitB = b.fit ? ORDEM_FIT[b.fit] : 3;
    if (fitA !== fitB) return fitA - fitB;
    const sinalA = sinalMaisRecente(a.sinais);
    const sinalB = sinalMaisRecente(b.sinais);
    if (!sinalA && !sinalB) return 0;
    if (!sinalA) return 1;
    if (!sinalB) return -1;
    return new Date(sinalB.data).getTime() - new Date(sinalA.data).getTime();
  });
}

/** Resumo de até ~2 linhas a partir do markdown lido: primeira linha "de conteúdo" (sem título/marcação, com um tamanho mínimo para não pegar um item de menu). */
export function resumoDaPagina(conteudo: string): string {
  const linhas = conteudo
    .split("\n")
    .map((l) => l.replace(/^#+\s*/, "").replace(/[*_`>]/g, "").trim())
    .filter((l) => l.length > 25);
  const texto = linhas[0] || conteudo.replace(/\s+/g, " ").trim();
  return texto.length > 160 ? `${texto.slice(0, 157)}…` : texto;
}

/** Domínio (sem "www.") para unificar empresas repetidas entre consultas pelo site. */
export function dominioDe(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

const PALAVRAS_DECISOR = /diretor|presidente|\bceo\b|\bcoo\b|\bcto\b|vice-presidente|\bvp\b|s[oó]cio|fundador/i;
const PALAVRAS_INFLUENCIADOR = /gerente|coordenador|\bhead\b|supervisor/i;

/** Persona do ICP que casa com o cargo — nas duas direções, porque tanto o cargo pode ser a versão mais
 * específica de uma persona genérica ("Gerente de Manutenção Industrial" contém a persona "Gerente de
 * Manutenção") quanto o contrário, comum em cargo curto extraído de busca ("Analista" dentro da persona
 * "Analista de Manutenção"). Mesma comparação de termo usada para critério/sinal (`contemTermo`).
 * Devolve a persona encontrada (para citar na explicação) ou `null`. */
function personaDoCargo(cargo: string, personas: string[]): string | null {
  return personas.find((p) => p.trim() && (contemTermo(cargo, p) || contemTermo(p, cargo))) ?? null;
}

/** Papel de uma pessoa no processo de decisão (US-018: heurística só por palavra-chave no cargo; US-026:
 * cruza também as personas do ICP). Palavra de decisor/influenciador no cargo tem prioridade; sem
 * nenhuma delas, um cargo que corresponde a uma persona do perfil (o comprador que o ICP já descreveu)
 * vira "champion" — o sinal de proximidade com o produto que o cargo sozinho não dava antes da US-026. */
export function inferirPapel(cargo: string | null, personas: string[] = []): Papel {
  if (!cargo) return "desconhecido";
  if (PALAVRAS_DECISOR.test(cargo)) return "decisor";
  if (PALAVRAS_INFLUENCIADOR.test(cargo)) return "influenciador";
  if (personaDoCargo(cargo, personas)) return "champion";
  return "desconhecido";
}

/** Explicação em uma frase do porquê do papel inferido (US-026, AC "o `title` explica a inferência em
 * uma frase") — citando o próprio cargo ou a persona do ICP que casou com ele. `null` para
 * "desconhecido" (nenhum chip aparece, então não há o que explicar). */
export function motivoPapel(papel: Papel, cargo: string | null, personas: string[] = []): string | null {
  if (papel === "decisor") return `Cargo com palavra de liderança/decisão: "${cargo}".`;
  if (papel === "influenciador") return `Cargo com palavra de gestão/influência: "${cargo}".`;
  if (papel === "champion") {
    const persona = cargo ? personaDoCargo(cargo, personas) : null;
    return persona ? `Cargo corresponde à persona "${persona}" do perfil ideal.` : `Cargo corresponde a uma persona do perfil ideal.`;
  }
  return null;
}
