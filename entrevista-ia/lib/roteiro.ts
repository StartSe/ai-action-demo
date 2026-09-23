import { temDuvidaSobreVaga, responderDuvidaDaVaga } from "./duvidas-vaga";
import { pedeContinuar, pedeRepeticao } from "./pedidos-candidato";
import { conferirTentativa } from "./tentativa";
import { comTurnoExclusivo } from "./trava-entrevista";
// O roteiro da entrevista (US-016): o que a entrevistadora sabe antes de abrir a boca, o plano que
// ela segue e a fala de cada turno.
//
// Três responsabilidades, e as três são de produto antes de serem de código:
//
//  1. **Saber o que pode saber.** `montarContexto()` junta vaga, cultura e ficha do candidato — mas
//     só a parte da ficha que veio do currículo, do gestor e (quando a identidade foi confirmada,
//     D6) da web. O que a pesquisa trouxe sobre um possível homônimo NÃO entra: uma pergunta feita
//     a partir do perfil de outra pessoa não dá erro em lugar nenhum, só constrange quem responde.
//  2. **Planejar uma vez.** `planejarRoteiro()` é UMA chamada de modelo, na criação do convite,
//     guardada em `entrevistas.roteiro`. Planejar a cada turno faria a conversa esquecer o que já
//     tinha decidido perguntar e estourar o número de perguntas combinado com o gestor.
//  3. **Conduzir sem escorregar.** `proximaFala()` segue o plano, aprofunda quando a resposta foi
//     vaga, responde uma dúvida do candidato **só com o que está na vaga** e nunca menciona nota,
//     avaliação nem perfil público. "Você comentou no currículo que..." é permitido; "Vi no seu
//     LinkedIn que..." está proibido.
//
// **A conversa mora no servidor.** Cada fala vai para `mensagens_entrevista` e o navegador manda só
// a última resposta: recarregar a página no meio da entrevista não perde nada, e é essa transcrição
// que sustenta o parecer (US-022).
//
// Substitui o `proximaPergunta`/`SYSTEM_PERGUNTA` que morava em `lib/entrevista.ts`, onde a
// entrevistadora só conhecia o título e os requisitos digitados num formulário.
import { aiEnabled, askJSON, ErroIA } from "./ai";
import { obter as obterCandidato } from "./candidatos";
import { obterCultura } from "./cultura";
import { esperar, followUpDemo, roteiroDemo } from "./demo";
import {
  lerMemoria,
  lerRoteiro,
  mudarStatus,
  obter as obterEntrevista,
  registrarMensagem,
  salvarMemoria,
  salvarRoteiro,
  transcricao,
  type NivelVoz,
} from "./entrevistas";
import { ROTULOS_FICHA, CAMPOS_LISTA, CAMPOS_SIMPLES } from "./ficha";
import { faixaSalarial } from "./formato";
import { obter as obterVaga, type Vaga } from "./vagas";
import type {
  BlocoRoteiro,
  ContextoRoteiro,
  Ficha,
  ItemFichaRoteiro,
  OrigemCampo,
  PerguntaRoteiro,
  Roteiro,
  Troca,
  Vaga as VagaDaSala,
} from "./types";

// ---------------------------------------------------------------------------------------------
// Limites
// ---------------------------------------------------------------------------------------------

/** Uma resposta com até tantas palavras não sustenta nada: é dela que nasce o follow-up. */
export const PALAVRAS_RESPOSTA_VAGA = 40;

/** Quanto da ficha e da conversa vai no prompt de cada turno. A entrevista inteira cabe folgado; o
 * corte existe para uma transcrição estranhamente longa não virar um pedido gigante. */
const MAX_FALAS_NO_PROMPT = 24;
const LIMITE_FALA = 600;

/**
 * Quanto de CADA fala entra no prompt do turno. A última resposta vai quase inteira — é a ela que a
 * transição se refere, e cortá-la é a forma mais rápida de a entrevistadora "não entender" quem falou
 * por dois minutos. As anteriores entram resumidas pelo corte: o que importa delas já foi respondido,
 * e um prompt que cresce com cada resposta longa é o que estoura os 8 segundos do turno.
 */
const LIMITE_FALA_ANTERIOR_NO_PROMPT = 500;
const LIMITE_ULTIMA_RESPOSTA_NO_PROMPT = 2400;

/** O que a entrevistadora diz quando a pessoa pede um momento ou avisa que não terminou. */
export const FALA_CONTINUAR = "Claro, sem pressa. Pode continuar.";

const ROTULO_BLOCO: Record<BlocoRoteiro, string> = {
  abertura: "abertura",
  curriculo: "currículo e pontos a esclarecer",
  requisitos: "requisitos",
  desafios: "desafios da vaga",
  cultura: "cultura",
  pretensao: "pretensão e disponibilidade",
  encerramento: "encerramento",
};

const BLOCOS: BlocoRoteiro[] = ["abertura", "curriculo", "requisitos", "desafios", "cultura", "pretensao", "encerramento"];

// ---------------------------------------------------------------------------------------------
// O contexto: o que a entrevistadora pode saber
// ---------------------------------------------------------------------------------------------

function linhas(texto?: string): string[] {
  return String(texto || "")
    .split(/\n|;/)
    .map((s) => s.replace(/^[-•*]\s*/, "").trim())
    .filter(Boolean);
}

/**
 * Os desafios da vaga, um por item.
 *
 * O formulário aceita um parágrafo corrido ("Assumir a carteira... Reduzir o cancelamento...
 * Deixar registrado no CRM...") e é assim que a maioria dos gestores escreve. Sem quebrar por frase,
 * a pergunta situacional do roteiro receberia os três desafios de uma vez — e "como você atacaria
 * isso?" sobre três parágrafos não é uma pergunta, é um teste de memória. Requisito continua sendo
 * um por linha: ali quem separa é quem escreveu.
 */
function desafiosDaVaga(texto?: string): string[] {
  const porLinha = linhas(texto);
  if (porLinha.length > 1) return porLinha;
  return (porLinha[0] ?? "")
    .split(/(?<=[.!?])\s+/)
    .map((frase) => frase.replace(/\s*[.!?]+\s*$/, "").trim())
    .filter(Boolean);
}

function primeiroNome(nome: string): string {
  return nome.trim().split(/\s+/)[0] || "";
}

function textoDoItem(valor: unknown): string {
  if (valor === null || valor === undefined) return "";
  if (typeof valor === "object") {
    const o = valor as Record<string, unknown>;
    const cabeca = [o.cargo, o.curso].filter(Boolean).join(" ");
    const onde = [o.empresa, o.instituicao].filter(Boolean).join(" ");
    const periodo = [o.inicio, o.fim].filter(Boolean).join("–");
    return [cabeca, onde && `em ${onde}`, periodo && `(${periodo})`].filter(Boolean).join(" ");
  }
  return String(valor).trim();
}

/**
 * A ficha como a entrevistadora a recebe — a D6 em uma linha de código.
 *
 * `cv` e `gestor` sempre; `web` **só** quando o gestor confirmou que a pessoa encontrada é o
 * candidato. `links` fica de fora inteiro, mesmo confirmado: é a lista de endereços de perfil, e
 * nada de bom vem de a entrevistadora ter um LinkedIn à mão enquanto fala com alguém.
 */
export function fichaParaEntrevista(ficha: Ficha | undefined, identidadeConfirmada: boolean): ItemFichaRoteiro[] {
  if (!ficha) return [];
  const permitidas = new Set<OrigemCampo>(identidadeConfirmada ? ["cv", "gestor", "web"] : ["cv", "gestor"]);
  const itens: ItemFichaRoteiro[] = [];

  for (const chave of CAMPOS_SIMPLES) {
    const campo = ficha[chave];
    if (!campo || !permitidas.has(campo.origem)) continue;
    const valor = textoDoItem(campo.valor);
    if (valor) itens.push({ rotulo: ROTULOS_FICHA[chave], valor, origem: campo.origem });
  }

  for (const chave of CAMPOS_LISTA) {
    if (chave === "links") continue;
    const lista = ficha[chave];
    if (!Array.isArray(lista)) continue;
    const permitidos = lista.filter((c) => permitidas.has(c.origem));
    const valores = permitidos.map((c) => textoDoItem(c.valor)).filter(Boolean);
    if (valores.length) itens.push({ rotulo: ROTULOS_FICHA[chave], valor: valores.join(" · "), origem: permitidos[0].origem });
  }

  return itens;
}

