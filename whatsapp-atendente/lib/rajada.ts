/**
 * Rajada de mensagens: quem escreve no WhatsApp manda "oi", "queria saber o preço", "da limpeza" em
 * três mensagens seguidas, e um atendente atento responde uma vez, ao conjunto — não três vezes, uma
 * por linha. Este módulo é essa espera: depois da última mensagem do cliente, a IA aguarda
 * `JANELA_RAJADA_MS` antes de responder; uma mensagem nova dentro da janela reinicia a contagem, e
 * quando a janela fecha `responderPendente` (lib/atendente.ts) responde à sequência inteira (as
 * mensagens já estão todas gravadas). É o mesmo padrão do Captain (Chatwoot), que agrupa anexos e
 * mensagens antes de responder.
 *
 * Só os canais reais passam por aqui. O simulador (`POST /api/simular`) e o MCP (`responder_pergunta`)
 * NÃO usam rajada: a resposta síncrona é o contrato deles — a tela e o assistente externo esperam a
 * resposta na mesma chamada.
 *
 * A espera é por número, em memória (um `Map` de temporizadores): este app roda num processo só (P8
 * da PRD). Reiniciar o processo no meio de uma janela perde a resposta pendente — limite conhecido.
 */
import { classificarEmSegundoPlano, responderPendente } from "./atendente";
import { marcarEnviada, marcarFalhaEnvio } from "./conversas";
import { atualizarResumoEmSegundoPlano } from "./memoria";
import type { CanalOrigem } from "./types";
import { enviarMensagem, ErroWhatsApp, registrarFalhaEnvio } from "./whatsapp";

/** Quanto tempo esperar, desde a última mensagem do cliente, antes de a IA responder. */
export const JANELA_RAJADA_MS = 3000;

const temporizadores = new Map<string, NodeJS.Timeout>();
/** Números com uma resposta sendo gerada agora: uma janela que fecha nesse meio tempo espera a vez. */
const emAndamento = new Set<string>();
/** Números cuja janela fechou enquanto uma resposta ainda estava sendo gerada: rodam de novo ao fim. */
const pendenteDepois = new Set<string>();

/**
 * Agenda (ou reagenda) a resposta da IA para este número: a mensagem já foi gravada por quem chamou, e
 * o webhook já devolveu 200. `janelaMs` existe para os testes não esperarem 3 s de verdade.
 */
export function agendarResposta(numero: string, origem: CanalOrigem, { janelaMs = JANELA_RAJADA_MS } = {}): void {
  const anterior = temporizadores.get(numero);
  if (anterior) clearTimeout(anterior);
  const t = setTimeout(() => {
    temporizadores.delete(numero);
    fecharJanela(numero, origem, janelaMs).catch((err) => console.error(`Erro ao responder a rajada de ${numero}:`, err));
  }, janelaMs);
  temporizadores.set(numero, t);
}

/** Há uma janela aberta para este número? (Exportado para os testes.) */
export function janelaAberta(numero: string): boolean {
  return temporizadores.has(numero);
}

async function fecharJanela(numero: string, origem: CanalOrigem, janelaMs: number): Promise<void> {
  if (emAndamento.has(numero)) {
    // A resposta anterior ainda está sendo escrita; quando ela terminar (e for descartada por causa da
    // mensagem nova), a sequência inteira é respondida de uma vez.
    pendenteDepois.add(numero);
    return;
  }
  emAndamento.add(numero);
  try {
    const { resposta, descartada, mensagemId } = await responderPendente(numero);
    if (resposta) {
      await enviar(numero, resposta, mensagemId);
      // Depois de a resposta sair: o assunto da conversa, para os relatórios (lib/atendente.ts), e o
      // resumo do começo de uma conversa longa, que a próxima resposta vai usar (lib/memoria.ts).
      classificarEmSegundoPlano(numero);
      atualizarResumoEmSegundoPlano(numero);
    } else if (descartada === "chegou mensagem nova do cliente" && !temporizadores.has(numero) && !pendenteDepois.has(numero)) {
      // A mensagem nova chegou sem reagendar (não deveria acontecer, mas a rajada não pode deixar o
      // cliente sem resposta): abre a janela de novo.
      agendarResposta(numero, origem, { janelaMs });
    }
  } finally {
    emAndamento.delete(numero);
    if (pendenteDepois.delete(numero)) agendarResposta(numero, origem, { janelaMs });
  }
}

/**
 * Manda a resposta pelo número real e grava na mensagem o que aconteceu: `enviada` com o id que o
 * provedor deu (é por ele que "entregue" e "lida" chegam depois) ou `falhou` com a frase de negócio —
 * a bolha da conversa aberta desenha os dois, e "Tentar de novo" parte do `falhou`.
 */
async function enviar(numero: string, resposta: string, mensagemId?: number): Promise<void> {
  try {
    const { idExterno } = await enviarMensagem(numero, resposta);
    if (mensagemId !== undefined) marcarEnviada(mensagemId, idExterno);
  } catch (err) {
    // O canal já recebeu o 200; aqui só sobra registrar o motivo em linguagem de negócio, para
    // "Dados para a equipe técnica" conseguir explicar por que o cliente não recebeu resposta.
    const mensagem = err instanceof ErroWhatsApp ? err.message : "Não foi possível enviar a resposta pelo número da empresa.";
    if (!(err instanceof ErroWhatsApp)) console.error("Falha inesperada ao responder pelo WhatsApp:", err);
    registrarFalhaEnvio(mensagem);
    if (mensagemId !== undefined) marcarFalhaEnvio(mensagemId, mensagem);
  }
}
