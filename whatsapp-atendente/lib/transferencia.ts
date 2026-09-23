/**
 * Por que o atendente virtual passou a conversa para uma pessoa. Arquivo FOLHA e client-safe (sem
 * banco, sem IA, só tipos e texto): a tela desenha o rótulo, lib/atendente.ts escreve o prompt e lê
 * o marcador da resposta, lib/conversas.ts grava o valor, e todos leem daqui — um `Record` completo
 * por motivo, para somar um motivo novo virar erro de compilação em vez de rótulo em branco.
 *
 * O marcador é a última linha da resposta da IA: `[TRANSFERIR:motivo]`. O antigo `[TRANSFERIR]`
 * (sem motivo, até a 0.2.x) continua reconhecido e vale como "a base não tinha a informação".
 */

export type MotivoTransferencia = "cliente_pediu" | "sem_informacao" | "fora_do_escopo" | "reclamacao" | "falha";

export const MOTIVOS_TRANSFERENCIA: MotivoTransferencia[] = ["cliente_pediu", "sem_informacao", "fora_do_escopo", "reclamacao", "falha"];

/** O motivo de um `[TRANSFERIR]` sem motivo (respostas de modelos que só conhecem o marcador antigo, e o caminho sem IA). */
export const MOTIVO_PADRAO: MotivoTransferencia = "sem_informacao";

/** O que o cliente recebe quando a IA falha numa conversa real, se a equipe não escreveu outra frase (`config.fraseFalha`). */
export const FRASE_FALHA_PADRAO = "Um momento, vou chamar uma pessoa da equipe para te ajudar.";

const ROTULOS: Record<MotivoTransferencia, string> = {
  cliente_pediu: "O cliente pediu uma pessoa",
  sem_informacao: "A base não tinha a informação",
  fora_do_escopo: "Fora do que o atendente faz",
  reclamacao: "Reclamação ou insatisfação",
  falha: "Falha ao responder",
};

/** Rótulo de tela do motivo ("A base não tinha a informação"). */
export function rotuloMotivo(motivo: MotivoTransferencia): string {
  return ROTULOS[motivo];
}

/**
 * Uma linha por motivo, para o prompt: é o que faz o modelo escolher o motivo certo em vez de repetir
 * sempre o primeiro da lista. "Falha" não entra — ele é gravado pelo app quando a IA não responde, e
 * nunca escolhido pelo modelo.
 */
export const MOTIVOS_PARA_O_PROMPT: Record<Exclude<MotivoTransferencia, "falha">, string> = {
  cliente_pediu: "o cliente pediu explicitamente para falar com uma pessoa, um humano ou um atendente",
  sem_informacao: "a pergunta é do assunto da empresa, mas a base de conhecimento não tem a informação para responder",
  fora_do_escopo: "o pedido não é algo que você faz (por exemplo, marcar, cancelar ou alterar algo que só a equipe pode fazer)",
  reclamacao: "o cliente reclama, está insatisfeito ou irritado com a empresa ou com o atendimento",
};

export function ehMotivo(valor: unknown): valor is MotivoTransferencia {
  return typeof valor === "string" && (MOTIVOS_TRANSFERENCIA as string[]).includes(valor);
}

/** O marcador, com ou sem motivo, no fim do texto (espaços e quebras depois dele não contam). */
const MARCADOR_NO_FIM = /\[\s*TRANSFERIR\s*(?::\s*([a-z_]+)\s*)?\]\s*$/i;

/**
 * Lê o motivo de transferência do fim da resposta da IA. `null` quando não há marcador (a resposta é
 * uma resposta normal); `[TRANSFERIR]` sem motivo e motivo desconhecido caem em `MOTIVO_PADRAO`.
 */
export function lerMotivo(texto: string): MotivoTransferencia | null {
  const casou = MARCADOR_NO_FIM.exec(texto.trim());
  if (!casou) return null;
  const motivo = casou[1]?.toLowerCase();
  return ehMotivo(motivo) ? motivo : MOTIVO_PADRAO;
}

/** A resposta sem o marcador do fim, para gravar e enviar ao cliente. */
export function semMarcador(texto: string): string {
  return texto.trim().replace(MARCADOR_NO_FIM, "").trim();
}

/**
 * Por que o atendente pediu ajuda, em primeira pessoa: é o que ele escreve na nota interna que deixa
 * na conversa ao transferir. Diferente de `rotuloMotivo`, que é o rótulo de tela ("A base não tinha a
 * informação"), esta é a metade de uma frase ("Pedi ajuda porque a base não tinha a informação").
 */