/**
 * As divergências da ficha (US-012) viradas em pontos a esclarecer.
 *
 * A frase diz o que o currículo afirma e que há outra versão — **sem dizer de onde a outra versão
 * veio**. O candidato não precisa saber que foi pesquisado para confirmar em que ano saiu de uma
 * empresa, e a conversa é o lugar certo para desempatar sem constrangimento.
 */
export function pontosAEsclarecer(ficha?: Ficha): string[] {
  return (ficha?.divergencias ?? [])
    .filter((d) => d.cv && d.web)
    .map((d) => `${d.campo}: o currículo diz "${d.cv}", mas há informação diferente ("${d.web}")`);
}

/** O contexto a partir da vaga cadastrada e (quando houver) do candidato convidado. */
export function contextoDaVaga(
  vaga: Vaga,
  candidato?: { nome: string; ficha?: Ficha; identidadeConfirmada: boolean },
): ContextoRoteiro {
  const cultura = obterCultura();
  return {
    cargo: vaga.cargo,
    area: vaga.area,
    senioridade: vaga.senioridade,
    modelo: vaga.modelo,
    local: vaga.local,
    // Perguntar a pretensão é opcional; responder sobre a faixa cadastrada continua possível.
    faixaSalarial: faixaSalarial(vaga),
    desafios: desafiosDaVaga(vaga.desafios),
    requisitos: linhas(vaga.requisitos),
    competencias: vaga.competenciasCulturais.map((c) => ({ nome: c.nome, descricao: c.descricao })),
    comportamentos: cultura.comportamentos,
    naoCombina: cultura.naoCombina,
    tom: vaga.tom,
    numeroPerguntas: vaga.numeroPerguntas,
    duracaoMin: Math.min(20, Math.max(10, vaga.duracaoMin)),
    perguntaPretensao: vaga.perguntaPretensao,
    candidato: {
      nome: candidato?.nome ?? "",
      primeiroNome: primeiroNome(candidato?.nome ?? ""),
      ficha: fichaParaEntrevista(candidato?.ficha, Boolean(candidato?.identidadeConfirmada)),
      aEsclarecer: pontosAEsclarecer(candidato?.ficha),
    },
  };
}

/**
 * O contexto de uma entrevista de verdade. `null` quando a entrevista, a vaga ou o candidato já não
 * existem — quem chamou decide o que dizer a quem está do outro lado.
 */
export function montarContexto(entrevistaId: string): ContextoRoteiro | null {
  const entrevista = obterEntrevista(entrevistaId);
  if (!entrevista) return null;
  const vaga = obterVaga(entrevista.vagaId);
  const candidato = obterCandidato(entrevista.candidatoId);
  if (!vaga || !candidato) return null;
  return contextoDaVaga(vaga, { nome: candidato.nome, ficha: candidato.ficha, identidadeConfirmada: candidato.identidadeConfirmada });
}

/**
 * O contexto dos links antigos (tipo `scorecard`, ver lib/convite.ts), que não têm vaga no banco:
 * só o título e os requisitos digitados no formulário da fundação. Sem cultura, sem desafios e sem
 * candidato — o roteiro sai mais pobre, mas o link continua abrindo até vencer.
 */
export function contextoDaVagaAntiga(vaga: VagaDaSala): ContextoRoteiro {
  return {
    cargo: vaga.titulo,
    desafios: [],
    requisitos: linhas(vaga.requisitos),
    competencias: [],
    comportamentos: "",
    naoCombina: "",
    tom: vaga.tom === "objetivo" ? "objetivo" : "acolhedor",
    numeroPerguntas: Math.min(12, Math.max(4, Number(vaga.numero_perguntas) || 5)),
    duracaoMin: 15,
    perguntaPretensao: false,
    candidato: { nome: vaga.candidato, primeiroNome: primeiroNome(vaga.candidato), ficha: [], aEsclarecer: [] },
  };
}

// ---------------------------------------------------------------------------------------------
// O plano
// ---------------------------------------------------------------------------------------------

const SYSTEM_ROTEIRO = `Você planeja o roteiro de uma entrevista de triagem conduzida por uma IA, em português do Brasil, para uma empresa brasileira.

Você recebe a vaga, a cultura da empresa e a ficha do candidato, e devolve as perguntas na ordem em que serão feitas.

Os blocos, nesta ordem:
1. "abertura" — 1 pergunta sobre a trajetória e o interesse na vaga.
2. "curriculo" — 1 a 2 perguntas sobre o que a ficha deixou em aberto ou sobre os pontos a esclarecer.
3. "requisitos" — 2 a 4 perguntas, uma por requisito mais importante.
4. "desafios" — 1 a 2 perguntas situacionais sobre os desafios dos primeiros meses ("como você atacaria...").
5. "cultura" — 1 a 2 perguntas situacionais por competência cultural escolhida, pedindo uma situação real de trabalho.
6. "pretensao" — 1 pergunta sobre pretensão salarial e disponibilidade. Só quando a vaga pedir.
7. "encerramento" — 1 pergunta abrindo espaço para as perguntas do candidato.

Regras:
- O total de perguntas tem de ser EXATAMENTE o número pedido. Corte primeiro de "cultura" e "desafios"; "abertura" e "encerramento" têm sempre uma cada.
- Planeje uma conversa de 10 a 20 minutos, com cerca de 1 a 2 minutos para cada resposta. Prefira perguntas abertas sobre situações reais, ações e resultados; evite perguntas de sim ou não.
- Uma pergunta principal por vez, curta (no máximo 2 frases), para ser ouvida e não lida. Os aprofundamentos acontecem depois e NÃO substituem perguntas do roteiro.
- As perguntas de cultura NUNCA citam o nome do valor ou da competência: "Fale sobre colaboração" está proibido. Peça uma situação real de trabalho e deixe o comportamento aparecer.
- Nunca mencione que o candidato foi pesquisado na internet nem cite um perfil público ("Vi no seu LinkedIn que..." está proibido). Falar do que está no currículo é permitido ("Você comentou no currículo que...").
- Nunca mencione nota, avaliação, parecer ou que a conversa será analisada.
- Não invente benefício, salário, horário, etapa do processo nem nada que não esteja na vaga.
- "foco" é o requisito, o desafio ou a competência que originou a pergunta, copiado do texto recebido. Use "" na abertura e no encerramento.
- "despedida" é o agradecimento final, no máximo 2 frases, dizendo que o gestor da vaga entra em contato. Sem resultado, sem nota, sem promessa de prazo.

Formato de saída (JSON):
{"perguntas":[{"bloco":"abertura|curriculo|requisitos|desafios|cultura|pretensao|encerramento","pergunta":"","foco":""}],"despedida":""}`;

function blocoFichaNoPrompt(ctx: ContextoRoteiro): string {
  if (!ctx.candidato.ficha.length) return "(nenhuma ficha: pergunte como se não soubesse nada além do nome)";
  return ctx.candidato.ficha.map((i) => `- ${i.rotulo}: ${i.valor}`).join("\n");
}

