export type Severidade = "alta" | "média" | "baixa";

export const PAPEIS: { valor: string; rotulo: string }[] = [
  { valor: "contratante", rotulo: "Contratante" },
  { valor: "contratado", rotulo: "Contratado" },
  { valor: "locatário", rotulo: "Locatário" },
  { valor: "locador", rotulo: "Locador" },
  { valor: "comprador", rotulo: "Comprador" },
  { valor: "vendedor", rotulo: "Vendedor" },
  { valor: "outro", rotulo: "Outro" },
];

export interface Parte {
  nome: string;
  papel: string;
}

/** Um prazo com data de calendário (real ou estimada), usado para "Adicionar ao calendário" e para o aviso de 30 dias antes. */
export interface Prazo {
  tipo: string;
  /** "AAAA-MM-DD"; estimada a partir de hoje quando o contrato não informa uma data de assinatura/início explícita. */
  data: string;
  /** Cláusula de origem e ação sugerida, em até 2 frases. */
  descricao: string;
}

export interface ClausulaRisco {
  clausula: string;
  trecho: string;
  risco: string;
  severidade: Severidade;
  sugestao_negociacao: string;
}

/** Uma cláusula que viola um item da política de contratos da empresa (lib/politica.ts). */
export interface ItemForaDaPolitica {
  item_da_politica: string;
  clausula: string;
  detalhe: string;
}

/** Um cartão de "O essencial": número curto em destaque (ex.: "R$ 48.000/mês", "24 meses", "30%") e até duas linhas de apoio. */
export interface ItemEssencial {
  numero: string;
  detalhe: string;
}

/** Dados de entrada guardados no histórico (lib/historico.ts); o texto do contrato não é persistido, só fica em memória em lib/estado.ts. */
export interface EntradaAnalise {
  papel: string;
  preocupacao: string;
}

export interface Analise {
  tipo_contrato: string;
  resumo_executivo: string;
  partes: Parte[];
  objeto: string;
  essencial: { valor_mensal: ItemEssencial; prazo: ItemEssencial; multa: ItemEssencial };
  nota_risco: number;
  prazos: Prazo[];
  clausulas_risco: ClausulaRisco[];
  obrigacoes_principais: string[];
  pontos_ausentes: string[];
  perguntas_para_o_juridico: string[];
  fora_da_politica: ItemForaDaPolitica[];
}
