export type Sentimento = "positivo" | "neutro" | "negativo";
export type Nivel = "alto" | "médio" | "baixo";

export interface Comentario {
  texto: string;
  nota?: number;
}

export interface ContagemSentimento {
  positivo: number;
  neutro: number;
  negativo: number;
}

export interface Nps {
  promotores: number;
  neutros: number;
  detratores: number;
  score: number;
}

export interface Tema {
  tema: string;
  mencoes: number;
  sentimento_dominante: Sentimento;
  exemplo: string;
  acao_sugerida: string;
}

export interface Citacao {
  texto: string;
  sentimento: Sentimento;
}

export interface AcaoPrioritaria {
  acao: string;
  impacto: Nivel | string;
  esforco: Nivel | string;
  justificativa: string;
}

export interface Analise {
  resumo_executivo: string;
  sentimento: ContagemSentimento;
  nps: Nps | null;
  temas: Tema[];
  elogios_frequentes: string[];
  reclamacoes_frequentes: string[];
  citacoes_marcantes: Citacao[];
  acoes_prioritarias: AcaoPrioritaria[];
}

export interface RespostaAnalise {
  demo: boolean;
  truncado: boolean;
  total_enviado: number;
  total_analisado: number;
  analise: Analise;
}

/** Entrada salva no histórico (/r/[id], /imprimir/[id]) — os comentários brutos não são persistidos, só o contexto informado. */
export interface EntradaAnalise {
  contexto: string;
}

/** Saída salva no histórico: a análise da IA mais os números de volume desta rodada. */
export interface SaidaAnalise {
  analise: Analise;
  totalEnviado: number;
  totalAnalisado: number;
  truncado: boolean;
}