function construirPromptRoteiro(ctx: ContextoRoteiro): string {
  // `null` é "esta linha não existe para esta vaga"; a string vazia é uma linha em branco de
  // propósito, separando os blocos do pedido.
  const partes: (string | null)[] = [
    `Cargo: ${ctx.cargo}`,
    ctx.area ? `Área: ${ctx.area}` : null,
    ctx.senioridade ? `Senioridade: ${ctx.senioridade}` : null,
    ctx.modelo ? `Modelo de trabalho: ${ctx.modelo}` : null,
    ctx.local ? `Local: ${ctx.local}` : null,
    ctx.faixaSalarial ? `Faixa salarial: ${ctx.faixaSalarial}` : null,
    "",
    "Requisitos (um por linha, na ordem de importância):",
    ctx.requisitos.length ? ctx.requisitos.map((r) => `- ${r}`).join("\n") : "(nenhum informado)",
    "",
    "Desafios dos primeiros meses:",
    ctx.desafios.length ? ctx.desafios.map((d) => `- ${d}`).join("\n") : "(nenhum informado)",
    "",
    "Competências culturais a observar nesta vaga (NÃO cite estes nomes ao candidato):",
    ctx.competencias.length ? ctx.competencias.map((c) => `- ${c.nome}${c.descricao ? `: ${c.descricao}` : ""}`).join("\n") : "(nenhuma)",
    "",
    ctx.comportamentos ? `O que a empresa espera no dia a dia: ${ctx.comportamentos}` : null,
    ctx.naoCombina ? `O que não funciona por lá: ${ctx.naoCombina}` : null,
    "",
    `Candidato: ${ctx.candidato.nome || "(prévia do gestor: não há candidato, escreva as perguntas sem nome próprio)"}`,
    "Ficha do candidato:",
    blocoFichaNoPrompt(ctx),
    "",
    "Pontos a esclarecer na conversa (confirme sem dizer de onde veio a outra versão):",
    ctx.candidato.aEsclarecer.length ? ctx.candidato.aEsclarecer.map((p) => `- ${p}`).join("\n") : "(nenhum)",
    "",
    `Tom da entrevista: ${ctx.tom}`,
    `Duração prevista: ${ctx.duracaoMin} minutos`,
    `Total de perguntas: EXATAMENTE ${ctx.numeroPerguntas}`,
    ctx.perguntaPretensao
      ? 'Esta vaga PERGUNTA pretensão salarial e disponibilidade: inclua o bloco "pretensao".'
      : 'Esta vaga NÃO pergunta pretensão salarial: não inclua o bloco "pretensao" e não fale de dinheiro.',
    "",
    "Monte o roteiro.",
  ];
  return partes.filter((linha): linha is string => linha !== null).join("\n");
}

function corte(texto: unknown, limite = LIMITE_FALA): string {
  if (typeof texto !== "string") return "";
  const limpo = texto.replace(/\s+/g, " ").trim();
  return limpo.length > limite ? `${limpo.slice(0, limite - 1).trimEnd()}…` : limpo;
}

/**
 * Normaliza o que o modelo devolveu. Como em toda entrada de IA deste app, aqui se CORTA em silêncio
 * — quem escreveu demais foi o modelo, não uma pessoa.
 *
 * Duas garantias que o prompt sozinho não dá: o roteiro **nunca** passa do número de perguntas
 * combinado com o gestor, e ele **sempre** termina no encerramento (é a pergunta que abre espaço
 * para o candidato; cortá-la para caber uma pergunta a mais seria trocar a única parte da conversa
 * que é dele por mais uma nossa).
 */
export function normalizarRoteiro(bruto: unknown, ctx: ContextoRoteiro, demo = false): Roteiro {
  const dados = (bruto ?? {}) as Record<string, unknown>;
  const lista = Array.isArray(dados.perguntas) ? dados.perguntas : [];

  const perguntas: PerguntaRoteiro[] = [];
  for (const item of lista) {
    const d = (item ?? {}) as Record<string, unknown>;
    const texto = corte(d.pergunta);
    if (!texto) continue;
    const bloco = BLOCOS.includes(d.bloco as BlocoRoteiro) ? (d.bloco as BlocoRoteiro) : "requisitos";
    if (bloco === "pretensao" && !ctx.perguntaPretensao) continue;
    const foco = corte(d.foco, 200);
    perguntas.push(foco ? { bloco, pergunta: texto, foco } : { bloco, pergunta: texto });
  }

  const encerramento = perguntas.filter((p) => p.bloco === "encerramento");
  const corpo = perguntas.filter((p) => p.bloco !== "encerramento");
  const fim = encerramento[0] ?? { bloco: "encerramento" as const, pergunta: "Antes de terminarmos, você tem alguma pergunta sobre a vaga ou sobre o processo?" };
  const final = [...corpo.slice(0, Math.max(0, ctx.numeroPerguntas - 1)), fim];

  return {
    versaoConducao: 2,
    perguntas: final,
    despedida:
      corte(dados.despedida) ||
      `${ctx.candidato.primeiroNome ? `Muito obrigada, ${ctx.candidato.primeiroNome}!` : "Muito obrigada pelo seu tempo!"} Vou repassar essa conversa para o gestor da vaga, que entra em contato com os próximos passos.`,
    demo,
    em: new Date().toISOString(),
  };
}

/** O plano da conversa. Uma chamada de modelo, feita antes de liberar o convite e guardada. */
export async function planejarRoteiro(ctx: ContextoRoteiro, limiteMs = 25000): Promise<Roteiro> {
  if (!aiEnabled()) {
    await esperar(600);
    return { ...roteiroDemo(ctx), versaoConducao: 2 };
  }
  const inicio = Date.now();
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    const bruto = await askJSON<unknown>({
      system: SYSTEM_ROTEIRO,
      prompt: construirPromptRoteiro(ctx) + (tentativa ? "\nA tentativa anterior veio incompleta. Inclua todas as perguntas solicitadas, abertura e encerramento." : ""),
      maxTokens: 4000,
      limiteMs: Math.max(1, limiteMs - (Date.now() - inicio)),
    });
    const plano = normalizarRoteiro(bruto, ctx);
    if (plano.perguntas.length === ctx.numeroPerguntas && plano.perguntas[0].bloco === "abertura") return plano;
  }
  throw new ErroIA("resposta_invalida", "A IA não preparou todas as perguntas da entrevista. Tente preparar o convite novamente.", 502);
}

/** Uma ficha gravada num formato antigo (ou escrita por outra versão) nunca derruba a sala. */
export function lerRoteiroGravado(entrevistaId: string): Roteiro | null {
  const cru = lerRoteiro(entrevistaId);
  if (!cru) return null;
  try {
    const dados = JSON.parse(cru) as Roteiro;
    return Array.isArray(dados?.perguntas) && dados.perguntas.length ? dados : null;
  } catch (err) {
    console.error("Roteiro ilegível no banco; um novo será planejado.", err);
    return null;
  }
}

/**
 * O roteiro desta entrevista: o que já está guardado, ou um recém-planejado e gravado.
 *
 * É aqui que a única chamada de planejamento acontece — o convite prepara o plano; links legados ainda podem preparar na abertura. Todo turno
 * seguinte cai no caminho do `lerRoteiroGravado`.
 */
const planejamentos = new Map<string, Promise<Roteiro>>();
export async function roteiroDaEntrevista(entrevistaId: string, ctx: ContextoRoteiro, limiteMs = 25000): Promise<Roteiro> {
  const guardado = lerRoteiroGravado(entrevistaId);
  if (guardado) return guardado;
  const emCurso = planejamentos.get(entrevistaId);
  if (emCurso) return emCurso;
  const pedido = planejarRoteiro(ctx, limiteMs).then((plano) => {
    salvarRoteiro(entrevistaId, JSON.stringify(plano));
    return plano;
  });
  planejamentos.set(entrevistaId, pedido);
  try { return await pedido; }
  finally { planejamentos.delete(entrevistaId); }
}

/** O plano em texto corrido, para quem não fala JSON: o prompt de cada turno e (US-019) a variável
 * `roteiro` do agente conversacional da ElevenLabs. */
export function roteiroEmTexto(plano: Roteiro): string {
  return plano.perguntas
    .map((p, i) => `${i + 1}. [${ROTULO_BLOCO[p.bloco]}]${p.foco ? ` (sobre: ${p.foco})` : ""} ${p.pergunta}`)
    .join("\n");
}

// ---------------------------------------------------------------------------------------------
// A condução
// ---------------------------------------------------------------------------------------------

/** A resposta foi curta demais para sustentar alguma coisa? É a regra de reserva do follow-up: vale
 * quando o modelo não disse se a resposta merece aprofundamento (ou não respondeu). */
