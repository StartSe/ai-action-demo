/**
 * Rótulos em português dos valores guardados no banco (canal da conversa, status e números internos).
 * Arquivo sem "use client" e sem node:sqlite: pode ser importado tanto por Client quanto por Server
 * Components. Ao somar um valor novo a `CanalOrigem` ou a `StatusConversa`, acrescente-o ao mapa daqui
 * — o `Record` completo faz o TypeScript cobrar o rótulo — em vez de escrever um ternário na tela.
 */
import type { CanalOrigem, StatusConversa } from "./types";

const ROTULOS_ORIGEM: Record<CanalOrigem, string> = {
  simulador: "Simulador",
  whatsapp: "WhatsApp",
  mcp: "Assistente de IA",
  exemplo: "Exemplo",
};

export function rotuloOrigem(origem: CanalOrigem): string {
  return ROTULOS_ORIGEM[origem] ?? ROTULOS_ORIGEM.simulador;
}

const ROTULOS_STATUS: Record<StatusConversa, string> = {
  ia: "Atendida pela IA",
  atencao: "Precisa de atenção",
  humano: "Em atendimento humano",
  resolvida: "Resolvida",
};

export function rotuloStatus(status: StatusConversa): string {
  return ROTULOS_STATUS[status] ?? ROTULOS_STATUS.ia;
}

/** "simulador"/"assistente-ia" são números fixos internos: nunca mostrar o valor cru em minúsculas. */
const NUMEROS_INTERNOS: Record<string, string> = {
  simulador: "Simulador",
  "assistente-ia": "Assistente de IA",
};

/** Nome do contato quando existir; senão o rótulo do número interno; senão o próprio número. */
export function rotuloContato(numero: string, nome?: string): string {
  if (nome?.trim()) return nome.trim();
  return NUMEROS_INTERNOS[numero] ?? numero;
}

export function rotuloNumero(numero: string): string {
  return NUMEROS_INTERNOS[numero] ?? numero;
}
