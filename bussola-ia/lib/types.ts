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

export interface LeituraDimensao {
  dimensao: string;
  leitura: string;
}

export interface Analise {
  resumo: string;
  nivelGeral: number;
  nomeEstagio: string;
  mediasPorDimensao: MediaDimensao[];
  /** Desvio padrão das médias por dimensão: quanto maior, mais desigual é a maturidade entre as dimensões. */
  dispersao: number;
  leituraPorDimensao: LeituraDimensao[];
  forcas: string[];
  lacunas: string[];
  proximosPassos: string[];
  /** Só presente quando pelo menos 2 áreas diferentes responderam, e há divergência relevante entre elas. */
  ondeDiscordam?: string[];
  /** Quem escreveu a leitura (resumo, forças, lacunas, passos): a IA, ou a leitura automática (sem IA) quando não há
   * chave ou a IA falhou. Ausente em registros antigos: vale "ia" quando meta.demo é false. */
  origemLeitura?: "ia" | "automatica";
  /** Só quando a IA falhou (402, 429, 5xx) e a leitura caiu na automática: frase curada para a tela avisar, com o motivo. */
  avisoIA?: string;
  /** Índices (em proximosPassos) já enviados ao quadro de tarefas conectado. */
  passosNoQuadro?: number[];
}

export interface Avaliacao {
  contexto?: ContextoAssessment;
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

export interface ContextoAssessment {
  grupoTipo: "empresa" | "area";
  grupoNome?: string;
  participantes?: number;
  objetivo?: string;
  setor?: string;
  porte?: string;
}