export function respostaVaga(texto: string): boolean {
  const limpo = texto.replace(/\s+/g, " ").trim();
  if (!limpo) return false;
  return limpo.split(" ").length <= PALAVRAS_RESPOSTA_VAGA;
}

/** Quem diz que não sabe ou prefere não responder não ganha um pedido de exemplo: insistir constrange. */
function preferePular(resposta: string): boolean {
  return /(?:não (?:sei|tenho experiência|quero responder)|prefiro não|pode pular)/i.test(resposta);
}

/** A REGRA do aprofundamento, usada quando o modelo não decidiu: resposta curta e a pessoa não pediu para pular. */
function aprofundarPelaRegra(resposta: string): boolean {
  return respostaVaga(resposta) && !preferePular(resposta);
}

export type PassoRoteiro =
  | { tipo: "encerrar" }
  /** A pessoa pediu um momento ou avisou que não terminou: a palavra volta para ela, nada anda. */
  | { tipo: "continuar" }
  | { tipo: "duvida"; retomar?: PerguntaRoteiro }
  | { tipo: "followup"; bloco: BlocoRoteiro }
  | { tipo: "retomar"; indice: number; pergunta: PerguntaRoteiro }
  /** `coberta` é a pergunta planejada que ficou para trás porque a conversa já a tinha respondido. */
  | { tipo: "pergunta"; indice: number; pergunta: PerguntaRoteiro; coberta?: number };

/**
 * O que uma fala gravada precisa lembrar do passo para a posição ser refeita: o tipo e, numa pergunta,
 * o índice. É o que vai na coluna `passo` de `mensagens_entrevista` (`passoEmTexto`) e volta por
 * `lerPassoGravado`. Falas anteriores à 0.8.0 não têm passo e são lidas pelas regras (`decidirPasso`).
 */
export type PassoGravado = { tipo: PassoRoteiro["tipo"]; indice?: number; coberta?: number };

const TIPOS_DE_PASSO: PassoRoteiro["tipo"][] = ["encerrar", "continuar", "duvida", "followup", "retomar", "pergunta"];

export function passoEmTexto(passo: PassoRoteiro): string {
  if (passo.tipo !== "pergunta") return passo.tipo;
  return passo.coberta === undefined ? `pergunta:${passo.indice}` : `pergunta:${passo.indice};coberta:${passo.coberta}`;
}

export function lerPassoGravado(texto: string | undefined): PassoGravado | null {
  if (!texto) return null;
  const [cabeca, ...resto] = texto.split(";");
  const [tipo, indice] = cabeca.split(":");
  if (!TIPOS_DE_PASSO.includes(tipo as PassoRoteiro["tipo"])) return null;
  if (tipo !== "pergunta") return { tipo: tipo as PassoRoteiro["tipo"] };
  const n = Number(indice);
  if (!Number.isInteger(n) || n < 0) return null;
  const coberta = resto.find((r) => r.startsWith("coberta:"));
  const c = coberta ? Number(coberta.slice("coberta:".length)) : NaN;
  return Number.isInteger(c) ? { tipo: "pergunta", indice: n, coberta: c } : { tipo: "pergunta", indice: n };
}

type Posicao = { indice: number; feitas: number; followUps: number[]; ultimoPasso?: PassoRoteiro["tipo"] };

/**
 * As REGRAS da condução: o que decide o passo quando o modelo não está conectado, não respondeu a
 * tempo, ou quando a fala foi gravada antes de os passos serem guardados (ver `posicaoNoRoteiro`).
 *
 * Os pedidos do candidato vêm ANTES de qualquer outra leitura da resposta (lib/pedidos-candidato.ts).
 * "Pode repetir?" não é uma resposta vaga a aprofundar nem uma dúvida sobre a vaga; "espera, não
 * terminei" tampouco. Aprofundamentos não gastam perguntas principais. Cada pergunta pode ganhar um
 * aprofundamento; só encerramos depois de percorrer todo o plano e ouvir a resposta final.
 */
export function decidirPasso({ plano, posicao, resposta }: {
  plano: Roteiro;
  posicao: Posicao;
  resposta: string;
  numeroPerguntas: number;
}): PassoRoteiro {
  const { indice, followUps } = posicao;
  const anterior = plano.perguntas[indice - 1];
  if (anterior && pedeRepeticao(resposta)) return { tipo: "retomar", indice: indice - 1, pergunta: anterior };
  if (anterior && pedeContinuar(resposta)) return { tipo: "continuar" };
  if (temDuvidaSobreVaga(resposta)) return { tipo: "duvida", retomar: indice < plano.perguntas.length ? anterior : undefined };
  if (indice >= plano.perguntas.length) return { tipo: "encerrar" };
  if (resposta && anterior && anterior.bloco !== "encerramento" &&
      !followUps.includes(indice - 1) && aprofundarPelaRegra(resposta)) {
    return { tipo: "followup", bloco: anterior.bloco };
  }
  return { tipo: "pergunta", indice, pergunta: plano.perguntas[indice] };
}

/**
 * "Espera, não terminei" logo depois de uma pergunta nova significa que a pergunta saiu cedo demais:
 * a pessoa ainda estava respondendo a anterior quando o fim da fala foi detectado. Essa pergunta volta
 * a ficar pendente e é feita de novo depois da continuação. Não vale para a primeira pergunta (não
 * havia resposta em curso) nem para um aprofundamento (ele já cumpriu o papel dele: dar mais espaço).
 */
function recuaAoContinuar(passo: PassoGravado, posicao: Posicao): boolean {
  return passo.tipo === "continuar" && posicao.ultimoPasso === "pergunta" && posicao.indice >= 2;
}

/** O indicador acompanha o roteiro, não o número de falas ou de aprofundamentos. */
function indiceDoPasso(passo: PassoGravado, posicao: Posicao): number {
  if (passo.tipo === "pergunta" && passo.indice !== undefined) return passo.indice + 1;
  return recuaAoContinuar(passo, posicao) ? posicao.indice - 1 : posicao.indice;
}

function aplicarPasso(posicao: Posicao, passo: PassoGravado, plano: Roteiro): void {
  if (passo.tipo === "followup") {
    posicao.followUps.push(posicao.indice - 1);
    posicao.feitas++;
  } else if (passo.tipo === "pergunta" && passo.indice !== undefined) {
    posicao.indice = Math.min(passo.indice, plano.perguntas.length - 1) + 1;
    posicao.feitas++;
  } else if (recuaAoContinuar(passo, posicao)) {
    posicao.indice--;
    posicao.feitas--;
  }
  posicao.ultimoPasso = passo.tipo;
}

/**
 * Onde a conversa está, deduzido da transcrição.
 *
 * A posição não é guardada em lugar nenhum de propósito: repassar a conversa desde o começo devolve
 * exatamente o mesmo caminho. O que cada fala da entrevistadora lembra é o PASSO que cumpriu
 * (`Troca.passo`, gravado desde a 0.8.0): desde que o modelo passou a interpretar a resposta, só as
 * regras não bastariam para refazer o caminho — uma resposta de trinta palavras que o modelo achou
 * completa seguiu para a próxima pergunta, e as regras a aprofundariam. Falas sem passo (anteriores,
 * ou de uma conversa que o modelo não conduziu) continuam sendo lidas por `decidirPasso`, que é
 * determinística. É a mesma função que serve à prévia do gestor, que não grava nada.
 */
export function posicaoNoRoteiro(plano: Roteiro, falas: Troca[], numeroPerguntas: number): Posicao & { ultimaResposta: string } {
  const posicao: Posicao = { indice: 0, feitas: 0, followUps: [] };
  let resposta = "";
  for (const fala of falas) {
    if (fala.papel === "candidato") {
      resposta = fala.texto;
      continue;
    }
    const passo = lerPassoGravado(fala.passo) ?? decidirPasso({ plano, posicao, resposta, numeroPerguntas });
    aplicarPasso(posicao, passo, plano);
    resposta = "";
  }
  return { ...posicao, ultimaResposta: resposta };
}

