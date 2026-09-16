// Tipos do domínio. Arquivo puro (sem imports node:*): é lido tanto pelo cliente (app/page.tsx) quanto pelo servidor.

/** Sinais de intenção que o usuário pode marcar no perfil de cliente ideal. */
export type SinalIntencao = "mudou_de_cargo" | "empresa_contratando" | "publicou_sobre_tema" | "levantou_investimento";

export const SINAIS_INTENCAO: { valor: SinalIntencao; rotulo: string }[] = [
  { valor: "mudou_de_cargo", rotulo: "Mudou de cargo" },
  { valor: "empresa_contratando", rotulo: "Empresa contratando" },
  { valor: "publicou_sobre_tema", rotulo: "Publicou sobre o tema" },
  { valor: "levantou_investimento", rotulo: "Levantou investimento" },
];

export type Tom = "direto" | "consultivo" | "informal";

export const TONS: { valor: Tom; rotulo: string }[] = [
  { valor: "direto", rotulo: "Direto" },
  { valor: "consultivo", rotulo: "Consultivo" },
  { valor: "informal", rotulo: "Informal" },
];

/** Perfil de cliente ideal descrito pelo executivo de vendas. */
export interface Perfil {
  /** Cargos-alvo, separados por vírgula (texto livre). */
  cargos: string;
  /** Setores-alvo, separados por vírgula (texto livre). */
  setores: string;
  /** Sinais de intenção marcados; vazio significa "qualquer sinal". */
  sinais: SinalIntencao[];
  /** A proposta da empresa do usuário em uma frase. */
  proposta: string;
  remetente: { nome: string; empresa: string };
  tom: Tom;
}

export type OrigemLead = "prospecthalo" | "demo";

export interface Lead {
  id: string;
  nome: string;
  cargo: string;
  empresa: string;
  setor: string;
  linkedinUrl: string;
  /** O fato que justifica abordar agora (o sinal de intenção observado). */
  sinal: string;
  /** 0 a 100: quanto o lead combina com o perfil e quão forte é o sinal. */
  pontuacao: number;
  origem: OrigemLead;
}

/** Sequência de mensagens escrita para um lead: pedido de conexão, dois acompanhamentos e um e-mail opcional. */
export interface Sequencia {
  leadId: string;
  /** Pedido de conexão no LinkedIn: até 300 caracteres. */
  conexao: string;
  acompanhamento1: string;
  acompanhamento2: string;
  email?: { assunto: string; corpo: string };
}

/** "rascunho": só a lista de leads; "pronta": ao menos uma sequência escrita; "enviada": campanha criada no Prospect Halo. */
export type EstadoCampanha = "rascunho" | "pronta" | "enviada";

export interface Campanha {
  id: string;
  nome: string;
  leads: Lead[];
  sequencias: Sequencia[];
  estado: EstadoCampanha;
  /** Id da campanha no Prospect Halo, quando enviada. */
  externoId?: string;
}

/**
 * Chave estável do perfil (cargos + setores + sinais, sem diferenciar maiúsculas/espaços), para a rotina
 * "leads novos toda semana" separar os leads já entregues por perfil e a tela reconhecer uma rotina existente.
 */
export function chavePerfil(perfil: Pick<Perfil, "cargos" | "setores" | "sinais">): string {
  const lista = (v: string) => String(v || "").split(/[,;\n]/).map((x) => x.trim().toLowerCase()).filter(Boolean).sort().join(",");
  return [lista(perfil.cargos), lista(perfil.setores), [...(perfil.sinais || [])].sort().join(",")].join("|");
}

/** Quantos leads novos a rotina semanal entrega por vez. */
export const LEADS_POR_SEMANA = 10;

/** A partir desta pontuação o sinal é considerado forte (Destaque e chip verde). */
export const PONTUACAO_FORTE = 80;
/** Limite de caracteres do pedido de conexão no LinkedIn. */
export const LIMITE_CONEXAO = 300;

/** Um lead cuja sequência não pôde ser escrita nesta rodada (a IA falhou só para ele); a tela oferece "Escrever de novo". */
export type FalhaSequencia = { leadId: string; nome: string; mensagem: string };
