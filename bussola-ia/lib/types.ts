export type TipoPergunta = "escala" | "escolha" | "texto";

export interface OpcaoPergunta {
  valor: string;
  rotulo: string;
}

export interface Pergunta {
  id: string;
  texto: string;
  dimensao: string;
  tipo: TipoPergunta;
  opcoes?: OpcaoPergunta[];
  peso?: number;
}

export interface Dimensao {
  id: string;
  nome: string;
}

export interface Questionario {
  titulo: string;
  dimensoes: Dimensao[];
  perguntas: Pergunta[];
}

export interface Resposta {
  id: string;
  respondente?: { area?: string; cargo?: string };
  valores: Record<string, string>;
  criadoEm: string;
}

export interface MediaDimensao {
  dimensao: string;
  media: number;
}

export interface Analise {
  resumo: string;
  nivelGeral: number;
  nomeEstagio: string;
  mediasPorDimensao: MediaDimensao[];
}

export interface Avaliacao {
  empresa: string;
  titulo: string;
  questionario: Questionario;
  respostas: Resposta[];
  analise?: Analise;
}

export interface DadosAvaliacao {
  empresa: string;
  titulo: string;
}