/** A posição ANTES da última fala da entrevistadora e o passo que ela cumpriu — o gravado, ou o que as
 * regras deduzem para uma fala antiga. É o que a sala precisa para redesenhar a conversa sem gastar turno. */
function estadoAposUltimaFala(plano: Roteiro, falas: Troca[], numeroPerguntas: number): { posicao: Posicao & { ultimaResposta: string }; passo: PassoGravado } {
  const posicao = posicaoNoRoteiro(plano, falas.slice(0, -1), numeroPerguntas);
  const ultima = falas[falas.length - 1];
  const passo = lerPassoGravado(ultima?.passo) ?? decidirPasso({ plano, posicao, resposta: posicao.ultimaResposta, numeroPerguntas });
  return { posicao, passo };
}

// ---------------------------------------------------------------------------------------------
// A memória de trabalho
// ---------------------------------------------------------------------------------------------

/**
 * As anotações da entrevistadora: uma linha por pergunta respondida ("P3 (requisitos): liderou time de
 * suporte com 60 contas; sem número de resultado"), escritas pelo modelo no MESMO pedido que escreve a
 * fala e guardadas em `entrevistas.memoria`. São a memória de trabalho da conversa — o que permite à
 * transição citar o que a pessoa disse três perguntas atrás e perceber que a próxima pergunta planejada
 * já foi respondida. A transcrição continua sendo a verdade; as notas são um resumo dela.
 */
export type Memoria = { notas: string[] };
const MAX_NOTAS = 40;
const LIMITE_NOTA = 240;
const SEM_MEMORIA: Memoria = { notas: [] };

/** Uma memória gravada num formato que este código não conhece nunca derruba a sala. */
export function lerMemoriaGravada(cru: string | null | undefined): Memoria {
  if (!cru) return SEM_MEMORIA;
  try {
    const dados = JSON.parse(cru) as Partial<Memoria>;
    return { notas: normalizarNotas(dados?.notas) };
  } catch (err) {
    console.error("Memória da conversa ilegível no banco; seguindo sem anotações.", err);
    return SEM_MEMORIA;
  }
}

function normalizarNotas(bruto: unknown): string[] {
  if (!Array.isArray(bruto)) return [];
  return bruto
    .map((n) => corte(n, LIMITE_NOTA))
    .filter(Boolean)
    .slice(-MAX_NOTAS);
}

/** As notas que o modelo devolveu, aceitas só quando não perderam nada do que já estava anotado: um
 * modelo que devolve a lista mais curta esqueceu de copiar, e quem esquece não apaga a memória. */
function mesclarNotas(anteriores: string[], devolvidas: string[]): string[] {
  return devolvidas.length >= anteriores.length ? devolvidas : anteriores;
}

// ---------------------------------------------------------------------------------------------
// A interpretação do turno
// ---------------------------------------------------------------------------------------------

/** O que o modelo diz que a última fala do candidato É. As regras (lib/pedidos-candidato.ts,
 * lib/duvidas-vaga.ts) pegam as formas explícitas antes; o modelo pega as outras. */
export type Intencao = "resposta" | "repetir" | "continuar" | "duvida" | "pular" | "ja_respondida";
const INTENCOES: Intencao[] = ["resposta", "repetir", "continuar", "duvida", "pular", "ja_respondida"];

export type Interpretacao = {
  intencao: Intencao;
  /** Só em "resposta". `undefined` quando o modelo não disse: vale a regra de tamanho. */
  aprofundar?: boolean;
  /** A próxima pergunta planejada já foi respondida pelo que a pessoa disse até aqui. */
  proximaJaCoberta: boolean;
  /** A fala escrita pelo modelo: o aprofundamento, ou a transição para a pergunta planejada. */
  fala: string;
  notas: string[];
};

const SYSTEM_TURNO = `Você é a entrevistadora de IA que conduz uma entrevista de triagem por voz, em português do Brasil.

O roteiro já foi planejado e é o sistema que o aplica. Neste turno você faz três coisas: diz o que a última fala do candidato É, escreve a sua próxima fala e atualiza as suas anotações.

"intencao" — o que a última fala do candidato é:
- "resposta": ele respondeu à pergunta (bem ou mal, completa ou não).
- "repetir": não ouviu ou não entendeu e quer ouvir a pergunta de novo.
- "continuar": pediu um momento para pensar ou avisou que ainda não terminou de responder.
- "duvida": fez uma pergunta sobre a vaga, a empresa ou o processo.
- "pular": disse que não sabe, que prefere não responder ou pediu para pular.
- "ja_respondida": disse que já respondeu isso antes.

"aprofundar" — só quando "intencao" for "resposta": true se a resposta ficou genérica, curta ou sem uma situação real de trabalho, e o sistema informar que ainda há aprofundamento disponível; false se ela já trouxe situação, ação e resultado, ou se a pessoa mostrou que não quer ou não sabe ir além.

"proximaJaCoberta" — true SOMENTE quando o que a pessoa já disse na conversa responde claramente a próxima pergunta planejada (informada abaixo). Na dúvida, false. Nunca para a abertura nem para o encerramento.

"fala" — a sua fala, curta (no máximo 3 frases), para ser OUVIDA, no tom pedido:
- Com "aprofundar" true: a pergunta de aprofundamento, ligada ao que a pessoa acabou de dizer, sem repetir a pergunta anterior com outras palavras.
- Nos outros casos em que houver próxima pergunta planejada: SOMENTE uma breve transição ligada à última resposta — pode retomar algo que a pessoa disse antes na conversa ("você comentou que...") —, sem perguntas: o sistema acrescenta a pergunta planejada. Para "pular" e "ja_respondida", a transição acolhe e segue ("Sem problema, vamos adiante."). Sem transição útil, fala vazia. Nunca anuncie o encerramento nesta transição.
- Sem próxima pergunta planejada (o roteiro terminou): fala vazia — a despedida já está escrita.
- Para "repetir", "continuar" e "duvida": fala vazia — o sistema responde.

"notas" — as suas anotações, uma linha por pergunta já respondida. Copie as anteriores na ordem e, quando a fala for "resposta", "pular" ou "ja_respondida", acrescente UMA linha para a pergunta que acabou de ser respondida, no formato "P<número> (<bloco>): o que a pessoa disse, em até 25 palavras; o que ficou em aberto". Só o que foi dito, nada inferido. Para "repetir", "continuar" e "duvida", devolva as anteriores sem mudar.

Regras:
- Nunca mencione nota, avaliação, parecer nem que a conversa está sendo analisada.
- Nunca diga que pesquisou o candidato na internet e nunca cite um perfil público: "Vi no seu LinkedIn que..." está proibido. Citar o currículo é permitido: "Você comentou no currículo que...".
- Nunca cite o nome da competência cultural que a pergunta quer observar.
- Nunca invente benefício, salário, horário, etapa nem prazo; quem responde isso é o sistema, com os fatos da vaga.
- Não repita a saudação: só a primeira fala da entrevista cumprimenta.

Formato de saída (JSON): {"intencao":"resposta|repetir|continuar|duvida|pular|ja_respondida","aprofundar":true|false,"proximaJaCoberta":true|false,"fala":"","notas":[""]}`;

/** Os únicos fatos que a entrevistadora pode dizer sobre a vaga. O que não está aqui, ela não sabe. */
export function fatosDaVaga(ctx: ContextoRoteiro): string[] {
  return [
    `Cargo: ${ctx.cargo}`,
    ctx.area && `Área: ${ctx.area}`,
    ctx.senioridade && `Senioridade: ${ctx.senioridade}`,
    ctx.modelo && `Modelo de trabalho: ${ctx.modelo}`,
    ctx.local && `Local: ${ctx.local}`,
    // A faixa cadastrada permite responder dúvidas mesmo sem perguntar a pretensão.
    ctx.faixaSalarial && `Faixa salarial: ${ctx.faixaSalarial}`,
    ctx.desafios.length && `Desafios dos primeiros meses: ${ctx.desafios.join("; ")}`,
    ctx.requisitos.length && `Requisitos: ${ctx.requisitos.join("; ")}`,
    `Duração desta conversa: cerca de ${ctx.duracaoMin} minutos`,
  ].filter((f): f is string => Boolean(f));
}

