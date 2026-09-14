// Tipos do domínio: time de vendas, cenários de cliente simulado, conversas coladas e a análise gerada.

export interface Vendedor {
  id: string;
  nome: string;
  email?: string;
  equipe?: string;
  criadoEm: string;
}

export interface Cenario {
  id: string;
  titulo: string;
  cliente: {
    nome: string;
    cargo: string;
    empresa: string;
    contexto: string;
  };
  objetivo: string;
  objecoes: string[];
  tom: string;
}

export interface LinhaTranscricao {
  papel: "vendedor" | "cliente";
  texto: string;
  /** Segundo da gravação em que a fala aconteceu; presente só quando a conversa vem de voz. */
  segundo?: number;
}

export interface Conversa {
  id: string;
  vendedorId?: string;
  cenarioId?: string;
  origem: "voz" | "texto" | "colada";
  transcricao: LinhaTranscricao[];
  duracaoSeg?: number;
  criadoEm: string;
}

export interface CriterioAnalise {
  nome: string;
  nota: number;
  evidencia: string;
  comoMelhorar: string;
}

export interface Analise {
  nota: number;
  criterios: CriterioAnalise[];
  pontosFortes: string[];
  oQueMelhorar: string[];
  momentos: string[];
  resumo: string;
}

/** Dados enviados pelo painel para pedir uma análise: a conversa colada mais, opcionalmente, quem vendeu e em qual cenário. */
export interface DadosAnalise {
  conversaColada: string;
  vendedorId?: string;
  cenarioId?: string;
  criterios?: string[];
}
