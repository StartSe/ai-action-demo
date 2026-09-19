// O parecer da entrevista (US-022): a leitura que o gestor abre no lugar da transcrição inteira.
//
// **São três chamadas ao modelo, e a divisão é de produto antes de ser de código.** Uma chamada só,
// pedindo "avalie esta conversa", devolve um texto que parece um parecer e cita o que não foi dito —
// porque julgar e lembrar ao mesmo tempo é o que um modelo faz pior. Aqui cada passo tem uma
// pergunta e um trabalho:
//
//  1. **Extração** — o que o candidato afirmou, com o número da pergunta de origem. Nada de nota,
//     nada de opinião: só os fatos, para que o passo seguinte tenha o que conferir.
//  2. **Cruzamento** — cada fato bate ou não com o currículo e com a ficha web **confirmada**
//     (`confirmado | divergente | nao_verificavel`), e cada requisito e competência da vaga recebe a
//     evidência mais forte que a conversa deu. É o passo que ancora o parecer no que existe.
//  3. **Parecer** — as notas, o resumo e o que fazer na próxima etapa, escritos **em cima** do que
//     os dois primeiros passos apuraram.
//
// **O que o código decide, o modelo não decide.** A aderência e a consistência saem do passo 2 sem
// reescrita; a pretensão dentro (ou fora) da faixa é uma conta, não um julgamento; `parcial` é
// deduzido da transcrição; e uma recomendação de avançar com um requisito da vaga em `nao_atende`
// é rebaixada aqui, não pedida ao modelo (`aplicarGuardas`). Um parecer é o que o gestor leva para
// uma decisão sobre uma pessoa: o que der para garantir fora do modelo, garante-se fora dele.
//
// Fica acima das entidades, como `lib/painel.ts` e `lib/convite.ts`: junta entrevista, vaga e
// candidato, e nenhuma das três pode importar as outras sem fechar ciclo.
import { aiEnabled, askJSON, meta, modelName } from "./ai";
import { obter as obterCandidato, obterCvTexto } from "./candidatos";
import { obterCultura } from "./cultura";
import { esperar, parecerDemo } from "./demo";
import { lerRoteiro, obter as obterEntrevista, registrarResultado, transcricao } from "./entrevistas";
import { faixaSalarial } from "./formato";
import { salvar } from "./historico";
import { decidirPasso, fichaParaEntrevista, posicaoNoRoteiro } from "./roteiro";
import { obter as obterVaga } from "./vagas";
import type {
  AderenciaRequisito,
  CriterioCultural,
  CriterioTecnico,
  DivergenciaFicha,
  ItemConsistencia,
  ItemFichaRoteiro,
  Parecer,
  Roteiro,
  Recomendacao,
  SituacaoConsistencia,
  SituacaoRequisito,
  Troca,
} from "./types";

/**
 * Menos que isto não é uma entrevista: é alguém que abriu o link, disse uma frase e fechou.
 *
 * Avaliar uma conversa desse tamanho produziria um parecer com cara de parecer e sem nada por trás —
 * e é justamente esse parecer que o gestor levaria para uma decisão sobre uma pessoa.
 */
export const MINIMO_DE_RESPOSTAS = 2;

/** Quanto de cada coisa vai no prompt. A entrevista inteira cabe folgado; o currículo é cortado
 * porque no cruzamento ele viaja junto com a conversa e com a ficha. */
const LIMITE_FALA = 1_200;
const LIMITE_TRANSCRICAO = 18_000;
const LIMITE_CV = 8_000;

/** O que a tela mostra quando a conversa não deu com que avaliar uma competência. A frase é a mesma
 * do exemplo (lib/demo.ts): "não abordado" tem de dizer a mesma coisa vindo de onde vier. */
const SEM_EVIDENCIA_CULTURAL = "Não apareceu nenhuma situação concreta na conversa que permitisse avaliar isto.";

const INSUMO = "toda a conversa, o currículo e a ficha do candidato";

// ---------------------------------------------------------------------------------------------
// O contexto: tudo que o parecer pode olhar
// ---------------------------------------------------------------------------------------------

/**
 * O que a avaliação sabe antes de começar.
 *
 * Diferente do contexto da entrevistadora (`ContextoRoteiro`, lib/roteiro.ts), aqui a faixa salarial
 * entra **sempre**: quem lê o parecer é o gestor, e dizer se a pretensão cabe no orçamento é metade
 * da utilidade de tê-la perguntado. O que continua valendo igual é a D6 — o que a pesquisa na web
 * trouxe só entra depois de o gestor confirmar de quem é aquele perfil.
 */
export type ContextoAvaliacao = {
  cargo: string;
  area?: string;
  senioridade?: string;
  requisitos: string[];
  desafios: string[];
  competencias: { nome: string; descricao: string }[];
  /** Da cultura da empresa (US-003). */
  comportamentos: string;
  naoCombina: string;
  faixa: { min?: number; max?: number; texto: string };
  candidato: { nome: string; primeiroNome: string };
  /** O currículo em texto, cortado. Vazio quando não há currículo guardado. */
  cv: string;
  /** A ficha que veio do currículo e do gestor. */
  fichaCv: ItemFichaRoteiro[];
  /** A ficha que veio da web — só com a identidade confirmada (D6). */
  fichaWeb: ItemFichaRoteiro[];
  divergencias: DivergenciaFicha[];
  falas: Troca[];
  /** Quantas perguntas a entrevistadora chegou a fazer: o teto do campo `pergunta`. */
  perguntasFeitas: number;
  /** A conversa acabou antes do combinado. Deduzido, nunca recebido. */
  parcial: boolean;
};

