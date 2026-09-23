// Tipos do domínio deste app. O modelo de dados em si mora em lib/precificacao/tipos.ts (puro, sem
// node:*, importável pelo navegador); aqui ficam só os formatos das três leituras que a IA produz.
//
// Princípio 4 do produto: a IA interpreta, nunca calcula. Nenhum tipo abaixo tem campo numérico —
// se a IA devolvesse um número, ele competiria com o motor, e um dos dois estaria errado.
export type { Balde, CanalVenda, Cenario, Estado, Item, LinhaCustoFixo, LinhaInsumo, ModoCapacidade, Negocio, PrecoCanal, Regime, TipoItem, Unidade } from "./precificacao";

/** Leitura do corredor de um item: o que aquele desenho quer dizer, em linguagem de dono de negócio. */
export interface LeituraCorredor {
  /** Duas ou três frases sobre onde o preço está e o que isso significa. */
  resumo: string;
  /** O que fazer, uma ação por item, no máximo três. */
  acoes: string[];
  /** O risco que essa faixa de preço traz, em uma frase. Ausente quando não há risco relevante. */
  risco?: string;
}

/** Interrogatório de custos esquecidos, disparado quando a ficha parece incompleta. */
export interface CustosEsquecidos {
  /** Uma pergunta por custo que costuma passar batido neste tipo de item. */
  perguntas: { pergunta: string; porque: string }[];
  /** Frase de abertura, uma só. */
  abertura: string;
}

/** Diagnóstico do mix: o que a carteira inteira está dizendo. */
export interface DiagnosticoMix {
  resumo: string;
  /** O que corrigir primeiro, com o nome do item. */
  prioridades: { item: string; observacao: string; acao: string }[];
  /** Um ponto forte do mix, para a leitura não ser só problema. */
  ponto_forte?: string;
}
