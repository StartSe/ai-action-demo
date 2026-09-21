import { totalmem } from "node:os";

// O SDK carrega inferência local e processos de chamada mesmo sem conversa ativa.
// Reservamos margem para o site e uma chamada; isto não é uma garantia de capacidade.
export const MEMORIA_MINIMA_AGENTE = 2 * 1024 ** 3;

export function recursosVoz() {
  const restrita = process.constrainedMemory();
  const memoria = restrita > 0 ? Math.min(restrita, totalmem()) : totalmem();
  return { memoria, permiteAgente: memoria >= MEMORIA_MINIMA_AGENTE };
}