function primeiroNome(nome: string): string {
  return nome.trim().split(/\s+/)[0] || nome;
}

function linhas(texto?: string): string[] {
  return (texto ?? "")
    .split("\n")
    .map((l) => l.replace(/^[-•*\d.)\s]+/, "").trim())
    .filter(Boolean);
}

function corte(bruto: string, limite: number): string {
  const limpo = String(bruto ?? "").trim();
  return limpo.length > limite ? `${limpo.slice(0, limite)}…` : limpo;
}

/** Aprofundamentos não completam tópicos. Só a resposta à última pergunta do
 * plano encerra a v2; pareceres de roteiros antigos mantêm a contagem original. */
function entrevistaParcial(entrevistaId: string, numeroPerguntas: number, falas: Troca[]): boolean {
  const respostas = falas.filter(f => f.papel === "candidato").length;
  const bruto = lerRoteiro(entrevistaId);
  if (!bruto) return respostas < numeroPerguntas;
  try {
    const plano = JSON.parse(bruto) as Roteiro;
    if (!Array.isArray(plano.perguntas) || !plano.perguntas.length) return respostas < numeroPerguntas;
    if (plano.versaoConducao !== 2) return respostas < plano.perguntas.length;
    const ultimaResposta = falas.findLastIndex(f => f.papel === "candidato");
    const posicao = posicaoNoRoteiro(plano, falas.slice(0, ultimaResposta + 1), numeroPerguntas);
    return decidirPasso({ plano, posicao, resposta: posicao.ultimaResposta, numeroPerguntas }).tipo !== "encerrar";
  } catch (err) {
    console.error("Roteiro gravado ilegível ao medir a entrevista; vale o número combinado na vaga.", err);
    return respostas < numeroPerguntas;
  }
}

/**
 * O contexto de uma entrevista de verdade. Levanta erro quando falta o que não dá para inventar —
 * quem chama (`lib/conclusao.ts`) é que sabe se há alguém do outro lado esperando resposta.
 */
export function contextoDaAvaliacao(entrevistaId: string): ContextoAvaliacao & { vagaId: string; candidatoId: string } {
  const entrevista = obterEntrevista(entrevistaId);
  if (!entrevista) throw new Error(`Entrevista ${entrevistaId} não encontrada.`);

  const candidato = obterCandidato(entrevista.candidatoId);
  if (!candidato) throw new Error(`O candidato da entrevista ${entrevistaId} não existe mais.`);
  const vaga = obterVaga(entrevista.vagaId);
  if (!vaga) throw new Error(`A vaga da entrevista ${entrevistaId} não existe mais.`);

  const falas: Troca[] = transcricao(entrevistaId).map((m) => ({ papel: m.papel, texto: m.texto }));
  const respostas = falas.filter((f) => f.papel === "candidato").length;
  if (respostas < MINIMO_DE_RESPOSTAS) {
    throw new Error(`A entrevista ${entrevistaId} tem ${respostas} resposta(s): pouco para avaliar.`);
  }

  const daFicha = fichaParaEntrevista(candidato.ficha, candidato.identidadeConfirmada);
  const cultura = obterCultura();

  return {
    vagaId: vaga.id,
    candidatoId: candidato.id,
    cargo: vaga.cargo,
    area: vaga.area,
    senioridade: vaga.senioridade,
    requisitos: linhas(vaga.requisitos),
    desafios: linhas(vaga.desafios),
    competencias: vaga.competenciasCulturais.map((c) => ({ nome: c.nome, descricao: c.descricao })),
    comportamentos: cultura.comportamentos,
    naoCombina: cultura.naoCombina,
    faixa: { min: vaga.salarioMin, max: vaga.salarioMax, texto: faixaSalarial(vaga) },
    candidato: { nome: candidato.nome, primeiroNome: primeiroNome(candidato.nome) },
    cv: corte(obterCvTexto(candidato.id) ?? "", LIMITE_CV),
    fichaCv: daFicha.filter((i) => i.origem !== "web"),
    fichaWeb: daFicha.filter((i) => i.origem === "web"),
    divergencias: candidato.ficha?.divergencias ?? [],
    falas,
    perguntasFeitas: falas.filter((f) => f.papel === "entrevistadora").length,
    parcial: entrevistaParcial(entrevistaId, vaga.numeroPerguntas, falas),
  };
}

// ---------------------------------------------------------------------------------------------
// Os prompts
// ---------------------------------------------------------------------------------------------

/**
 * As regras que valem nos três passos.
 *
 * A lista do que **não** pode ser inferido é explícita de propósito: uma conversa por voz é cheia de
 * pistas sobre a vida de quem fala (um filho ao fundo, um sotaque, a menção a um feriado religioso),
 * e nada disso tem a ver com a vaga. Mandar ignorar é mais seguro do que confiar que não vai ocorrer.
 */
