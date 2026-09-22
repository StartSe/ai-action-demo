// Tipos do domínio: classificação de lançamentos novos pelo padrão de um histórico já classificado.
// O vocabulário de categorias nunca é fixo no código — vem sempre da coluna "categoria" do CSV de
// histórico que a pessoa envia (ver lib/classificador.ts).

export type NivelConfianca = "alta" | "media" | "baixa";

/** Uma linha do CSV de histórico: um lançamento que a empresa já classificou corretamente. */
export interface LancamentoHistorico {
  data: string;
  descricao: string;
  valor: number;
  categoria: string;
}

/** Uma linha do CSV de lançamentos novos, ainda sem categoria. */
export interface LancamentoNovo {
  id: string;
  data: string;
  descricao: string;
  valor: number;
}

/** Um lançamento novo já classificado (ou marcado para revisar). */
export interface LancamentoClassificado {
  id: string;
  data: string;
  descricao: string;
  valor: number;
  /** null quando revisar é true: nunca uma categoria forçada sem precedente claro no histórico. */
  categoriaSugerida: string | null;
  confianca: NivelConfianca;
  /** true quando não há um lançamento parecido o suficiente no histórico para sustentar uma categoria. */
  revisar: boolean;
  /** Descrição literal de um ou mais lançamentos do histórico que sustentam a categoria sugerida. */
  citacoes: string[];
  /** Frase curta explicando o padrão encontrado (ou por que ficou para revisar). */
  justificativa: string;
}

export interface ResultadoClassificacao {
  lancamentos: LancamentoClassificado[];
  totalNovos: number;
  totalRevisar: number;
  /** Vocabulário de categorias encontrado no histórico enviado (nunca uma lista fixa do app). */
  categoriasEncontradas: string[];
  totalHistorico: number;
}

/** Guardado no histórico do app (lib/historico.ts) como "entrada" de um resultado salvo. */
export interface EntradaClassificacao {
  nomeHistorico: string;
  nomeNovos: string;
  totalHistorico: number;
}
