/**
 * Rótulos em português dos valores guardados no banco (canal da conversa, status e números internos).
 * Arquivo sem "use client" e sem node:sqlite: pode ser importado tanto por Client quanto por Server
 * Components. Ao somar um valor novo a `CanalOrigem` ou a `StatusConversa`, acrescente-o ao mapa daqui
 * — o `Record` completo faz o TypeScript cobrar o rótulo — em vez de escrever um ternário na tela.
 */
import { formatarTelefone } from "./telefone";
import type { CanalOrigem, Objetivo, Periodo, StatusConversa, Tom } from "./types";

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

/** Os quatro status, na ordem do atendimento. */
export const STATUS: StatusConversa[] = ["ia", "atencao", "humano", "resolvida"];

/** O status escrito na barra de endereço; `undefined` (sem filtro) para ausente ou desconhecido. */
export function lerStatus(valor: string | null | undefined): StatusConversa | undefined {
  return STATUS.includes(valor as StatusConversa) ? (valor as StatusConversa) : undefined;
}

/** Classe do chip de cada status (globals.css). O azul de "Em atendimento humano" é próprio deste app. */
const CLASSES_STATUS: Record<StatusConversa, string> = {
  ia: "chip-positivo",
  atencao: "chip-media",
  humano: "chip-humano",
  resolvida: "chip-cinza",
};

export function classeStatus(status: StatusConversa): string {
  return CLASSES_STATUS[status] ?? CLASSES_STATUS.ia;
}

/** Os quatro períodos, na ordem em que aparecem no seletor; "7d" é o padrão das telas. */
export const PERIODOS: Periodo[] = ["hoje", "7d", "30d", "tudo"];

export const PERIODO_PADRAO: Periodo = "7d";

const ROTULOS_PERIODO: Record<Periodo, string> = {
  hoje: "Hoje",
  "7d": "Últimos 7 dias",
  "30d": "Últimos 30 dias",
  tudo: "Tudo",
};

export function rotuloPeriodo(periodo: Periodo): string {
  return ROTULOS_PERIODO[periodo] ?? ROTULOS_PERIODO[PERIODO_PADRAO];
}

/** O período escrito na barra de endereço, já conferido; o padrão cobre ausente e desconhecido. */
export function lerPeriodo(valor: string | null | undefined): Periodo {
  return PERIODOS.includes(valor as Periodo) ? (valor as Periodo) : PERIODO_PADRAO;
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

/** `true` quando o "número" da conversa é um nome fixo interno (o celular de teste, o assistente de
 * IA) em vez de um telefone de verdade: quem mostra uma linha "Telefone" precisa saber a diferença. */
export function numeroInterno(numero: string): boolean {
  return numero in NUMEROS_INTERNOS;
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
