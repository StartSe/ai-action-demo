export type Tom = "acolhedor" | "objetivo";
export type Papel = "entrevistadora" | "candidato";
export type Recomendacao = "avançar" | "avaliar com o gestor" | "não avançar";

export interface Vaga {
  titulo: string;
  requisitos: string;
  candidato: string;
  tom: Tom;
  numero_perguntas: number;
}

export interface Troca {
  papel: Papel;
  texto: string;
}

export interface Criterio {
  criterio: string;
  nota: number;
  evidencia: string;
  /** Número (1-based) da pergunta da entrevistadora, na ordem da conversa, que originou esta evidência. Ausente quando não há uma correspondência clara. */
  pergunta?: number;
}

export interface Scorecard {
  nota_geral: number;
  resumo: string;
  criterios: Criterio[];
  pontos_fortes: string[];
  pontos_atencao: string[];
  recomendacao: Recomendacao;
  proximos_passos: string[];
}

export interface CandidatoRanking {
  id: string;
  candidato: string;
  nota_geral: number;
  recomendacao: Recomendacao;
  pontos_fortes: string[];
  pontos_atencao: string[];
}

export interface Ranking {
  vagaTitulo: string;
  candidatos: CandidatoRanking[];
}