/** Com anotações, as falas antigas já estão resumidas nelas e o prompt carrega só as recentes. */
function conversaNoPrompt(falas: Troca[], quantas = MAX_FALAS_NO_PROMPT): string {
  if (!falas.length) return "(nenhuma troca ainda)";
  const recentes = falas.slice(-quantas);
  const ultimaResposta = recentes.findLastIndex((f) => f.papel === "candidato");
  return recentes
    .map((f, i) => `${f.papel === "entrevistadora" ? "Entrevistadora" : "Candidato"}: ${corte(f.texto, i === ultimaResposta ? LIMITE_ULTIMA_RESPOSTA_NO_PROMPT : LIMITE_FALA_ANTERIOR_NO_PROMPT)}`)
    .join("\n");
}

function construirPromptTurno({ ctx, plano, falas, posicao, memoria }: {
  ctx: ContextoRoteiro;
  plano: Roteiro;
  falas: Troca[];
  posicao: Posicao;
  memoria: Memoria;
}): string {
  const anterior = plano.perguntas[posicao.indice - 1];
  const proxima = plano.perguntas[posicao.indice];
  const aprofundamentoDisponivel = Boolean(anterior) && anterior.bloco !== "encerramento" && !posicao.followUps.includes(posicao.indice - 1);
  return [
    "Fatos da vaga (o ÚNICO que você pode afirmar sobre ela):",
    fatosDaVaga(ctx).map((f) => `- ${f}`).join("\n"),
    "",
    "Roteiro planejado:",
    roteiroEmTexto(plano),
    "",
    "Suas anotações até aqui:",
    memoria.notas.length ? memoria.notas.map((n) => `- ${n}`).join("\n") : "(nenhuma ainda)",
    "",
    "Conversa recente (a última fala é a do candidato, que você vai interpretar):",
    conversaNoPrompt(falas, memoria.notas.length ? MAX_FALAS_COM_NOTAS : MAX_FALAS_NO_PROMPT),
    "",
    anterior ? `Última pergunta feita: nº ${posicao.indice} [${ROTULO_BLOCO[anterior.bloco]}]: ${anterior.pergunta}` : "Nenhuma pergunta foi feita ainda.",
    `Aprofundamento ainda disponível para ela: ${aprofundamentoDisponivel ? "sim" : "não"}`,
    proxima
      ? `Próxima pergunta planejada: nº ${posicao.indice + 1} [${ROTULO_BLOCO[proxima.bloco]}]: ${proxima.pergunta}`
      : "Não há próxima pergunta planejada: o roteiro terminou e a despedida já está escrita.",
    `Tom: ${ctx.tom}`,
    ctx.candidato.primeiroNome ? `Nome do candidato: ${ctx.candidato.primeiroNome}` : "Não há nome de candidato: não invente um.",
    "",
    "Interprete a última fala do candidato, escreva a sua fala e atualize as anotações.",
  ].join("\n");
}

const MAX_FALAS_COM_NOTAS = 10;

/** UMA chamada de modelo por turno: interpretar a resposta, escrever a fala e anotar. */
async function interpretarTurno(args: { ctx: ContextoRoteiro; plano: Roteiro; falas: Troca[]; posicao: Posicao; memoria: Memoria }): Promise<Interpretacao> {
  const bruto = await askJSON<Record<string, unknown>>({ system: SYSTEM_TURNO, prompt: construirPromptTurno(args), maxTokens: 700, limiteMs: 9000 });
  const dados = (bruto ?? {}) as Record<string, unknown>;
  const intencao = INTENCOES.includes(dados.intencao as Intencao) ? (dados.intencao as Intencao) : "resposta";
  return {
    intencao,
    aprofundar: typeof dados.aprofundar === "boolean" ? dados.aprofundar : undefined,
    proximaJaCoberta: dados.proximaJaCoberta === true,
    fala: corte(dados.fala),
    notas: mesclarNotas(args.memoria.notas, normalizarNotas(dados.notas)),
  };
}

/**
 * O passo a partir do que o modelo entendeu — com as MESMAS garantias das regras: um aprofundamento por
 * pergunta, nunca no encerramento, o roteiro nunca anda para trás nem pula a abertura ou o encerramento,
 * e o fim só chega depois da última pergunta. O modelo interpreta; quem decide continua sendo o código.
 */
export function passoDaInterpretacao(plano: Roteiro, posicao: Posicao, resposta: string, interp: Interpretacao): PassoRoteiro {
  const { indice, followUps } = posicao;
  const anterior = plano.perguntas[indice - 1];
  const fim = indice >= plano.perguntas.length;
  if (interp.intencao === "repetir" && anterior) return { tipo: "retomar", indice: indice - 1, pergunta: anterior };
  if (interp.intencao === "continuar" && anterior) return { tipo: "continuar" };
  if (interp.intencao === "duvida") return { tipo: "duvida", retomar: fim ? undefined : anterior };
  if (fim) return { tipo: "encerrar" };
  const aprofundar = interp.intencao === "resposta" && (interp.aprofundar ?? aprofundarPelaRegra(resposta));
  if (aprofundar && anterior && anterior.bloco !== "encerramento" && !followUps.includes(indice - 1)) {
    return { tipo: "followup", bloco: anterior.bloco };
  }
  const proxima = plano.perguntas[indice];
  const podeCobrir = interp.proximaJaCoberta && indice < plano.perguntas.length - 1 && proxima.bloco !== "abertura" && proxima.bloco !== "encerramento";
  if (podeCobrir) return { tipo: "pergunta", indice: indice + 1, pergunta: plano.perguntas[indice + 1], coberta: indice };
  return { tipo: "pergunta", indice, pergunta: proxima };
}

/** A transição escrita pelo modelo não pode trocar o tópico, omitir a pergunta nem encerrar a conversa. */
function transicaoSegura(fala: string): string {
  const curta = corte(fala, 180);
  return /[?]|(?:encerr|termin|obrigad.*tempo|próxim[oa]s? passos)/i.test(curta) ? "" : curta;
}

/** O que sai quando não há modelo para escrever: a pergunta do plano, do jeito que foi escrita. */
function textoDeReserva(passo: PassoRoteiro, plano: Roteiro): string {
  switch (passo.tipo) {
    case "encerrar": return plano.despedida;
    case "followup": return followUpDemo();
    case "continuar": return FALA_CONTINUAR;
    case "pergunta": return passo.pergunta.pergunta;
    case "retomar": return `Claro. ${passo.pergunta.pergunta}`;
    case "duvida": return "Não tenho essa informação confirmada no cadastro da vaga. O time de recrutamento poderá esclarecer essa dúvida.";
  }
}

/**
 * A fala dos passos que o código responde sozinho — dúvida, repetição, pausa — e da conversa sem
 * modelo (demonstração), mais a saudação da primeira pergunta. Para os demais passos com o modelo
 * conectado, quem escreve é `interpretarTurno`; aqui sai o texto de reserva.
 */
