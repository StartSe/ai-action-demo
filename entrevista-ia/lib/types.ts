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

// ---------------------------------------------------------------------------------------------
// O parecer (US-019 da PRD). O tipo mora aqui, e não em lib/avaliacao.ts, porque lib/demo.ts precisa
// dele para o `parecerDemo` e lib/avaliacao.ts vai precisar de lib/demo.ts: um arquivo só de tipos,
// no fundo do grafo de imports, é o que impede esse ciclo de nascer.
// ---------------------------------------------------------------------------------------------

/** Como o candidato está em relação a um requisito da vaga. */
export type SituacaoRequisito = "atende" | "parcial" | "nao_atende" | "nao_abordado";

/** O que foi dito na conversa bate com o currículo / com o perfil público? */
export type SituacaoConsistencia = "confirmado" | "divergente" | "nao_verificavel";

export interface AderenciaRequisito {
  requisito: string;
  situacao: SituacaoRequisito;
  evidencia: string;
  /** Número (1-based) da pergunta da entrevistadora que originou a evidência. */
  pergunta?: number;
}

export interface CriterioTecnico {
  criterio: string;
  nota: number;
  evidencia: string;
  pergunta?: number;
}

/** Uma competência cultural da vaga. `nota: null` é "não abordado" — sem evidência comportamental na
 * conversa não se atribui nota a ninguém, e a tela mostra isso em cinza. */
export interface CriterioCultural {
  competencia: string;
  nota: number | null;
  evidencia: string;
  pergunta?: number;
}

export interface ItemConsistencia {
  afirmacao: string;
  fonte: "cv" | "web";
  situacao: SituacaoConsistencia;
  detalhe: string;
}

export interface Parecer {
  notaGeral: number;
  recomendacao: Recomendacao;
  /** Três frases: o que decide, sem ler o resto. */
  resumo: string;
  aderencia: AderenciaRequisito[];
  tecnico: CriterioTecnico[];
  cultura: CriterioCultural[];
  consistencia: ItemConsistencia[];
  pontosFortes: string[];
  pontosAtencao: string[];
  proximaEtapa: { perguntas: string[]; foco: string };
  /** Só quando a pretensão foi dita na conversa. */
  pretensao: { valor?: number; dentroDaFaixa?: boolean };
  /** Entrevista encerrada antes do fim: o parecer cobre só o que foi conversado. */
  parcial: boolean;
}
