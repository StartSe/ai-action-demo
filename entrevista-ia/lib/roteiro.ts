// O roteiro da entrevista (US-016): o que a entrevistadora sabe antes de abrir a boca, o plano que
// ela segue e a fala de cada turno.
//
// Três responsabilidades, e as três são de produto antes de serem de código:
//
//  1. **Saber o que pode saber.** `montarContexto()` junta vaga, cultura e ficha do candidato — mas
//     só a parte da ficha que veio do currículo, do gestor e (quando a identidade foi confirmada,
//     D6) da web. O que a pesquisa trouxe sobre um possível homônimo NÃO entra: uma pergunta feita
//     a partir do perfil de outra pessoa não dá erro em lugar nenhum, só constrange quem responde.
//  2. **Planejar uma vez.** `planejarRoteiro()` é UMA chamada de modelo, na abertura da sala,
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
import { aiEnabled, askJSON } from "./ai";
import { obter as obterCandidato } from "./candidatos";
import { obterCultura } from "./cultura";
import { esperar, followUpDemo, roteiroDemo } from "./demo";
import {
  lerRoteiro,
  mudarStatus,
  obter as obterEntrevista,
  registrarMensagem,
  salvarRoteiro,
  transcricao,
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
export const PALAVRAS_RESPOSTA_VAGA = 12;

/** Quanto da ficha e da conversa vai no prompt de cada turno. A entrevista inteira cabe folgado; o
 * corte existe para uma transcrição estranhamente longa não virar um pedido gigante. */
const MAX_FALAS_NO_PROMPT = 24;
const LIMITE_FALA = 600;

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
    // Sem "perguntar pretensão" a faixa nem viaja: o que não está no contexto não pode ser dito.
    faixaSalarial: vaga.perguntaPretensao ? faixaSalarial(vaga) : undefined,
    desafios: desafiosDaVaga(vaga.desafios),
    requisitos: linhas(vaga.requisitos),
    competencias: vaga.competenciasCulturais.map((c) => ({ nome: c.nome, descricao: c.descricao })),
    comportamentos: cultura.comportamentos,
    naoCombina: cultura.naoCombina,
    tom: vaga.tom,
    numeroPerguntas: vaga.numeroPerguntas,
    duracaoMin: vaga.duracaoMin,
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
- Uma pergunta por vez, curta (no máximo 2 frases), para ser ouvida e não lida.
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
    perguntas: final,
    despedida:
      corte(dados.despedida) ||
      `${ctx.candidato.primeiroNome ? `Muito obrigada, ${ctx.candidato.primeiroNome}!` : "Muito obrigada pelo seu tempo!"} Vou repassar essa conversa para o gestor da vaga, que entra em contato com os próximos passos.`,
    demo,
    em: new Date().toISOString(),
  };
}

/** O plano da conversa. Uma chamada de modelo, feita na abertura da sala e guardada. */
export async function planejarRoteiro(ctx: ContextoRoteiro): Promise<Roteiro> {
  if (!aiEnabled()) {
    await esperar(600);
    return roteiroDemo(ctx);
  }
  const bruto = await askJSON<unknown>({ system: SYSTEM_ROTEIRO, prompt: construirPromptRoteiro(ctx), maxTokens: 2000 });
  return normalizarRoteiro(bruto, ctx);
}

