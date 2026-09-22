// Tipos do domínio: notas de perda extraídas do CSV e o agrupamento por motivo real.
export type NotaPerda = {
  /** Posição na lista enviada à IA (0-based) — é o que liga um grupo devolvido pela IA de volta ao texto original. */
  indice: number;
  /** Linha do CSV (1 = primeira linha de dados, para exibir no formato que a pessoa reconhece). */
  linha: number;
  texto: string;
  valor?: number;
  segmento?: string;
  data?: string;
};

export type Mapeamento = { nota: number; valor: number; segmento: number; data: number };

/** Um motivo real de perda, sempre sustentado por trechos reais das notas (nunca inventado). */
export type GrupoMotivo = {
  motivo: string;
  contagem: number;
  evidencias: string[];
};

export type AnalisePerdas = {
  resumo: string;
  totalNotas: number;
  /** Motivos com 3 ou mais notas. */
  grupos: GrupoMotivo[];
  /** Motivos com menos de 3 notas: nunca forçados dentro de um grupo maior por conveniência. */
  poucasOcorrencias: GrupoMotivo[];
  /** Notas vazias, ambíguas ou sem motivo de perda identificável, contadas à parte. */
  semMotivo: { contagem: number; evidencias: string[] };
};

export type EntradaAnalise = {
  nomeArquivo: string;
  totalLinhas: number;
  colunaNota: string;
  colunaValor?: string;
  colunaSegmento?: string;
  colunaData?: string;
};