async function falaDoPasso(args: {
  ctx: ContextoRoteiro;
  plano: Roteiro;
  falas: Troca[];
  passo: PassoRoteiro;
  primeira: boolean;
}): Promise<string> {
  const { passo } = args;
  if (passo.tipo === "encerrar") return args.plano.despedida;
  if (passo.tipo === "duvida") {
    const pergunta = args.falas.findLast(f => f.papel === "candidato")?.texto ?? "";
    const resposta = responderDuvidaDaVaga(args.ctx, pergunta);
    if (resposta.endsWith("?")) return resposta;
    return `${resposta} ${passo.retomar ? `Retomando a nossa conversa: ${passo.retomar.pergunta}` : "Tem mais alguma dúvida sobre a vaga?"}`;
  }
  if (passo.tipo === "continuar") return FALA_CONTINUAR;
  const reserva = textoDeReserva(passo, args.plano);
  if (passo.tipo === "retomar") {
    // Repete o que foi DITO por último, não o que estava no plano: se a última fala foi um
    // aprofundamento ("pode dar um exemplo?"), é ele que a pessoa não ouviu. Quando a última fala
    // continha a pergunta planejada (a saudação da abertura, a resposta a uma dúvida), sai só a pergunta.
    const ultima = args.falas.findLast((f) => f.papel === "entrevistadora")?.texto ?? "";
    const repetir = ultima && ultima !== FALA_CONTINUAR && !ultima.includes(passo.pergunta.pergunta) ? ultima : passo.pergunta.pergunta;
    return `Claro. ${repetir}`;
  }
  if (!aiEnabled()) {
    await esperar(500);
    return reserva;
  }
  // O roteiro já contém a primeira pergunta. Reformulá-la exigia outra chamada
  // ao provedor antes de a pessoa conseguir começar.
  if (args.primeira && passo.tipo === "pergunta") {
    return `Olá${args.ctx.candidato.primeiroNome ? `, ${args.ctx.candidato.primeiroNome}` : ""}! Vamos conversar por cerca de ${args.ctx.duracaoMin} minutos. Fique à vontade para pensar e contar exemplos com calma. Se precisar de um momento, é só dizer; se não ouvir bem, peça para eu repetir. ${reserva}`;
  }
  return reserva;
}

/** O texto de um passo decidido a partir da interpretação do modelo. */
async function textoDoPasso(args: { ctx: ContextoRoteiro; plano: Roteiro; falas: Troca[]; passo: PassoRoteiro; interpretacao: Interpretacao }): Promise<string> {
  const { passo, interpretacao, plano } = args;
  switch (passo.tipo) {
    case "encerrar":
      return plano.despedida;
    case "followup":
      // O modelo só escreveu um aprofundamento se decidiu aprofundar; se a regra de reserva decidiu por
      // ele, a fala é uma transição e não serve. Uma pergunta se reconhece pela interrogação.
      return /\?/.test(interpretacao.fala) ? interpretacao.fala : followUpDemo();
    case "pergunta":
      return [transicaoSegura(interpretacao.fala), passo.pergunta.pergunta].filter(Boolean).join(" ");
    default:
      return falaDoPasso({ ctx: args.ctx, plano, falas: args.falas, passo, primeira: false });
  }
}

type Turno = { passo: PassoRoteiro; texto: string; memoria: Memoria; posicao: Posicao & { ultimaResposta: string } };

/**
 * Um turno inteiro: onde a conversa está, o que a última fala do candidato é, o que a entrevistadora
 * diz e o que ela anota.
 *
 * As regras vêm primeiro e resolvem sozinhas o que é explícito ("pode repetir", "só um momento", "qual
 * é o salário"): são rápidas e não dependem do modelo. O resto — se a resposta merece aprofundamento, se
 * um "acho que não peguei" é um pedido de repetição, a transição — é do modelo, em UMA chamada. Quando o
 * modelo falha ou demora, valem as regras e a pergunta do plano sai do jeito que foi escrita: uma
 * entrevista que trava no meio custa muito mais ao candidato do que uma pergunta menos costurada.
 */
async function conduzirTurno({ ctx, plano, falas, memoria }: { ctx: ContextoRoteiro; plano: Roteiro; falas: Troca[]; memoria: Memoria }): Promise<Turno> {
  const posicao = posicaoNoRoteiro(plano, falas, ctx.numeroPerguntas);
  const resposta = posicao.ultimaResposta;
  const porRegra = decidirPasso({ plano, posicao, resposta, numeroPerguntas: ctx.numeroPerguntas });
  const primeira = posicao.feitas === 0;
  const pedidoPorRegra = porRegra.tipo === "retomar" || porRegra.tipo === "continuar" || porRegra.tipo === "duvida";
  if (!aiEnabled() || primeira || !resposta || pedidoPorRegra) {
    return { passo: porRegra, texto: await falaDoPasso({ ctx, plano, falas, passo: porRegra, primeira }), memoria, posicao };
  }
  let interpretacao: Interpretacao | null = null;
  try {
    interpretacao = await interpretarTurno({ ctx, plano, falas, posicao, memoria });
  } catch (err) {
    console.error("A entrevistadora não conseguiu interpretar a resposta deste turno; seguindo pelas regras e pelo roteiro planejado.", err);
  }
  if (!interpretacao) return { passo: porRegra, texto: textoDeReserva(porRegra, plano), memoria, posicao };
  const passo = passoDaInterpretacao(plano, posicao, resposta, interpretacao);
  const texto = await textoDoPasso({ ctx, plano, falas, passo, interpretacao });
  return { passo, texto, memoria: { notas: interpretacao.notas }, posicao };
}

/** O que a sala recebe a cada turno. `transcricao` vem junto porque a conversa mora no servidor: a
 * tela desenha o que o servidor guardou, não o que ela lembra. */
export type Fala = {
  pergunta: string;
  encerrar: boolean;
  /** Quantas perguntas já foram feitas e quantas a vaga combinou: o "Pergunta 3 de 8" da sala. */
  indice: number;
  total: number;
  transcricao: Troca[];
};

function comoTrocas(falas: { papel: string; texto: string; passo?: string }[]): Troca[] {
  return falas.map((f) => (f.passo ? { papel: f.papel === "candidato" ? "candidato" : "entrevistadora", texto: f.texto, passo: f.passo } : { papel: f.papel === "candidato" ? "candidato" : "entrevistadora", texto: f.texto }));
}

function falaDoTurno(turno: Turno, plano: Roteiro, falas: Troca[]): Fala {
  const passo = passoEmTexto(turno.passo);
  return {
    pergunta: turno.texto,
    encerrar: turno.passo.tipo === "encerrar",
    indice: indiceDoPasso(turno.passo, turno.posicao),
    total: plano.perguntas.length,
    transcricao: [...falas, { papel: "entrevistadora", texto: turno.texto, passo }],
  };
}

/**
 * A próxima fala de uma entrevista de verdade. Substitui `proximaPergunta()` de lib/entrevista.ts.
 *
 * O navegador manda só a última resposta; tudo o mais é lido e gravado aqui.
 *
 * **`ordem` é o que impede uma resposta de entrar duas vezes.** Ela diz "esta é a minha resposta de
 * número N": se o servidor já guardou N respostas, a que chegou já está lá, e o pedido é uma
 * repetição — o caso comum é a resposta do servidor ter se perdido no caminho e a sala ter chamado
 * "Tentar de novo". Comparar o TEXTO não serviria: duas perguntas seguidas respondidas com "Sim."
 * são duas respostas de verdade, e engolir a segunda deixaria uma pergunta sem resposta no parecer.
 * Sem `ordem` (um cliente que não a manda), vale a comparação de texto, que é o melhor possível.
 *
 * Recarregar a página sem responder nada devolve a pergunta atual, sem gastar uma do total.
 *
 * **`nivelVoz` é gravado na primeira resposta e não muda depois.** Ele responde "como foi esta
 * entrevista?" na tela de quem acompanha o processo, e a resposta honesta é a de quando a conversa
 * começou: quem trocou de jeito no meio (caiu para o teclado numa pergunta) não fez outra entrevista.
 */
const turnosEmCurso = new Map<string, Promise<unknown>>();

export async function proximaFala(
  entrevistaId: string,
  ultimaResposta?: string,
  ordem?: number,
  opcoes: { nivelVoz?: NivelVoz; tentativa?: number } = {},
): Promise<Fala> {
  opcoes = { ...opcoes, tentativa: opcoes.tentativa ?? obterEntrevista(entrevistaId)?.tentativa };
  const anterior = turnosEmCurso.get(entrevistaId) ?? Promise.resolve();
  const atual = anterior.catch(() => {}).then(() => comTurnoExclusivo(entrevistaId, () => executarProximaFala(entrevistaId, ultimaResposta, ordem, opcoes)));
  turnosEmCurso.set(entrevistaId, atual);
  try { return await atual; }
  finally { if (turnosEmCurso.get(entrevistaId) === atual) turnosEmCurso.delete(entrevistaId); }
}

