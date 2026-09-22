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
