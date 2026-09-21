// Modo demonstração: uma escola de negócios fictícia com três planilhas geradas de forma determinística
// (matrículas de 24 meses, custos por turma, marketing por mês) e quatro perguntas roteirizadas, uma por
// categoria, respondidas pelo motor com os números da própria base. Nada aqui chama IA.
import { fmtBRL, fmtNum, fmtPctPontos } from "./formato";
import { calcularTurmas, validarPremissas } from "./fpa";
import { premissasEfetivas, type Base } from "./base";
import { executarEspecificacao, narrativaDeterministica } from "./cenarios";
import type { Cartao, CategoriaPergunta, Especificacao, Mensagem, RegistroDecisao, Sugestao } from "./types";

export const NOME_ESCOLA = "Escola de Negócios Horizonte";
export const NOMES_EXEMPLO = { matriculas: "Matrículas 2024-25 (exemplo)", custos: "Custos por turma (exemplo)", marketing: "Marketing por mês (exemplo)" };
export const PRODUTOS_EXEMPLO = ["Imersão em IA para Líderes", "Programa de Gestão Estratégica", "Curso Online de Dados"] as const;
const CANAIS = ["Indicação", "Mídia paga", "Parceiros", "Eventos"];
type Perfil = { ticket: number; alunos: number; desconto: number; cadaMeses: number; primeiroMes: number; custoFixo: number; custoVar: number; pesoMkt: number };
const PERFIL: Record<(typeof PRODUTOS_EXEMPLO)[number], Perfil> = {
  "Imersão em IA para Líderes": { ticket: 4900, alunos: 28, desconto: 8, cadaMeses: 2, primeiroMes: 0, custoFixo: 38000, custoVar: 750, pesoMkt: 0.45 },
  "Programa de Gestão Estratégica": { ticket: 12500, alunos: 22, desconto: 10, cadaMeses: 3, primeiroMes: 1, custoFixo: 95000, custoVar: 1800, pesoMkt: 0.35 },
  "Curso Online de Dados": { ticket: 1490, alunos: 60, desconto: 15, cadaMeses: 2, primeiroMes: 1, custoFixo: 12000, custoVar: 90, pesoMkt: 0.2 },
};
function lcg(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}
const mesISO = (m: number) => `${2024 + Math.floor(m / 12)}-${String((m % 12) + 1).padStart(2, "0")}`;

export function gerarCSVsExemplo(): { matriculas: string; custos: string; marketing: string } {
  const rnd = lcg(20260921);
  const matriculas = ["data;produto;turma;canal;desconto_pct;valor_pago"];
  const custos = ["produto;turma;custo_fixo;custo_variavel_aluno"];
  const gastoPorMes = new Map<string, number>();
  for (const produto of PRODUTOS_EXEMPLO) {
    const pf = PERFIL[produto];
    let edicao = 0;
    for (let m = pf.primeiroMes; m < 24; m += pf.cadaMeses) {
      edicao++;
      const turma = `T${String(edicao).padStart(2, "0")}`;
      const crescimento = 1 + m * 0.006;
      const alunos = Math.max(8, Math.round(pf.alunos * crescimento * (0.82 + rnd() * 0.36)));
      const mes = mesISO(m);
      for (let a = 0; a < alunos; a++) {
        const dia = 1 + Math.floor(rnd() * 26);
        // Indicação e mídia paga concentram as matrículas.
        const canal = rnd() < 0.7 ? CANAIS[Math.floor(rnd() * 2)] : CANAIS[Math.floor(rnd() * CANAIS.length)];
        const desconto = Math.max(0, Math.round(pf.desconto + (rnd() - 0.5) * 8 + (canal === "Parceiros" ? 5 : 0)));
        const pago = Math.round(pf.ticket * (1 - desconto / 100));
        matriculas.push(`${mes}-${String(dia).padStart(2, "0")};${produto};${turma};${canal};${desconto};${pago}`);
      }
      custos.push(`${produto};${turma};${Math.round(pf.custoFixo * (0.94 + rnd() * 0.12))};${Math.round(pf.custoVar * (0.9 + rnd() * 0.2))}`);
      gastoPorMes.set(`${mes}|${produto}`, (gastoPorMes.get(`${mes}|${produto}`) || 0) + alunos * (pf.ticket * 0.12) * (0.85 + rnd() * 0.3));
    }
  }
  const marketing = ["mes;produto;canal;gasto_marketing"];
  for (let m = 0; m < 24; m++) {
    for (const produto of PRODUTOS_EXEMPLO) {
      const pf = PERFIL[produto];
      const turmaNoMes = gastoPorMes.get(`${mesISO(m)}|${produto}`) || 0;
      // Marketing começa um mês antes da turma e se distribui em mídia paga e eventos.
      const seguinte = gastoPorMes.get(`${mesISO(m + 1)}|${produto}`) || 0;
      const total = turmaNoMes * 0.4 + seguinte * 0.6 + pf.pesoMkt * 3000;
      marketing.push(`${mesISO(m)};${produto};Mídia paga;${Math.round(total * 0.7)}`);
      marketing.push(`${mesISO(m)};${produto};Eventos;${Math.round(total * 0.3)}`);
    }
  }
  return { matriculas: matriculas.join("\n"), custos: custos.join("\n"), marketing: marketing.join("\n") };
}