const REGRAS = `Regras que valem para todos os passos:
- Use SOMENTE o que foi dito na conversa e o que está no currículo e na ficha que você recebeu. Não complete lacuna com o que costuma ser verdade na profissão.
- NUNCA infira, comente ou leve em conta idade, gênero, origem, nacionalidade, cor, religião, orientação sexual, deficiência, aparência, estado civil, filhos ou situação familiar. Se algo assim aparecer na conversa, ignore por completo: não pode entrar em nenhum campo da resposta nem influenciar nota nenhuma.
- Escreva em português do Brasil, em frases curtas e diretas, sem jargão de RH.
- Quando não houver material para responder um campo, diga que não houve — nunca preencha por preencher.`;

const SYSTEM_EXTRACAO = `Você lê a transcrição de uma entrevista de triagem e registra os fatos que o candidato declarou sobre a vida profissional dele. Você NÃO avalia, não dá nota e não opina.

${REGRAS}

Formato de saída (JSON):
{
  "fatos": [{"fato": "", "tipo": "experiencia|numero|ferramenta|decisao|formacao|disponibilidade|outro", "pergunta": 0}],
  "pretensao": {"valor": null, "trecho": null},
  "disponibilidade": null
}
- "fato": uma frase curta, na terceira pessoa, com o que a pessoa afirmou ("cuida de uma carteira de 60 contas B2B").
- "pergunta": o número da pergunta da transcrição que originou o fato.
- "pretensao.valor": o valor mensal em reais, só quando um número foi dito; senão null. "trecho": as palavras usadas.
- Até 20 fatos, os mais concretos primeiro.`;

const SYSTEM_CRUZAMENTO = `Você confere o que o candidato disse numa entrevista contra o currículo dele e contra o perfil público já confirmado pela empresa, e aponta onde cada requisito e cada competência da vaga aparecem na conversa.

${REGRAS}

Formato de saída (JSON):
{
  "consistencia": [{"afirmacao": "", "fonte": "cv|web", "situacao": "confirmado|divergente|nao_verificavel", "detalhe": ""}],
  "requisitos": [{"requisito": "", "situacao": "atende|parcial|nao_atende|nao_abordado", "evidencia": "", "pergunta": 0}],
  "competencias": [{"competencia": "", "evidencia": "", "pergunta": 0, "comportamental": true}]
}
- "consistencia": até 8 itens, só sobre fatos que dá para comparar. "fonte" é onde você comparou: "cv" para o currículo, "web" para o perfil público. "confirmado" quando bate, "divergente" quando o material diz outra coisa (diga as duas versões em "detalhe"), "nao_verificavel" quando nem o currículo nem o perfil falam daquilo.
- "requisitos": uma linha para CADA requisito da lista, com o texto copiado exatamente como veio. "nao_abordado" quando a conversa não chegou ao assunto — não é o mesmo que não atender.
- "competencias": uma linha para CADA competência da lista. "evidencia" é um trecho curto do que o candidato respondeu. "comportamental" é false quando a única evidência é o candidato se descrevendo ("sou colaborativo") em vez de contar uma situação concreta; nesse caso deixe "evidencia" vazia.
- "pergunta": o número da pergunta da transcrição que sustenta a evidência; omita quando não houver uma.`;

const SYSTEM_PARECER = `Você é uma especialista em recrutamento e seleção que escreve o parecer de uma entrevista de triagem para o gestor da vaga decidir sem ler a transcrição inteira.

Você recebe a vaga, a cultura da empresa, os fatos declarados pelo candidato e o cruzamento deles com o currículo. Escreva o parecer em cima desse material.

${REGRAS}
- Seja honesta: conversa curta ou rasa é nota mais baixa e ponto de atenção, não elogio genérico.
- Nota cultural só com evidência de comportamento (uma situação concreta que a pessoa contou). Sem isso, "nota": null.
- "notaGeral" de 0 a 10, com uma casa decimal.
- "recomendacao" é exatamente "avançar", "avaliar com o gestor" ou "não avançar".

Formato de saída (JSON):
{
  "notaGeral": 0,
  "recomendacao": "avançar|avaliar com o gestor|não avançar",
  "resumo": "exatamente 3 frases: como foi, o que ficou aberto, o que bate ou não bate com o material",
  "tecnico": [{"criterio": "", "nota": 0, "evidencia": "", "pergunta": 0}],
  "cultura": [{"competencia": "", "nota": 0}],
  "pontosFortes": [""],
  "pontosAtencao": [""],
  "proximaEtapa": {"perguntas": [""], "foco": ""}
}
- "tecnico": de 3 a 6 critérios tirados dos principais requisitos da vaga, cada um com a evidência da conversa e o número da pergunta.
- "cultura": uma linha para CADA competência recebida, com o nome copiado e a nota (ou null).
- Até 4 pontos fortes, 4 pontos de atenção e 5 perguntas para a próxima etapa.
- "foco": uma frase com o que o gestor precisa confirmar antes de qualquer proposta.`;

/** A conversa com as perguntas numeradas — a mesma numeração que a tela do parecer usa nas âncoras
 * `#pergunta-N`, e a que o modelo devolve no campo `pergunta`. */