const PORQUE_PEDI_AJUDA: Record<MotivoTransferencia, string> = {
  cliente_pediu: "o cliente pediu para falar com uma pessoa",
  sem_informacao: "a base não tinha a informação",
  fora_do_escopo: "o pedido está fora do que eu faço",
  reclamacao: "o cliente registrou uma reclamação",
  falha: "não consegui responder",
};

/** Até onde a pergunta do cliente é citada na nota: o resto vira reticências (a conversa está logo acima). */
const PERGUNTA_NA_NOTA = 200;

/**
 * A nota interna que o atendente virtual deixa na conversa ao passar o atendimento para uma pessoa:
 * por que ele parou e qual era a pergunta, assinada por ele. Ela existe porque quem abre a conversa
 * depois precisa da razão em texto corrido, ao lado das mensagens — a linha do tempo diz que a
 * transferência aconteceu, e o cliente nunca vê nenhuma das duas.
 */
export function notaDaTransferencia({ motivo, pergunta, atendente }: { motivo: MotivoTransferencia; pergunta?: string | null; atendente?: string }): string {
  const limpa = (pergunta ?? "").trim().replace(/\s+/g, " ");
  const citada = limpa.length > PERGUNTA_NA_NOTA ? `${limpa.slice(0, PERGUNTA_NA_NOTA - 1)}…` : limpa;
  const frases = [`Pedi ajuda porque ${PORQUE_PEDI_AJUDA[motivo]}.`];
  if (citada) frases.push(`Pergunta: “${citada}”`);
  return `${frases.join(" ")} — ${atendente?.trim() || "O atendente"}`;
}

/**
 * Os destinos que a leitura do cartão "Por que o atendente pediu ajuda" (Relatórios, US-019) oferece.
 * Eles moram aqui, e não no JSX, porque `scripts/verificar-jargao.mjs` reprova um endereço de tela
 * escrito como propriedade dentro de `components/*.tsx` — mesma razão de `ACAO_CONECTAR_NUMERO` estar
 * em `lib/demo.ts`.
 */
const ACAO_COMPLETAR_BASE = { rotulo: "Completar o que ele sabe", url: "/assistente#conhecimento" };
const ACAO_REVISAR_OBJETIVO = { rotulo: "Revisar o que ele faz", url: "/assistente#o-que-faz" };
const ACAO_CONFERIR_IA = { rotulo: "Conferir a IA em Configurações", url: "/setup#openrouter" };

export interface LeituraDosMotivos {
  texto: string;
  acao?: { rotulo: string; url: string };
}

/** O que ler quando nenhuma conversa do período parou esperando uma pessoa. */
export const SEM_TRANSFERENCIAS: LeituraDosMotivos = { texto: "Nenhuma transferência no período." };

/**
 * O que o motivo mais frequente do período está dizendo, e o que fazer a respeito. Um `Record`
 * completo: somar um motivo novo vira erro de compilação em vez de cartão sem frase.
 */
const LEITURA: Record<MotivoTransferencia, LeituraDosMotivos> = {
  sem_informacao: { texto: "A maior parte veio de perguntas que a base não cobre. Vale completar em O que ele sabe.", acao: ACAO_COMPLETAR_BASE },
  fora_do_escopo: { texto: "Muitos clientes pedem algo fora do que o atendente faz. Revise o objetivo.", acao: ACAO_REVISAR_OBJETIVO },
  cliente_pediu: { texto: "Clientes preferem falar com uma pessoa. Está tudo certo com o atendente." },
  reclamacao: { texto: "A maior parte veio de reclamações. Vale ler essas conversas antes de mexer no atendente." },
  falha: { texto: "Houve falhas ao responder. Confira a IA em Configurações.", acao: ACAO_CONFERIR_IA },
};

/**
 * A frase de leitura do cartão de motivos: ela olha só para o motivo MAIS FREQUENTE do período (a
 * primeira barra), porque o cartão existe para apontar um próximo passo, e três conselhos ao mesmo
 * tempo não apontam nenhum. A lista já chega ordenada de `lib/metricas.ts`.
 */
export function leituraDosMotivos(motivos: { motivo: MotivoTransferencia; total: number }[]): LeituraDosMotivos {
  const dominante = motivos[0];
  return dominante ? LEITURA[dominante.motivo] : SEM_TRANSFERENCIAS;
}
