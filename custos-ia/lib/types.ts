// Tipos do domínio deste app: gasto com ferramentas de IA (faturas), orçamento planejado e a leitura
// (gasto do período comparado ao planejado) que o painel mostra.

export type Moeda = "BRL" | "USD" | "EUR";

/** Uma nota/fatura de uma ferramenta de IA, lançada manualmente (US-019) ou lida por e-mail/PDF (histórias futuras). */
export interface Fatura {
  id: string;
  fornecedor: string;
  ferramenta: string;
  categoria: string;
  valor: number;
  moeda: Moeda;
  /** Valor já convertido para reais, na cotação em vigor no momento do lançamento. */
  valorBRL: number;
  /** Data da fatura, formato AAAA-MM-DD. */
  data: string;
  periodicidade: "mensal" | "anual" | "unica";
  origem: "email" | "upload" | "manual";
  referencia?: string;
  criadoEm: string;
}

/** Orçamento mensal planejado para um item (uma ferramenta, um time ou um total geral — livre para o CFO decidir). */
export interface Orcamento {
  item: string;
  valorMensalBRL: number;
}

export interface GastoPorFerramenta {
  ferramenta: string;
  totalBRL: number;
  /** true quando existe um item de orçamento para esta ferramenta e o gasto do período o ultrapassa. */
  acimaDoPlanejado: boolean;
}

export interface GastoPorMes {
  /** AAAA-MM. */
  mes: string;
  rotulo: string;
  gastoBRL: number;
  planejadoBRL: number;
}

export interface Alerta {
  titulo: string;
  nivel: "alta" | "media" | "baixa";
  descricao: string;
}

/** Leitura do gasto com IA de um período, comparado ao orçamento planejado. */
export interface Leitura {
  /** Rótulo do mês de referência (o mês mais recente do período), ex.: "setembro de 2026". */
  mesAtual: string;
  totalBRL: number;
  planejadoBRL: number;
  /** Variação percentual do último mês fechado contra o mês anterior. */
  variacaoMesAnterior: number;
  porFerramenta: GastoPorFerramenta[];
  porMes: GastoPorMes[];
  alertas: Alerta[];
}

export type Periodo = "mes" | "3meses" | "ano";

/** Resultado de uma importação das notas do Gmail (POST /api/faturas/importar): o que foi lido, o que
 * virou fatura (já gravada, origem "email") e o que foi ignorado, com os motivos agrupados. */
export interface ResultadoImportacao {
  dias: number;
  lidas: number;
  reconhecidas: number;
  ignoradas: number;
  faturas: Fatura[];
  motivos: { motivo: string; quantidade: number }[];
  /** true quando havia mais mensagens no período do que o limite lido de uma vez. */
  truncado: boolean;
}

export interface DadosLeitura {
  periodo: Periodo;
}