export function transcricaoNumerada(falas: Troca[]): string {
  if (!falas.length) return "(nenhuma troca)";
  let n = 0;
  const texto = falas
    .map((f) => (f.papel === "entrevistadora" ? `Pergunta ${++n}: ${corte(f.texto, LIMITE_FALA)}` : `Resposta: ${corte(f.texto, LIMITE_FALA)}`))
    .join("\n");
  return corte(texto, LIMITE_TRANSCRICAO);
}

function listaNumerada(itens: string[]): string {
  return itens.length ? itens.map((i, n) => `${n + 1}. ${i}`).join("\n") : "(nenhum)";
}

function fichaNoPrompt(itens: ItemFichaRoteiro[]): string {
  return itens.length ? itens.map((i) => `- ${i.rotulo}: ${i.valor}`).join("\n") : "(nada registrado)";
}

function blocoDaVaga(ctx: ContextoAvaliacao): string {
  return `Vaga: ${ctx.cargo}${ctx.area ? ` · ${ctx.area}` : ""}${ctx.senioridade ? ` · ${ctx.senioridade}` : ""}
Faixa salarial da vaga: ${ctx.faixa.texto}
Requisitos:
${listaNumerada(ctx.requisitos)}
Desafios dos primeiros meses:
${listaNumerada(ctx.desafios)}
Competências culturais avaliadas nesta vaga:
${ctx.competencias.length ? ctx.competencias.map((c) => `- ${c.nome}: ${c.descricao}`).join("\n") : "(nenhuma)"}`;
}

function avisoParcial(ctx: ContextoAvaliacao): string {
  // Uma entrevista encerrada no meio rendeu menos material, e o gestor precisa ler isso em vez de uma
  // nota baixa sem explicação.
  return ctx.parcial
    ? `Atenção: esta conversa foi encerrada antes do fim — o candidato respondeu menos perguntas do que o combinado. Diga isso na primeira frase do resumo e não penalize o candidato por assuntos que a entrevistadora nem chegou a perguntar.\n\n`
    : "";
}

// ---------------------------------------------------------------------------------------------
// Os três passos
// ---------------------------------------------------------------------------------------------

export type FatoDeclarado = { fato: string; tipo?: string; pergunta?: number };

export type Extracao = {
  fatos: FatoDeclarado[];
  pretensao: { valor?: number; trecho?: string };
  disponibilidade?: string;
};

export type RequisitoCruzado = { requisito: string; situacao: SituacaoRequisito; evidencia: string; pergunta?: number };
export type CompetenciaCruzada = { competencia: string; evidencia: string; pergunta?: number; comportamental: boolean };

export type Cruzamento = {
  consistencia: ItemConsistencia[];
  requisitos: RequisitoCruzado[];
  competencias: CompetenciaCruzada[];
};

export type Julgamento = {
  notaGeral?: number;
  recomendacao?: Recomendacao;
  resumo: string;
  tecnico: CriterioTecnico[];
  cultura: { competencia: string; nota: number | null }[];
  pontosFortes: string[];
  pontosAtencao: string[];
  proximaEtapa: { perguntas: string[]; foco: string };
};

/**
 * As costuras de teste: cada passo pode ser substituído sem tocar no resto da rodada.
 *
 * É o mesmo desenho de `OpcoesPesquisa` (lib/pesquisa.ts): sem elas, o único caminho exercitável
 * fora do Next seria o do modo demonstração — e é justamente o caminho com modelo de verdade que
 * decide o que o gestor lê sobre uma pessoa.
 */
export type OpcoesAvaliacao = {
  extrator?: (ctx: ContextoAvaliacao) => Promise<unknown>;
  cruzador?: (ctx: ContextoAvaliacao, extracao: Extracao) => Promise<unknown>;
  redator?: (ctx: ContextoAvaliacao, extracao: Extracao, cruzamento: Cruzamento) => Promise<unknown>;
};

function numeroEntre(valor: unknown, min: number, max: number): number | undefined {
  const n = typeof valor === "number" ? valor : Number(valor);
  if (!Number.isFinite(n)) return undefined;
  return Math.round(Math.min(max, Math.max(min, n)) * 10) / 10;
}

/** O número de pergunta só vale contra a conversa que existe: um índice inventado vira uma âncora
 * para lugar nenhum na tela do parecer. */
function perguntaValida(valor: unknown, perguntasFeitas: number): number | undefined {
  const n = typeof valor === "number" ? valor : Number(valor);
  if (!Number.isInteger(n) || n < 1 || n > perguntasFeitas) return undefined;
  return n;
}

function texto(valor: unknown, limite = 400): string {
  return typeof valor === "string" ? corte(valor, limite) : "";
}

function lista(valor: unknown, quantos: number, limite = 240): string[] {
  if (!Array.isArray(valor)) return [];
  return valor.map((v) => texto(v, limite)).filter(Boolean).slice(0, quantos);
}