async function executarProximaFala(
  entrevistaId: string,
  ultimaResposta?: string,
  ordem?: number,
  { nivelVoz, tentativa }: { nivelVoz?: NivelVoz; tentativa?: number } = {}
): Promise<Fala> {
  const entrevista = obterEntrevista(entrevistaId);
  if (!entrevista) throw new Error(`Entrevista ${entrevistaId} não encontrada.`);
  if (tentativa !== undefined) conferirTentativa(entrevistaId, tentativa);
  const ctx = montarContexto(entrevistaId);
  if (!ctx) throw new Error(`A vaga ou o candidato da entrevista ${entrevistaId} não existe mais.`);

  const plano = await roteiroDaEntrevista(entrevistaId, ctx);

  if (tentativa !== undefined) conferirTentativa(entrevistaId, tentativa);
  let falas = comoTrocas(transcricao(entrevistaId));
  const resposta = (ultimaResposta ?? "").replace(/\s+/g, " ").trim();
  const guardadas = falas.filter((f) => f.papel === "candidato").length;
  const ultima = falas[falas.length - 1];
  const repetida =
    typeof ordem === "number" && Number.isFinite(ordem)
      ? guardadas >= ordem
      : ultima?.papel === "candidato" && ultima.texto === resposta;
  if (resposta && !repetida) {
    if (tentativa !== undefined) conferirTentativa(entrevistaId, tentativa);
    registrarMensagem({ entrevistaId, papel: "candidato", texto: resposta });
    falas = [...falas, { papel: "candidato", texto: resposta }];
    if (entrevista.status === "convidada" || entrevista.status === "aberta") {
      mudarStatus(entrevistaId, "em_andamento", { nivelVoz: entrevista.nivelVoz ?? nivelVoz });
    }
  }

  // Nada novo a dizer (recarregou a página) ou a resposta já estava guardada e o turno já tinha sido
  // respondido ("Tentar de novo" depois de a resposta do servidor se perder): repete a pergunta em que
  // a conversa parou, em vez de fazer outra. Gastar um turno por um pedido repetido tiraria uma
  // pergunta de quem está sendo entrevistado e deixaria a anterior sem resposta na transcrição.
  const agora = falas[falas.length - 1];
  if ((!resposta || repetida) && agora?.papel === "entrevistadora") {
    const { posicao, passo } = estadoAposUltimaFala(plano, falas, ctx.numeroPerguntas);
    return {
      pergunta: agora.texto,
      encerrar: passo.tipo === "encerrar",
      indice: indiceDoPasso(passo, posicao),
      total: plano.perguntas.length,
      transcricao: falas,
    };
  }

  const memoria = lerMemoriaGravada(lerMemoria(entrevistaId));
  const turno = await conduzirTurno({ ctx, plano, falas, memoria });

  if (tentativa !== undefined) conferirTentativa(entrevistaId, tentativa);
  registrarMensagem({ entrevistaId, papel: "entrevistadora", texto: turno.texto, passo: passoEmTexto(turno.passo) });
  if (turno.memoria !== memoria) salvarMemoria(entrevistaId, JSON.stringify(turno.memoria));
  return falaDoTurno(turno, plano, falas);
}

/**
 * A conversa como o servidor a tem, **sem escrever nada e sem gastar um turno**.
 *
 * É o que a sala pede ao abrir: quem recarregou a página no meio da entrevista volta com as falas já
 * trocadas na tela e com o "Pergunta 3 de 8" no lugar certo. Pedir isso a `proximaFala()` funcionaria,
 * mas ela grava — e uma tela que se abre duas vezes (a montagem dupla do React em desenvolvimento, um
 * toque duplo no link) escreveria duas vezes.
 *
 * Devolve `null` quando ainda não há nada: aí quem abre a sala é a primeira fala da entrevistadora.
 * `pergunta` fica vazia quando a última coisa dita foi do candidato — a resposta chegou, a fala
 * seguinte não, e é a sala que pede a próxima.
 */
export async function conversaAtual(entrevistaId: string): Promise<Fala | null> {
  const falas = comoTrocas(transcricao(entrevistaId));
  if (!falas.length) return null;
  const ctx = montarContexto(entrevistaId);
  if (!ctx) return null;
  const plano = await roteiroDaEntrevista(entrevistaId, ctx);

  const ultima = falas[falas.length - 1];
  const { posicao, passo } =
    ultima.papel === "entrevistadora"
      ? estadoAposUltimaFala(plano, falas, ctx.numeroPerguntas)
      : (() => {
          const posicao = posicaoNoRoteiro(plano, falas, ctx.numeroPerguntas);
          return { posicao, passo: decidirPasso({ plano, posicao, resposta: posicao.ultimaResposta, numeroPerguntas: ctx.numeroPerguntas }) as PassoGravado };
        })();
  return {
    pergunta: ultima.papel === "entrevistadora" ? ultima.texto : "",
    encerrar: passo.tipo === "encerrar",
    indice: indiceDoPasso(passo, posicao),
    total: plano.perguntas.length,
    transcricao: falas,
  };
}

// ---------------------------------------------------------------------------------------------
// A prévia do gestor (D11)
// ---------------------------------------------------------------------------------------------

/**
 * Planos de prévia já montados, por vaga e por versão da vaga.
 *
 * A prévia (D11) **não grava nada**: não há entrevista, não há linha em `entrevistas` e por isso não
 * há onde guardar o plano. Sem este cache, cada turno replanejaria o roteiro inteiro — duas chamadas
 * de modelo por pergunta, e um roteiro diferente a cada resposta, que é justamente o contrário do
 * que o gestor abriu a tela para ver. Editar a vaga muda a chave e o plano nasce de novo.
 */
const PREVIAS = new Map<string, Roteiro>();
const MAX_PREVIAS = 20;

async function planoEmCache(chave: string, ctx: ContextoRoteiro): Promise<Roteiro> {
  const guardado = PREVIAS.get(chave);
  if (guardado) return guardado;
  const plano = await planejarRoteiro(ctx);
  // Mapa preserva a ordem de inserção: o primeiro da fila é o mais antigo.
  if (PREVIAS.size >= MAX_PREVIAS) PREVIAS.delete(PREVIAS.keys().next().value as string);
  PREVIAS.set(chave, plano);
  return plano;
}

/** A próxima fala da prévia do gestor: o mesmo roteiro, com um candidato vazio e sem nada gravado. */
export async function proximaFalaDaPrevia(vaga: Vaga, historico: Troca[]): Promise<Fala> {
  const ctx = contextoDaVaga(vaga);
  return falaAvulsa(ctx, await planoEmCache(`${vaga.id}:${vaga.atualizadoEm}`, ctx), historico);
}

/**
 * A próxima fala de uma conversa que não tem entrevista no banco: a prévia do gestor e os links
 * antigos (tipo `scorecard`), que carregam a conversa no próprio navegador. Sem banco não há memória
 * de trabalho guardada: as anotações começam vazias a cada turno, e o passo de cada fala viaja na
 * própria transcrição (`Troca.passo`), que o navegador devolve inteira no turno seguinte.
 */
export async function falaAvulsa(ctx: ContextoRoteiro, plano: Roteiro, historico: Troca[]): Promise<Fala> {
  const turno = await conduzirTurno({ ctx, plano, falas: historico, memoria: SEM_MEMORIA });
  return falaDoTurno(turno, plano, historico);
}

/**
 * A conversa de um link antigo (tipo `scorecard`, ver lib/convite.ts), que não tem vaga cadastrada
 * nem entrevista no banco: a conversa mora no navegador de quem responde. O plano entra no mesmo
 * cache das prévias, pela mesma razão — sem ele, cada resposta replanejaria o roteiro inteiro.
 */
export async function proximaFalaDeLinkAntigo(vaga: VagaDaSala, historico: Troca[]): Promise<Fala> {
  const ctx = contextoDaVagaAntiga(vaga);
  const chave = `antigo:${vaga.titulo}:${vaga.candidato}:${vaga.requisitos}`;
  return falaAvulsa(ctx, await planoEmCache(chave, ctx), historico);
}
