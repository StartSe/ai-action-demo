export type Severidade = "alta" | "média" | "baixa";

export const PAPEIS: { valor: string; rotulo: string }[] = [
  { valor: "contratante", rotulo: "Contratante" },
  { valor: "contratado", rotulo: "Contratado" },
  { valor: "locatário", rotulo: "Locatário" },
  { valor: "locador", rotulo: "Locador" },
  { valor: "comprador", rotulo: "Comprador" },
  { valor: "vendedor", rotulo: "Vendedor" },
  { valor: "outro", rotulo: "Outro" },
];

export interface Parte {
  nome: string;
  papel: string;
}

export interface PrazoCritico {
  evento: string;
  prazo: string;
}

export interface ClausulaRisco {
  clausula: string;
  trecho: string;
  risco: string;
  severidade: Severidade;
  sugestao_negociacao: string;
}

/** Dados de entrada guardados no histórico (lib/historico.ts); o texto do contrato não é persistido, só fica em memória em lib/estado.ts. */
export interface EntradaAnalise {
  papel: string;
  preocupacao: string;
}

export interface Analise {
  tipo_contrato: string;
  resumo_executivo: string;
  partes: Parte[];
  objeto: string;
  valor_e_pagamento: string;
  vigencia_e_rescisao: string;
  nota_risco: number;
  prazos_criticos: PrazoCritico[];
  clausulas_risco: ClausulaRisco[];
  obrigacoes_principais: string[];
  pontos_ausentes: string[];
  perguntas_para_o_juridico: string[];
}