/** Uma ficha gravada num formato antigo (ou escrita por outra versão) nunca derruba a sala. */
function lerRoteiroGravado(entrevistaId: string): Roteiro | null {
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
 * É aqui que a única chamada de planejamento acontece — a sala chama na abertura e todo turno
 * seguinte cai no caminho do `lerRoteiroGravado`.
 */
export async function roteiroDaEntrevista(entrevistaId: string, ctx: ContextoRoteiro): Promise<Roteiro> {
  const guardado = lerRoteiroGravado(entrevistaId);
  if (guardado) return guardado;
  const plano = await planejarRoteiro(ctx);
  salvarRoteiro(entrevistaId, JSON.stringify(plano));
  return plano;
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

/** A resposta foi curta demais para sustentar alguma coisa? É a única condição do follow-up. */
export function respostaVaga(texto: string): boolean {
  const limpo = texto.replace(/\s+/g, " ").trim();
  if (!limpo) return false;
  return limpo.split(" ").length <= PALAVRAS_RESPOSTA_VAGA;
}

export type PassoRoteiro =
  | { tipo: "encerrar" }
  | { tipo: "followup"; bloco: BlocoRoteiro }
  | { tipo: "pergunta"; indice: number; pergunta: PerguntaRoteiro };

type Posicao = { indice: number; feitas: number; followUps: BlocoRoteiro[] };

/**
 * O que a entrevistadora faz agora. Função **pura**, testada por `npm test`, porque é ela que decide
 * em silêncio quantas perguntas a pessoa do outro lado vai ouvir.
 *
 * Duas garantias, e as duas são sobre não estourar o combinado com o gestor:
 *
 *  - **Um follow-up por bloco**, e só quando ainda cabem duas perguntas (a dele e o encerramento).
 *  - **A última vaga do total é sempre do encerramento.** Se os aprofundamentos comeram o caminho,
 *    a conversa pula direto para "você tem alguma pergunta?" em vez de terminar sem ele.
 */
export function decidirPasso({
  plano,
  posicao,
  resposta,
  numeroPerguntas,
}: {
  plano: Roteiro;
  posicao: Posicao;
  resposta: string;
  numeroPerguntas: number;
}): PassoRoteiro {
  const { indice, feitas, followUps } = posicao;
  if (feitas >= numeroPerguntas || indice >= plano.perguntas.length) return { tipo: "encerrar" };

  const sobra = numeroPerguntas - feitas;
  const blocoAnterior = indice > 0 ? plano.perguntas[indice - 1].bloco : null;
  if (
    resposta &&
    blocoAnterior &&
    blocoAnterior !== "encerramento" &&
    !followUps.includes(blocoAnterior) &&
    sobra >= 2 &&
    respostaVaga(resposta)
  ) {
    return { tipo: "followup", bloco: blocoAnterior };
  }

  let i = indice;
  if (sobra <= 1) {
    const fim = plano.perguntas.findIndex((p, k) => k >= indice && p.bloco === "encerramento");
    if (fim >= 0) i = fim;
  }
  return { tipo: "pergunta", indice: i, pergunta: plano.perguntas[i] };
}

/**
 * Onde a conversa está, deduzido da transcrição.
 *
 * A posição não é guardada em lugar nenhum de propósito: `decidirPasso` é determinística, então
 * repassar a conversa desde o começo devolve exatamente o mesmo caminho. Um estado a mais para
 * gravar seria um estado a mais para sair do lugar quando a sala caísse no meio de um turno — e é a
 * mesma função que serve à prévia do gestor, que não grava nada.
 */
export function posicaoNoRoteiro(plano: Roteiro, falas: Troca[], numeroPerguntas: number): Posicao & { ultimaResposta: string } {
  const posicao: Posicao = { indice: 0, feitas: 0, followUps: [] };
  let resposta = "";
  for (const fala of falas) {
    if (fala.papel === "candidato") {
      resposta = fala.texto;
      continue;
    }
    const passo = decidirPasso({ plano, posicao, resposta, numeroPerguntas });
    if (passo.tipo === "followup") {
      posicao.followUps.push(passo.bloco);
      posicao.feitas++;
    } else if (passo.tipo === "pergunta") {
      posicao.indice = passo.indice + 1;
      posicao.feitas++;
    }
    resposta = "";
  }
  return { ...posicao, ultimaResposta: resposta };
}

const SYSTEM_FALA = `Você é a entrevistadora de IA que conduz uma entrevista de triagem por voz, em português do Brasil.

O roteiro já foi planejado e quem decide o próximo passo é o sistema, não você: a sua parte é escrever a fala deste turno, no tom pedido.

Regras:
- Uma fala curta, no máximo 3 frases, para ser OUVIDA.
- Quando a instrução for "faça a próxima pergunta do roteiro", faça aquela pergunta. Você pode reescrevê-la para encaixar no que acabou de ser dito, mas não troque o assunto nem a deixe de fora.
- Quando a instrução for "aprofunde a última resposta", peça um exemplo concreto do que o candidato acabou de dizer, sem mudar de assunto e sem repetir a pergunta anterior com outras palavras.
- Se o candidato tiver feito uma pergunta, responda em UMA frase, só com os fatos da vaga listados abaixo, e siga com a pergunta do turno. Se a resposta não estiver nos fatos, diga que quem responde isso é o time de recrutamento. Nunca invente benefício, salário, horário, etapa nem prazo.
- Nunca mencione nota, avaliação, parecer nem que a conversa está sendo analisada.
- Nunca diga que pesquisou o candidato na internet e nunca cite um perfil público: "Vi no seu LinkedIn que..." está proibido. Citar o currículo é permitido: "Você comentou no currículo que...".
- Nunca cite o nome da competência cultural que a pergunta quer observar.
- Não repita a saudação: só a primeira fala da entrevista cumprimenta.

Formato de saída (JSON): {"fala": "texto da fala"}`;

/** Os únicos fatos que a entrevistadora pode dizer sobre a vaga. O que não está aqui, ela não sabe. */
export function fatosDaVaga(ctx: ContextoRoteiro): string[] {
  return [
    `Cargo: ${ctx.cargo}`,
    ctx.area && `Área: ${ctx.area}`,
    ctx.senioridade && `Senioridade: ${ctx.senioridade}`,
    ctx.modelo && `Modelo de trabalho: ${ctx.modelo}`,
    ctx.local && `Local: ${ctx.local}`,
    // Sem "perguntar pretensão" não há faixa no contexto — e sem faixa não há o que responder.
    ctx.faixaSalarial && `Faixa salarial: ${ctx.faixaSalarial}`,
    ctx.desafios.length && `Desafios dos primeiros meses: ${ctx.desafios.join("; ")}`,
    ctx.requisitos.length && `Requisitos: ${ctx.requisitos.join("; ")}`,
    `Duração desta conversa: cerca de ${ctx.duracaoMin} minutos`,
  ].filter((f): f is string => Boolean(f));
}

function conversaNoPrompt(falas: Troca[]): string {
  if (!falas.length) return "(nenhuma troca ainda)";
  return falas
    .slice(-MAX_FALAS_NO_PROMPT)
    .map((f) => `${f.papel === "entrevistadora" ? "Entrevistadora" : "Candidato"}: ${f.texto}`)
    .join("\n");
}

async function escreverFala({
  ctx,
  plano,
  falas,
  passo,
  primeira,
}: {
  ctx: ContextoRoteiro;
  plano: Roteiro;
  falas: Troca[];
  passo: Extract<PassoRoteiro, { tipo: "followup" | "pergunta" }>;
  primeira: boolean;
}): Promise<string> {
  const instrucao =
    passo.tipo === "followup"
      ? "Instrução deste turno: aprofunde a última resposta, pedindo um exemplo concreto."
      : `Instrução deste turno: faça a próxima pergunta do roteiro.\nPergunta planejada: ${passo.pergunta.pergunta}${passo.pergunta.foco ? `\nO que ela quer descobrir (NÃO diga isto em voz alta): ${passo.pergunta.foco}` : ""}`;

  const prompt = [
    "Fatos da vaga (o ÚNICO que você pode afirmar sobre ela):",
    fatosDaVaga(ctx).map((f) => `- ${f}`).join("\n"),
    "",
    "Roteiro planejado:",
    roteiroEmTexto(plano),
    "",
    "Conversa até agora:",
    conversaNoPrompt(falas),
    "",
    instrucao,
    primeira ? "Esta é a primeira fala da entrevista: cumprimente em uma frase antes de perguntar." : "A entrevista já começou: não cumprimente de novo.",
    `Tom: ${ctx.tom}`,
    ctx.candidato.primeiroNome ? `Nome do candidato: ${ctx.candidato.primeiroNome}` : "Não há nome de candidato: não invente um.",
    "",
    "Escreva a fala.",
  ].join("\n");

  const resposta = await askJSON<{ fala?: unknown }>({ system: SYSTEM_FALA, prompt, maxTokens: 400 });
  return corte(resposta?.fala);
}

/**
 * A fala deste turno, com o modelo quando ele está conectado e com o plano quando não está.
 *
 * O modelo aqui **escreve**, não decide: o passo já veio resolvido. Quando ele falha, a pergunta
 * planejada sai do jeito que foi escrita — uma entrevista que trava no meio custa muito mais ao
 * candidato do que uma pergunta menos costurada com a resposta anterior.
 */
async function falaDoPasso(args: {
  ctx: ContextoRoteiro;
  plano: Roteiro;
  falas: Troca[];
  passo: Extract<PassoRoteiro, { tipo: "followup" | "pergunta" }>;
  primeira: boolean;
}): Promise<string> {
  const reserva = args.passo.tipo === "followup" ? followUpDemo() : args.passo.pergunta.pergunta;
  if (!aiEnabled()) {
    await esperar(500);
    return reserva;
  }
  try {
    return (await escreverFala(args)) || reserva;
  } catch (err) {
    console.error("A entrevistadora não conseguiu escrever a fala deste turno; seguindo pelo roteiro planejado.", err);
    return reserva;
  }
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

function comoTrocas(falas: { papel: string; texto: string }[]): Troca[] {
  return falas.map((f) => ({ papel: f.papel === "candidato" ? "candidato" : "entrevistadora", texto: f.texto }));
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
 */
export async function proximaFala(entrevistaId: string, ultimaResposta?: string, ordem?: number): Promise<Fala> {
  const entrevista = obterEntrevista(entrevistaId);
  if (!entrevista) throw new Error(`Entrevista ${entrevistaId} não encontrada.`);
  const ctx = montarContexto(entrevistaId);
  if (!ctx) throw new Error(`A vaga ou o candidato da entrevista ${entrevistaId} não existe mais.`);

  const plano = await roteiroDaEntrevista(entrevistaId, ctx);

  let falas = comoTrocas(transcricao(entrevistaId));
  const resposta = (ultimaResposta ?? "").replace(/\s+/g, " ").trim();
  const guardadas = falas.filter((f) => f.papel === "candidato").length;
  const ultima = falas[falas.length - 1];
  const repetida =
    typeof ordem === "number" && Number.isFinite(ordem)
      ? guardadas >= ordem
      : ultima?.papel === "candidato" && ultima.texto === resposta;
  if (resposta && !repetida) {
    registrarMensagem({ entrevistaId, papel: "candidato", texto: resposta });
    falas = [...falas, { papel: "candidato", texto: resposta }];
    if (entrevista.status === "convidada" || entrevista.status === "aberta") mudarStatus(entrevistaId, "em_andamento");
  }

  // Recarregou a página sem nada novo a dizer: repete a pergunta em que a conversa parou.
  const agora = falas[falas.length - 1];
  if (!resposta && agora?.papel === "entrevistadora") {
    const posicao = posicaoNoRoteiro(plano, falas.slice(0, -1), ctx.numeroPerguntas);
    const passo = decidirPasso({ plano, posicao, resposta: posicao.ultimaResposta, numeroPerguntas: ctx.numeroPerguntas });
    return {
      pergunta: agora.texto,
      encerrar: passo.tipo === "encerrar",
      indice: passo.tipo === "encerrar" ? posicao.feitas : posicao.feitas + 1,
      total: plano.perguntas.length,
      transcricao: falas,
    };
  }

  const posicao = posicaoNoRoteiro(plano, falas, ctx.numeroPerguntas);
  const passo = decidirPasso({ plano, posicao, resposta: posicao.ultimaResposta, numeroPerguntas: ctx.numeroPerguntas });
  const texto =
    passo.tipo === "encerrar"
      ? plano.despedida
      : await falaDoPasso({ ctx, plano, falas, passo, primeira: posicao.feitas === 0 });

  registrarMensagem({ entrevistaId, papel: "entrevistadora", texto });
  return {
    pergunta: texto,
    encerrar: passo.tipo === "encerrar",
    indice: passo.tipo === "encerrar" ? posicao.feitas : posicao.feitas + 1,
    total: plano.perguntas.length,
    transcricao: [...falas, { papel: "entrevistadora", texto }],
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

/** A próxima fala de uma conversa que não tem entrevista no banco: a prévia do gestor e os links
 * antigos (tipo `scorecard`), que carregam a conversa no próprio navegador. */
export async function falaAvulsa(ctx: ContextoRoteiro, plano: Roteiro, historico: Troca[]): Promise<Fala> {
  const posicao = posicaoNoRoteiro(plano, historico, ctx.numeroPerguntas);
  const passo = decidirPasso({ plano, posicao, resposta: posicao.ultimaResposta, numeroPerguntas: ctx.numeroPerguntas });
  const texto =
    passo.tipo === "encerrar" ? plano.despedida : await falaDoPasso({ ctx, plano, falas: historico, passo, primeira: posicao.feitas === 0 });
  return {
    pergunta: texto,
    encerrar: passo.tipo === "encerrar",
    indice: passo.tipo === "encerrar" ? posicao.feitas : posicao.feitas + 1,
    total: plano.perguntas.length,
    transcricao: [...historico, { papel: "entrevistadora", texto }],
  };
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
