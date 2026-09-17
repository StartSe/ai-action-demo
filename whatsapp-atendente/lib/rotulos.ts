/**
 * Rótulos em português dos valores guardados no banco (canal da conversa, status e números internos).
 * Arquivo sem "use client" e sem node:sqlite: pode ser importado tanto por Client quanto por Server
 * Components. Ao somar um valor novo a `CanalOrigem` ou a `StatusConversa`, acrescente-o ao mapa daqui
 * — o `Record` completo faz o TypeScript cobrar o rótulo — em vez de escrever um ternário na tela.
 */
import { formatarTelefone } from "./telefone";
import type { CanalOrigem, Objetivo, StatusConversa, Tom } from "./types";

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

/** Nome do contato quando existir; senão o rótulo do número interno; senão o número formatado. */
export function rotuloContato(numero: string, nome?: string): string {
  if (nome?.trim()) return nome.trim();
  return rotuloNumero(numero);
}

export function rotuloNumero(numero: string): string {
  return NUMEROS_INTERNOS[numero] ?? formatarTelefone(numero);
}

/** Uma escolha do formulário do Assistente: o que o cartão diz em cima e a linha de apoio embaixo. */
export type Escolha = { titulo: string; apoio: string };

/** Os quatro objetivos, na ordem em que aparecem nos cartões de "O que ele deve fazer?". */
export const OBJETIVOS: Objetivo[] = ["atendimento", "vendas", "agendamentos", "outro"];

const ROTULOS_OBJETIVO: Record<Objetivo, Escolha> = {
  atendimento: { titulo: "Atendimento", apoio: "Tira dúvidas e informa" },
  vendas: { titulo: "Vendas", apoio: "Apresenta e ajuda a fechar" },
  agendamentos: { titulo: "Agendamentos", apoio: "Marca horários" },
  outro: { titulo: "Outro", apoio: "Você escreve o que ele faz" },
};

export function rotuloObjetivo(objetivo: Objetivo): Escolha {
  return ROTULOS_OBJETIVO[objetivo] ?? ROTULOS_OBJETIVO.atendimento;
}

/** Os três tons, na ordem em que aparecem nos cartões de "Tom de resposta". */
export const TONS: Tom[] = ["profissional", "amigavel", "personalizado"];

const ROTULOS_TOM: Record<Tom, Escolha> = {
  profissional: { titulo: "Profissional", apoio: "Clara e objetiva" },
  amigavel: { titulo: "Amigável", apoio: "Próxima e acolhedora" },
  personalizado: { titulo: "Personalizado", apoio: "Você define o estilo" },
};

export function rotuloTom(tom: Tom): Escolha {
  return ROTULOS_TOM[tom] ?? ROTULOS_TOM.profissional;
}
