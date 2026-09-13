export type Registro = {
  data: Date;
  valor: number;
  categoria: string;
  descricao: string;
};

export type Mapeamento = {
  data: number;
  categoria: number;
  valor: number;
  descricao: number;
};

export type MesResumo = { mes: string; rotulo: string; total: number };
export type CategoriaResumo = { categoria: string; total: number };
export type LancamentoResumo = { data: string; categoria: string; descricao: string; valor: number };
export type CategoriaCrescimento = { categoria: string; anterior: number; atual: number; variacao: number };

export type Resumo = {
  quantidade: number;
  total: number;
  mediaMensal: number;
  meses: MesResumo[];
  categorias: CategoriaResumo[];
  variacaoUltimoMes: number;
  maioresLancamentos: LancamentoResumo[];
  categoriasQueCresceram: CategoriaCrescimento[];
  periodo: { inicio: string; fim: string };
};

export type Destaque = { titulo: string; detalhe: string; tipo: "alerta" | "oportunidade" | "neutro" };

export type Insights = {
  leitura_geral: string;
  destaques: Destaque[];
  perguntas_sugeridas: string[];
};

/** Entrada salva no histórico (lib/historico.ts): só o nome do arquivo, nunca os lançamentos. */
export type EntradaInsights = { nomeArquivo: string };
/** Saída salva no histórico: o resumo agregado e a leitura da IA (a amostra de lançamentos não é persistida). */
export type SaidaInsights = { resumo: Resumo; insights: Insights };
