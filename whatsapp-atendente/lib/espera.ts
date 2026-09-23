// Quanto tempo alguém está esperando uma pessoa, e quando isso passou do que a operação aceita (US-017).
//
// Arquivo FOLHA (só importa tipos), como lib/etiquetas.ts e lib/atalhos.ts: a tela precisa da mesma
// regra que a rota, e um componente não pode importar um módulo que abre banco. A marca de desde
// quando o cliente espera é `conversas.esperando_desde` (US-002); aqui só se lê essa data.
import { AVISO_ESPERA_PADRAO, AVISOS_ESPERA, type AvisoEsperaMin, type StatusConversa } from "./types";

/** Confere o limite salvo (ou o que veio do corpo de uma requisição): valor fora da lista vale o padrão. */
export function lerAvisoEspera(valor: unknown): AvisoEsperaMin {
  const n = Number(valor);
  return AVISOS_ESPERA.includes(n as AvisoEsperaMin) ? (n as AvisoEsperaMin) : AVISO_ESPERA_PADRAO;
}

/**
 * Há quantos minutos inteiros o cliente está esperando; `null` quando não há espera marcada (ou quando
 * a data é estranha). Zero é resposta válida: a espera começou neste minuto.
 */
export function minutosEsperando(desde: string | null | undefined, agora = Date.now()): number | null {
  if (!desde) return null;
  const inicio = new Date(desde).getTime();
  if (Number.isNaN(inicio)) return null;
  return Math.max(0, Math.floor((agora - inicio) / 60_000));
}

/**
 * Esta conversa está parada esperando uma pessoa? Duas situações contam: a IA pediu ajuda e ninguém
 * assumiu (`atencao`), ou alguém assumiu e o cliente escreveu de novo sem resposta (`humano` com
 * mensagem por ler). Uma conversa que a IA responde sozinha não está esperando ninguém.
 */
export function estaEsperando(status: StatusConversa, naoLidas: number): boolean {
  return status === "atencao" || (status === "humano" && naoLidas > 0);
}

/** Passou do que a operação aceita? Sem espera marcada, nunca passou. */
export function passouDoLimite(desde: string | null | undefined, limiteMin: number, agora = Date.now()): boolean {
  const minutos = minutosEsperando(desde, agora);
  return minutos !== null && minutos >= limiteMin;
}

/** A duração da espera em linguagem de gente: "3 min", "2 h 10 min", "3 dias". */
export function duracaoEspera(minutos: number): string {
  if (minutos < 1) return "menos de 1 min";
  if (minutos < 60) return `${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) {
    const resto = minutos % 60;
    return resto ? `${horas} h ${resto} min` : `${horas} h`;
  }
  const dias = Math.floor(horas / 24);
  return dias === 1 ? "1 dia" : `${dias} dias`;
}

/**
 * O texto que a lista e o cabeçalho da conversa mostram; `null` quando não há ninguém esperando (e aí a
 * lista volta a mostrar a hora da última mensagem).
 */
export function textoEspera(status: StatusConversa, naoLidas: number, desde: string | null | undefined, agora = Date.now()): string | null {
  if (!estaEsperando(status, naoLidas)) return null;
  const minutos = minutosEsperando(desde, agora);
  if (minutos === null) return null;
  return `Esperando há ${duracaoEspera(minutos)}`;
}