// --- Perguntas roteirizadas ------------------------------------------------------------------------
const dec = (estacao: RegistroDecisao["estacao"], chave: string, rotulo: string, valor: string, probabilidade: number | null, confianca: number | null = null): RegistroDecisao => ({ estacao, chave, rotulo, valor, probabilidade, confianca, baixaConfianca: false, exemplo: true });
const harnessExemplo = { chamadasJev: 3, latenciaJevMs: 640, custoJevUsd: 0.00034, tokensJev: 8100, modelo: "Exemplo · sem IA conectada", latenciaTotalMs: 1500, caminho: "exemplo", avisos: ["Resposta de demonstração calculada localmente pelo motor; conecte o ChatGPT e o OpenRouter para perguntar qualquer coisa."] };
const IMERSAO = PRODUTOS_EXEMPLO[0];
export type ConversaExemplo = { categoria: CategoriaPergunta; pergunta: string; resposta: (base: Base) => Omit<Mensagem, "id" | "criadoEm" | "papel"> | null };
export const CONVERSAS_EXEMPLO: ConversaExemplo[] = [
  {
    categoria: "diagnostico",
    pergunta: "Qual produto tem a melhor margem de contribuição por turma?",
    resposta(base) {
      const linhas = base.produtos
        .map((p) => {
          const ef = premissasEfetivas(base, p.nome);
          const v = validarPremissas(ef.valores).premissas;
          if (!v) return null;
          const r = calcularTurmas(v);
          return { p, r };
        })
        .filter((x): x is NonNullable<typeof x> => !!x)
        .sort((a, b) => b.r.margemPct - a.r.margemPct);
      if (!linhas.length) return null;
      const melhor = linhas[0];
      const maiorValor = [...linhas].sort((a, b) => b.r.contribuicao - a.r.contribuicao)[0];
      const tabela: Cartao = { tipo: "tabela", titulo: "Contribuição por turma, com as premissas da base", cabecalho: ["Produto", "Turmas", "Alunos/turma", "Receita/turma", "Contribuição/turma", "Margem"], linhas: linhas.map(({ p, r }) => [p.nome, fmtNum(p.turmas), fmtNum(r.alunos, 1), fmtBRL(r.receita), fmtBRL(r.contribuicao), fmtPctPontos(r.margemPct)]) };
      return {
        texto: `**${melhor.p.nome}** tem a melhor margem de contribuição por turma: ${fmtPctPontos(melhor.r.margemPct)}, ou ${fmtBRL(melhor.r.contribuicao)} por turma de ${fmtNum(melhor.r.alunos, 1)} alunos. Em valor absoluto quem mais contribui por turma é **${maiorValor.p.nome}** (${fmtBRL(maiorValor.r.contribuicao)}), pelo ticket maior. A menor margem é de ${linhas[linhas.length - 1].p.nome}, ${fmtPctPontos(linhas[linhas.length - 1].r.margemPct)}.\n\nBase: ${base.matriculas?.nome} (alunos por turma, ticket, desconto), ${base.custos?.nome} (custo fixo e variável) e ${base.marketing?.nome} (marketing por aluno).`,
        cartoes: [tabela],
        decisoes: [
          dec("triagem", "tipo_pergunta", "Tipo da pergunta", "Diagnóstico", 0.91, 0.94),
          dec("triagem", "premissas_ok", "Base e premissas bastam", "Sim", 0.96),
          dec("triagem", "impacto", "Impacto da decisão", "Baixo (0,4)", null, 0.82),
          dec("roteamento", "caminho", "Caminho", "Motor com as premissas de cada produto", null),
          dec("verificacao", "numeros_batem", "Números conferem com o motor", "Sim", 0.97),
          dec("verificacao", "visual", "Visual escolhido", "Tabela", 0.86, 0.88),
        ],
        harness: harnessExemplo,
        categoria: "diagnostico",
        exemplo: true,
      };
    },
  },
  {
    categoria: "cenario",
    pergunta: `Se abrirmos uma nova turma de ${IMERSAO}, qual a contribuição para a margem do trimestre?`,
    resposta(base) {
      const spec: Especificacao = { tipo: "cenario", produto: IMERSAO, turmas: 1, horizonte: "trimestre", premissas: {}, sugestoes: {}, meta: null };
      const ex = executarEspecificacao(base, spec, IMERSAO, "2026-09-21T12:00:00.000Z");
      if (!ex.ok) return null;
      return {
        texto: narrativaDeterministica(ex.fpa),
        cartoes: ex.cartoes,
        fpa: ex.fpa,
        decisoes: [
          dec("triagem", "tipo_pergunta", "Tipo da pergunta", "Cenário", 0.96, 0.97),
          dec("triagem", "drivers", "Premissas envolvidas", "Alunos por turma, ticket, custo fixo, marketing", null),
          dec("triagem", "horizonte", "Horizonte", "Trimestre", 0.88, 0.9),
          dec("triagem", "premissas_ok", "Base e premissas bastam", "Sim", 0.93),
          dec("triagem", "impacto", "Impacto da decisão", "Médio (1,1)", null, 0.79),
          dec("especificacao", "produto", "Produto identificado", IMERSAO, null),
          dec("especificacao", "turmas", "Turmas novas", "1", null),
          dec("motor", "premissas", "Premissas usadas", `${ex.fpa.premissas.length} da base`, null),
          dec("verificacao", "numeros_batem", "Números conferem com o motor", "Sim", 0.97),
          dec("verificacao", "premissa_implicita", "Premissa implícita não declarada", "Não", 0.11),
          dec("verificacao", "escalar", "Pede validação humana", "Não", 0.3),
          dec("verificacao", "visual", "Visual escolhido", "Cascata", 0.9, 0.92),
        ],
        harness: harnessExemplo,
        categoria: "cenario",
        exemplo: true,
      };
    },
  },
  {
    categoria: "meta_reversa",
    pergunta: `Quanto posso gastar em marketing por aluno na ${IMERSAO} e manter 30% de margem?`,
    resposta(base) {
      const spec: Especificacao = { tipo: "meta_reversa", produto: IMERSAO, turmas: 1, horizonte: "trimestre", premissas: {}, sugestoes: {}, meta: { variavel: "cacAluno", margemAlvoPct: 30 } };
      const ex = executarEspecificacao(base, spec, IMERSAO, "2026-09-21T12:00:00.000Z");
      if (!ex.ok) return null;
      return {
        texto: narrativaDeterministica(ex.fpa),
        cartoes: ex.cartoes,
        fpa: ex.fpa,
        decisoes: [
          dec("triagem", "tipo_pergunta", "Tipo da pergunta", "Meta reversa", 0.93, 0.95),
          dec("triagem", "drivers", "Premissas envolvidas", "Marketing por aluno", null),
          dec("triagem", "premissas_ok", "Base e premissas bastam", "Sim", 0.94),
          dec("triagem", "impacto", "Impacto da decisão", "Médio (1,3)", null, 0.76),
          dec("especificacao", "meta", "Meta", "Margem de 30%, variável: marketing por aluno", null),
          dec("motor", "premissas", "Premissas usadas", `${ex.fpa.premissas.length} da base`, null),
          dec("verificacao", "numeros_batem", "Números conferem com o motor", "Sim", 0.96),
          dec("verificacao", "escalar", "Pede validação humana", "Sim", 0.71),
        ],
        harness: { ...harnessExemplo, avisos: [...harnessExemplo.avisos, "A resposta define um teto de gasto: valide com quem responde por marketing antes de ajustar a verba."] },
        categoria: "meta_reversa",
        exemplo: true,
      };
    },
  },
  {
    categoria: "risco",
    pergunta: `Com quantos alunos uma turma da ${IMERSAO} deixa de se pagar?`,
    resposta(base) {
      const spec: Especificacao = { tipo: "ponto_equilibrio", produto: IMERSAO, turmas: 1, horizonte: "trimestre", premissas: {}, sugestoes: {}, meta: null };
      const ex = executarEspecificacao(base, spec, IMERSAO, "2026-09-21T12:00:00.000Z");
      if (!ex.ok) return null;
      return {
        texto: narrativaDeterministica(ex.fpa),
        cartoes: ex.cartoes,
        fpa: ex.fpa,
        decisoes: [
          dec("triagem", "tipo_pergunta", "Tipo da pergunta", "Risco", 0.9, 0.93),
          dec("triagem", "drivers", "Premissas envolvidas", "Alunos por turma, custo fixo", null),
          dec("triagem", "premissas_ok", "Base e premissas bastam", "Sim", 0.95),
          dec("triagem", "impacto", "Impacto da decisão", "Baixo (0,6)", null, 0.8),
          dec("motor", "premissas", "Premissas usadas", `${ex.fpa.premissas.length} da base`, null),
          dec("verificacao", "numeros_batem", "Números conferem com o motor", "Sim", 0.98),
          dec("verificacao", "visual", "Visual escolhido", "Ponto de equilíbrio", 0.87, 0.9),
        ],
        harness: harnessExemplo,
        categoria: "risco",
        exemplo: true,
      };
    },
  },
];
export const SUGESTOES_EXEMPLO: Sugestao[] = CONVERSAS_EXEMPLO.map((c) => ({ categoria: c.categoria, texto: c.pergunta }));
export function respostaExemplo(pergunta: string, base: Base): Omit<Mensagem, "id" | "criadoEm" | "papel"> | null {
  const alvo = pergunta.trim().toLowerCase();
  const c = CONVERSAS_EXEMPLO.find((c) => c.pergunta.toLowerCase() === alvo);
  if (!c) return null;
  const r = c.resposta(base);
  if (!r) return null;
  const outras = CONVERSAS_EXEMPLO.filter((o) => o !== c).map((o) => o.pergunta);
  return { ...r, sugestoes: outras.slice(0, 3) };
}
