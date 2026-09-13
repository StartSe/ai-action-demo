export type Sentimento = "positivo" | "neutro" | "negativo";
export type Nivel = "alto" | "médio" | "baixo";

/** De onde veio o comentário: pesquisa NPS pública, arquivo enviado ou ticket importado de um CRM/helpdesk via MCP. Sem essa marca (colar texto direto na tela), não aparece rótulo nenhum. */
export type OrigemComentario = "pesquisa" | "arquivo" | "ticket";

export interface Comentario {
  texto: string;
  nota?: number;
  origem?: OrigemComentario;
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

/** Uma citação real por trás de um tema, com a origem do comentário de onde ela veio (quando conhecida). */
export interface ExemploComOrigem {
  texto: string;
  origem?: OrigemComentario;
}

export interface Tema {
  tema: string;
  mencoes: number;
  sentimento_dominante: Sentimento;
  exemplos: ExemploComOrigem[];
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

/** Formato bruto de um tema como a IA (ou o modo demonstração) devolve: "exemplos" são só o texto citado, sem origem — a origem é resolvida depois, em lib/analise.ts, casando o texto com a lista de comentários enviada. */
export type TemaBruto = Omit<Tema, "exemplos"> & { exemplos: string[] };
export type AnaliseBruta = Omit<Analise, "nps" | "temas"> & { temas: TemaBruto[] };

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