/** Passo 1: os fatos declarados, com o número da pergunta de origem. */
export async function extrairFatos(ctx: ContextoAvaliacao, opcoes: OpcoesAvaliacao = {}): Promise<Extracao> {
  const prompt = `${blocoDaVaga(ctx)}

Candidato: ${ctx.candidato.nome}

Transcrição da entrevista (as perguntas estão numeradas):
${transcricaoNumerada(ctx.falas)}

Liste os fatos que o candidato declarou.`;

  const bruto = opcoes.extrator
    ? await opcoes.extrator(ctx)
    : await askJSON<unknown>({ system: SYSTEM_EXTRACAO, prompt, maxTokens: 1500, model: modelName("avaliacao") });

  const o = (bruto ?? {}) as { fatos?: unknown; pretensao?: unknown; disponibilidade?: unknown };
  const fatos = Array.isArray(o.fatos) ? o.fatos : [];
  const pretensaoBruta = (o.pretensao ?? {}) as { valor?: unknown; trecho?: unknown };
  const valor = numeroEntre(pretensaoBruta.valor, 0, 10_000_000);

  return {
    fatos: fatos
      .map((f) => {
        const item = (f ?? {}) as { fato?: unknown; tipo?: unknown; pergunta?: unknown };
        return { fato: texto(item.fato, 240), tipo: texto(item.tipo, 40) || undefined, pergunta: perguntaValida(item.pergunta, ctx.perguntasFeitas) };
      })
      .filter((f) => f.fato)
      .slice(0, 20),
    // Zero não é pretensão: é o modelo preenchendo o campo porque ele existe.
    pretensao: valor ? { valor, trecho: texto(pretensaoBruta.trecho, 200) || undefined } : {},
    disponibilidade: texto(o.disponibilidade, 200) || undefined,
  };
}

function situacaoRequisito(valor: unknown): SituacaoRequisito {
  const v = String(valor ?? "").trim().toLowerCase().replace(/[\s-]/g, "_");
  if (v === "atende" || v === "parcial" || v === "nao_atende" || v === "nao_abordado") return v;
  if (v === "não_atende") return "nao_atende";
  if (v === "não_abordado") return "nao_abordado";
  return "nao_abordado";
}

function situacaoConsistencia(valor: unknown): SituacaoConsistencia {
  const v = String(valor ?? "").trim().toLowerCase().replace(/[\s-]/g, "_");
  if (v === "confirmado" || v === "divergente" || v === "nao_verificavel") return v;
  if (v === "não_verificável" || v === "não_verificavel" || v === "nao_verificável") return "nao_verificavel";
  return "nao_verificavel";
}

/** Casa o que o modelo devolveu com a lista que a vaga tem, pelo texto normalizado; a posição é a
 * reserva. Sem isso, um requisito reescrito pelo modelo viraria uma linha que não é de ninguém.
 * Exportada porque a comparação de candidatos (lib/comparacao.ts) alinha os pareceres já salvos
 * contra o cadastro da vaga com a MESMA regra — duas normalizações diferentes sobre o mesmo texto
 * fariam a mesma linha casar num lugar e não casar no outro. */
