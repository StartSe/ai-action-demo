// Papéis de FP&A por coluna: heurística local pelo nome e tipo, e a pergunta `choice` por coluna que
// entra na mesma chamada do Jev da classificação semântica. A pessoa confirma o mapeamento na tela.
import type { Coluna, PapelFPA, PapelPlanilha } from "./types";
import type { Pergunta } from "./jev";

export const CRITERIOS_PAPEL: Record<PapelFPA, string> = {
  receita: "Valor pago ou faturado por matrícula/venda: receita, valor, mensalidade, ticket, preço.",
  desconto: "Desconto ou bolsa concedido, em percentual ou em valor.",
  custo_fixo: "Custo fixo de uma turma ou edição, que não depende do número de alunos: professor, sala, produção.",
  custo_variavel: "Custo por aluno: material, plataforma, comissão, certificado.",
  marketing: "Gasto de marketing, mídia ou aquisição em um período ou campanha.",
  produto: "Nome do produto, curso, programa ou oferta.",
  turma: "Identificação da turma, edição, cohort ou classe.",
  alunos: "Quantidade de alunos, matrículas, inscritos ou participantes na linha.",
  data: "Data da matrícula, do início da turma ou do período.",
  canal: "Canal ou origem da venda: indicação, mídia paga, parceiro.",
  nenhum: "Nenhum dos papéis acima (identificador, observação, dado pessoal, outra coisa).",
};
const NOME: Partial<Record<PapelFPA, RegExp>> = {
  desconto: /desconto|discount|bolsa|abatimento/i,
  custo_fixo: /custo_?fixo|fixo|professor|docente|sala|produ[cç][aã]o|fixed/i,
  custo_variavel: /custo_?var|vari[aá]vel|por_?aluno|material|plataforma|comiss|certificad/i,
  marketing: /marketing|m[ií]dia|cac|\bads\b|campanha|aquisi[cç][aã]o|an[uú]ncio/i,
  turma: /turma|cohort|edi[cç][aã]o|classe|\bclass\b/i,
  produto: /produto|curso|programa|imers[aã]o|oferta|\bsku\b|product|trilha|forma[cç][aã]o/i,
  alunos: /alunos|matr[ií]culas|inscritos|participantes|\bqtd\b|quantidade|students|seats|vagas_?ocupadas/i,
  canal: /canal|origem|fonte|channel|source|m[ií]dia_?origem/i,
  receita: /receita|valor_?pago|valor|faturamento|pre[cç]o|ticket|mensalidade|pagamento|revenue|amount|price|total/i,
};
const GASTO_GENERICO = /gasto|investimento|verba|despesa|spend|budget/i;
const ORDEM: PapelFPA[] = ["desconto", "custo_fixo", "custo_variavel", "marketing", "turma", "produto", "alunos", "canal", "receita"];
/** Papel de uma coluna pelo nome e tipo. `todas` dá o contexto da planilha (ex.: "gasto" sem receita ao lado é marketing). */
export function papelHeuristico(c: Pick<Coluna, "nome" | "tipo" | "semantico" | "distintos">, todas: Pick<Coluna, "nome">[] = []): PapelFPA {
  if (c.tipo === "data" || c.semantico === "data") return "data";
  const numerica = c.tipo === "numero";
  for (const papel of ORDEM) {
    if (!NOME[papel]!.test(c.nome)) continue;
    if (["receita", "desconto", "custo_fixo", "custo_variavel", "marketing", "alunos"].includes(papel) && !numerica) continue;
    if (["produto", "turma", "canal"].includes(papel) && numerica && c.distintos > 200) continue;
    return papel;
  }
  if (numerica && GASTO_GENERICO.test(c.nome) && !todas.some((t) => NOME.receita!.test(t.nome))) return "marketing";
  return "nenhum";
}
const UNICOS: PapelFPA[] = ["receita", "desconto", "produto", "turma", "alunos", "data", "canal", "custo_fixo", "custo_variavel"];
/** Aplica a heurística a todas as colunas, garantindo um só papel para os papéis que só cabem em uma coluna. */
export function papeisHeuristicos(colunas: Pick<Coluna, "nome" | "tipo" | "semantico" | "distintos">[]): PapelFPA[] {
  const vistos = new Set<PapelFPA>();
  return colunas.map((c) => {
    const papel = papelHeuristico(c, colunas);
    if (UNICOS.includes(papel)) {
      if (vistos.has(papel)) return "nenhum";
      vistos.add(papel);
    }
    return papel;
  });
}
export function perguntasPapeis(colunas: Pick<Coluna, "nome">[]): Record<string, Pergunta> {
  const perguntas: Record<string, Pergunta> = {};
  colunas.forEach((c, i) => {
    perguntas[`papel_${i}`] = { type: "choice", instructions: `Qual é o papel da coluna \`colunas[${i}]\` ("${c.nome}") num modelo de planejamento financeiro por turma (receita, custos e marketing por produto)?`, criteria: CRITERIOS_PAPEL };
  });
  return perguntas;
}
export function papelDaPlanilha(colunas: Pick<Coluna, "papel">[]): PapelPlanilha {
  const tem = (p: PapelFPA) => colunas.some((c) => c.papel === p);
  if (tem("receita") && (tem("produto") || tem("turma") || tem("data"))) return "matriculas";
  if (tem("custo_fixo") || tem("custo_variavel")) return "custos";
  if (tem("marketing")) return "marketing";
  return "outra";
}
export const PAPEIS_VALIDOS = Object.keys(CRITERIOS_PAPEL) as PapelFPA[];