export function chaveDoItem(nome: string): string {
  return nome
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Passo 2: o que bate com o material que a empresa já tinha, e onde cada exigência da vaga apareceu. */
export async function cruzar(ctx: ContextoAvaliacao, extracao: Extracao, opcoes: OpcoesAvaliacao = {}): Promise<Cruzamento> {
  const prompt = `${blocoDaVaga(ctx)}

Candidato: ${ctx.candidato.nome}

Fatos declarados na conversa:
${extracao.fatos.length ? extracao.fatos.map((f) => `- ${f.fato}${f.pergunta ? ` (pergunta ${f.pergunta})` : ""}`).join("\n") : "(nenhum)"}
${extracao.pretensao.valor ? `Pretensão dita na conversa: R$ ${extracao.pretensao.valor}` : ""}

Currículo do candidato:
${ctx.cv || "(nenhum currículo foi enviado)"}

Ficha montada a partir do currículo e do que o gestor preencheu:
${fichaNoPrompt(ctx.fichaCv)}

Perfil público confirmado pela empresa (use como fonte "web"; quando estiver vazio, nada é verificável por aí):
${fichaNoPrompt(ctx.fichaWeb)}
${ctx.divergencias.length ? `\nPontos em que currículo e perfil público já divergiam:\n${ctx.divergencias.map((d) => `- ${d.campo}: currículo diz "${d.cv}", outra fonte diz "${d.web}"`).join("\n")}` : ""}

Transcrição da entrevista (as perguntas estão numeradas):
${transcricaoNumerada(ctx.falas)}

Faça o cruzamento.`;

  const bruto = opcoes.cruzador
    ? await opcoes.cruzador(ctx, extracao)
    : await askJSON<unknown>({ system: SYSTEM_CRUZAMENTO, prompt, maxTokens: 1500, model: modelName("avaliacao") });

  const o = (bruto ?? {}) as { consistencia?: unknown; requisitos?: unknown; competencias?: unknown };

  const consistencia: ItemConsistencia[] = (Array.isArray(o.consistencia) ? o.consistencia : [])
    .map((c) => {
      const item = (c ?? {}) as { afirmacao?: unknown; fonte?: unknown; situacao?: unknown; detalhe?: unknown };
      // Sem perfil público confirmado, nada pode ser carimbado como conferido "na web" (D6).
      const fonte: ItemConsistencia["fonte"] = item.fonte === "web" && ctx.fichaWeb.length ? "web" : "cv";
      return { afirmacao: texto(item.afirmacao, 200), fonte, situacao: situacaoConsistencia(item.situacao), detalhe: texto(item.detalhe, 300) };
    })
    .filter((c) => c.afirmacao && c.detalhe)
    .slice(0, 8);

  const porRequisito = new Map<string, RequisitoCruzado>();
  for (const r of Array.isArray(o.requisitos) ? o.requisitos : []) {
    const item = (r ?? {}) as { requisito?: unknown; situacao?: unknown; evidencia?: unknown; pergunta?: unknown };
    const nome = texto(item.requisito, 200);
    if (!nome) continue;
    porRequisito.set(chaveDoItem(nome), {
      requisito: nome,
      situacao: situacaoRequisito(item.situacao),
      evidencia: texto(item.evidencia, 400),
      pergunta: perguntaValida(item.pergunta, ctx.perguntasFeitas),
    });
  }

  const porCompetencia = new Map<string, CompetenciaCruzada>();
  for (const c of Array.isArray(o.competencias) ? o.competencias : []) {
    const item = (c ?? {}) as { competencia?: unknown; evidencia?: unknown; pergunta?: unknown; comportamental?: unknown };
    const nome = texto(item.competencia, 120);
    if (!nome) continue;
    porCompetencia.set(chaveDoItem(nome), {
      competencia: nome,
      evidencia: texto(item.evidencia, 400),
      pergunta: perguntaValida(item.pergunta, ctx.perguntasFeitas),
      comportamental: item.comportamental !== false,
    });
  }

  // A lista é sempre a da VAGA, na ordem da vaga: o requisito que o modelo esqueceu de citar entra
  // como "não abordado", nunca some da tela. Um parecer com menos linhas do que a vaga tem exigências
  // é um parecer que o gestor lê achando que respondeu tudo.
  const requisitos: RequisitoCruzado[] = ctx.requisitos.map((requisito, i) => {
    const achado = porRequisito.get(chaveDoItem(requisito)) ?? [...porRequisito.values()][i];
    return achado
      ? { ...achado, requisito }
      : { requisito, situacao: "nao_abordado", evidencia: "A conversa não chegou a este ponto." };
  });

  const competencias: CompetenciaCruzada[] = ctx.competencias.map((competencia, i) => {
    const achado = porCompetencia.get(chaveDoItem(competencia.nome)) ?? [...porCompetencia.values()][i];
    return achado
      ? { ...achado, competencia: competencia.nome }
      : { competencia: competencia.nome, evidencia: "", pergunta: undefined, comportamental: false };
  });

  return { consistencia, requisitos, competencias };
}

/** Passo 3: as notas, o resumo e o que fazer depois — escritos em cima do que os dois primeiros passos apuraram. */
export async function redigirParecer(
  ctx: ContextoAvaliacao,
  extracao: Extracao,
  cruzamento: Cruzamento,
  opcoes: OpcoesAvaliacao = {},
): Promise<Julgamento> {
  const prompt = `${avisoParcial(ctx)}${blocoDaVaga(ctx)}

O que a empresa espera no dia a dia: ${ctx.comportamentos || "(não cadastrado)"}
O que não funciona por lá: ${ctx.naoCombina || "(não cadastrado)"}

Candidato: ${ctx.candidato.nome}

Fatos declarados na conversa:
${extracao.fatos.length ? extracao.fatos.map((f) => `- ${f.fato}${f.pergunta ? ` (pergunta ${f.pergunta})` : ""}`).join("\n") : "(nenhum)"}

Como cada requisito apareceu na conversa:
${cruzamento.requisitos.map((r) => `- ${r.requisito} → ${r.situacao}${r.evidencia ? `: ${r.evidencia}` : ""}`).join("\n") || "(nenhum)"}

Evidência de cada competência cultural:
${cruzamento.competencias.map((c) => `- ${c.competencia} → ${c.comportamental && c.evidencia ? c.evidencia : "sem situação concreta na conversa"}`).join("\n") || "(nenhuma)"}

O que bate e o que não bate com o currículo e com o perfil público:
${cruzamento.consistencia.map((c) => `- ${c.afirmacao} → ${c.situacao} (${c.fonte}): ${c.detalhe}`).join("\n") || "(nada comparável)"}

Transcrição da entrevista (as perguntas estão numeradas):
${transcricaoNumerada(ctx.falas)}

Escreva o parecer.`;

  const bruto = opcoes.redator
    ? await opcoes.redator(ctx, extracao, cruzamento)
    : await askJSON<unknown>({ system: SYSTEM_PARECER, prompt, maxTokens: 2500, model: modelName("avaliacao") });

  const o = (bruto ?? {}) as Record<string, unknown>;
  const proxima = (o.proximaEtapa ?? {}) as { perguntas?: unknown; foco?: unknown };

  return {
    notaGeral: numeroEntre(o.notaGeral, 0, 10),
    recomendacao: recomendacaoValida(o.recomendacao),
    resumo: texto(o.resumo, 900),
    tecnico: (Array.isArray(o.tecnico) ? o.tecnico : [])
      .map((c) => {
        const item = (c ?? {}) as { criterio?: unknown; nota?: unknown; evidencia?: unknown; pergunta?: unknown };
        return {
          criterio: texto(item.criterio, 120),
          nota: numeroEntre(item.nota, 0, 10) ?? 0,
          evidencia: texto(item.evidencia, 400),
          pergunta: perguntaValida(item.pergunta, ctx.perguntasFeitas),
        };
      })
      .filter((c) => c.criterio)
      .slice(0, 6),
    cultura: (Array.isArray(o.cultura) ? o.cultura : [])
      .map((c) => {
        const item = (c ?? {}) as { competencia?: unknown; nota?: unknown };
        return { competencia: texto(item.competencia, 120), nota: numeroEntre(item.nota, 0, 10) ?? null };
      })
      .filter((c) => c.competencia),
    pontosFortes: lista(o.pontosFortes, 4),
    pontosAtencao: lista(o.pontosAtencao, 4),
    proximaEtapa: { perguntas: lista(proxima.perguntas, 5, 300), foco: texto(proxima.foco, 300) },
  };
}

function recomendacaoValida(valor: unknown): Recomendacao | undefined {
  const v = String(valor ?? "").trim().toLowerCase();
  if (v.startsWith("avanç") || v.startsWith("avanc")) return "avançar";
  if (v.startsWith("não") || v.startsWith("nao")) return "não avançar";
  if (v.includes("gestor")) return "avaliar com o gestor";
  return undefined;
}

// ---------------------------------------------------------------------------------------------
// O parecer: o que o código garante em cima do que o modelo escreveu
// ---------------------------------------------------------------------------------------------

function recomendacaoPorNota(nota: number): Recomendacao {
  if (nota >= 8) return "avançar";
  if (nota >= 6.5) return "avaliar com o gestor";
  return "não avançar";
}

/**
 * A pretensão cabe na faixa da vaga? É uma conta, e por isso não é do modelo.
 *
 * `undefined` quando não há faixa cadastrada (vaga "a combinar") ou quando nenhum valor foi dito: a
 * tela só fala de dinheiro quando tem os dois lados da comparação.
 */
export function dentroDaFaixa(valor: number | undefined, faixa: { min?: number; max?: number }): boolean | undefined {
  if (!valor || (faixa.min === undefined && faixa.max === undefined)) return undefined;
  if (faixa.min !== undefined && valor < faixa.min) return false;
  if (faixa.max !== undefined && valor > faixa.max) return false;
  return true;
}

/**
 * As garantias que não dependem do modelo ter entendido o pedido.
 *
 * A principal: **nunca "avançar" com um requisito da vaga em `nao_atende`.** A PRD fala de requisito
 * prioritário e a vaga não tem prioridade cadastrada — então vale para todos, o que é mais rígido e
 * nunca erra para o lado caro. O rebaixamento é para "avaliar com o gestor", não para "não avançar":
 * quem decide reprovar por causa de um requisito é o gestor da área, com o parecer na mão.
 */
export function aplicarGuardas(recomendacao: Recomendacao, aderencia: AderenciaRequisito[]): Recomendacao {
  if (recomendacao !== "avançar") return recomendacao;
  return aderencia.some((a) => a.situacao === "nao_atende") ? "avaliar com o gestor" : "avançar";
}

/** Junta os três passos num `Parecer` — e é aqui que o código tem a última palavra sobre o modelo. */
export function montarParecer(ctx: ContextoAvaliacao, extracao: Extracao, cruzamento: Cruzamento, julgamento: Julgamento): Parecer {
  const aderencia: AderenciaRequisito[] = cruzamento.requisitos.map((r) => ({
    requisito: r.requisito,
    situacao: r.situacao,
    evidencia: r.evidencia || (r.situacao === "nao_abordado" ? "A conversa não chegou a este ponto." : "Sem trecho da conversa que sustente este requisito."),
    pergunta: r.pergunta,
  }));

  const tecnico: CriterioTecnico[] = julgamento.tecnico;
  const mediaTecnica = tecnico.length ? tecnico.reduce((s, c) => s + c.nota, 0) / tecnico.length : undefined;
  const notaGeral = julgamento.notaGeral ?? (mediaTecnica !== undefined ? Math.round(mediaTecnica * 10) / 10 : 0);

  // Nota cultural só com evidência comportamental: a decisão é do cruzamento (quem viu a conversa),
  // não da nota que o modelo escreveu depois.
  const notaPorCompetencia = new Map(julgamento.cultura.map((c) => [chaveDoItem(c.competencia), c.nota]));
  const cultura: CriterioCultural[] = cruzamento.competencias.map((c) => {
    const temEvidencia = c.comportamental && Boolean(c.evidencia);
    if (!temEvidencia) return { competencia: c.competencia, nota: null, evidencia: SEM_EVIDENCIA_CULTURAL };
    return { competencia: c.competencia, nota: notaPorCompetencia.get(chaveDoItem(c.competencia)) ?? null, evidencia: c.evidencia, pergunta: c.pergunta };
  });

  const recomendacao = aplicarGuardas(julgamento.recomendacao ?? recomendacaoPorNota(notaGeral), aderencia);

  return {
    notaGeral,
    recomendacao,
    resumo: julgamento.resumo,
    aderencia,
    tecnico,
    cultura,
    consistencia: cruzamento.consistencia,
    pontosFortes: julgamento.pontosFortes,
    pontosAtencao: julgamento.pontosAtencao,
    proximaEtapa: julgamento.proximaEtapa,
    pretensao: extracao.pretensao.valor
      ? { valor: extracao.pretensao.valor, dentroDaFaixa: dentroDaFaixa(extracao.pretensao.valor, ctx.faixa) }
      : {},
    parcial: ctx.parcial,
  };
}

// ---------------------------------------------------------------------------------------------
// O modo demonstração
// ---------------------------------------------------------------------------------------------

/** Uma nota plausível a partir do tamanho das respostas: quem falou pouco não sai com 9. Determinística
 * de propósito — reavaliar a mesma conversa de exemplo não pode dar outro número. */
function notaDaConversa(falas: Troca[]): number {
  const respostas = falas.filter((f) => f.papel === "candidato");
  if (!respostas.length) return 6;
  const palavras = respostas.reduce((total, r) => total + r.texto.trim().split(/\s+/).length, 0) / respostas.length;
  return Math.round((6 + Math.min(3, Math.max(0, ((palavras - 10) / 50) * 3))) * 10) / 10;
}

/**
 * O "o que bate e o que não bate" do exemplo, tirado da ficha que o candidato já tem.
 *
 * As divergências são reais (vieram da US-012); o resto é o formato preenchido com o que está na
 * ficha, para a seção existir na demonstração. Tudo isso viaja com `meta.demo = true`.
 */
function consistenciaDeExemplo(ctx: ContextoAvaliacao): ItemConsistencia[] {
  const itens: ItemConsistencia[] = ctx.divergencias.slice(0, 2).map((d) => ({
    afirmacao: corte(`${d.campo}: ${d.cv}`, 200),
    fonte: "web",
    situacao: "divergente",
    detalhe: corte(`o currículo diz "${d.cv}" e o material público registra "${d.web}".`, 300),
  }));
  for (const item of ctx.fichaCv.slice(0, 2)) {
    itens.push({
      afirmacao: corte(`${item.rotulo}: ${item.valor}`, 200),
      fonte: "cv",
      situacao: "confirmado",
      detalhe: "o que foi dito na conversa segue o que está no currículo.",
    });
  }
  return itens;
}

/** O parecer do modo demonstração, derivado desta conversa e desta ficha. */
export function parecerDeExemplo(ctx: ContextoAvaliacao): Parecer {
  const competencias = ctx.competencias.map((c) => c.nome);
  return parecerDemo({
    cargo: ctx.cargo,
    candidato: ctx.candidato.nome,
    requisitos: ctx.requisitos.join("\n"),
    competencias,
    transcricao: ctx.falas,
    notaGeral: notaDaConversa(ctx.falas),
    // Uma conversa encerrada no meio não chegou à última competência — é o que o "não abordado"
    // conta ao gestor, e no exemplo ele precisa aparecer pelo mesmo motivo.
    semEvidenciaCultural: ctx.parcial ? competencias.slice(-1) : [],
    consistencia: consistenciaDeExemplo(ctx),
    parcial: ctx.parcial,
  });
}

// ---------------------------------------------------------------------------------------------
// A rodada inteira
// ---------------------------------------------------------------------------------------------

/**
 * Prepara o parecer de uma entrevista e o liga a ela.
 *
 * **Lê a conversa do servidor.** A transcrição está em `mensagens_entrevista` desde a US-016: o que o
 * navegador do candidato lembrava não entra aqui, e por isso uma entrevista que caiu no meio, foi
 * retomada noutra aba ou aconteceu dentro do agente da ElevenLabs é avaliada do mesmo jeito.
 *
 * **`parcial` é deduzido, nunca recebido.** Quem encerrou a conversa antes do fim respondeu menos do
 * que o combinado, e isso está na transcrição: perguntar ao navegador criaria um segundo estado, que
 * "Preparar o parecer de novo" (dias depois, sem navegador nenhum do outro lado) não teria como
 * repetir.
 *
 * Levanta erro quando não dá para avaliar — quem chama (`lib/conclusao.ts`) é que sabe se há alguém
 * do outro lado esperando uma resposta.
 */
export async function avaliarEntrevista(entrevistaId: string, opcoes: OpcoesAvaliacao = {}): Promise<{ resultadoId: string; parecer: Parecer }> {
  const ctx = contextoDaAvaliacao(entrevistaId);
  const semModelo = !opcoes.extrator && !opcoes.cruzador && !opcoes.redator && !aiEnabled();

  let parecer: Parecer;
  if (semModelo) {
    await esperar(1200);
    parecer = parecerDeExemplo(ctx);
  } else {
    const extracao = await extrairFatos(ctx, opcoes);
    const cruzamento = await cruzar(ctx, extracao, opcoes);
    const julgamento = await redigirParecer(ctx, extracao, cruzamento, opcoes);
    parecer = montarParecer(ctx, extracao, cruzamento, julgamento);
  }

  const resultadoId = salvar({
    tipo: "parecer",
    titulo: `${ctx.candidato.nome} · ${ctx.cargo}`,
    resumo: parecer.resumo,
    entrada: { entrevistaId, vagaId: ctx.vagaId, candidatoId: ctx.candidatoId },
    saida: parecer,
    meta: meta({ demo: semModelo, insumo: INSUMO, model: modelName("avaliacao") }),
  });
  registrarResultado(entrevistaId, resultadoId);
  return { resultadoId, parecer };
}
