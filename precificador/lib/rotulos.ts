// Como cada valor do domínio é escrito na tela. Puro, sem node:*: a Bancada, a carteira, a
// exportação e as ferramentas usam os mesmos rótulos, para "no vermelho" nunca virar "prejuízo" em
// um lugar e "abaixo do custo" em outro.
import type { Balde, Estado, ModoCapacidade, Regime, TipoItem } from "./precificacao";

export const ROTULO_ESTADO: Record<Estado, string> = {
  prejuizo: "No vermelho",
  "abaixo-do-alvo": "Abaixo do alvo",
  saudavel: "Saudável",
  "acima-do-teto": "Acima do teto",
};

/** Uma frase explicando o degrau, para o "por quê?" e para os avisos. */
export const EXPLICACAO_ESTADO: Record<Estado, string> = {
  prejuizo: "Este preço não cobre o custo mais o imposto e a taxa do canal.",
  "abaixo-do-alvo": "Dá lucro, mas menos do que a margem que você definiu.",
  saudavel: "Cobre o custo e entrega a margem que você definiu.",
  "acima-do-teto": "Está acima do valor que você declarou que o cliente aceita pagar.",
};

export const ROTULO_REGIME: Record<Regime, string> = {
  mei: "MEI",
  simples: "Simples Nacional",
  presumido: "Lucro presumido",
};

export const ROTULO_CAPACIDADE: Record<ModoCapacidade, string> = {
  unidades: "Unidades por mês",
  horas: "Horas por mês",
  ambos: "Unidades e horas",
};

export const ROTULO_BALDE: Record<Balde, string> = {
  produto: "Produtos",
  servico: "Serviços",
  ambos: "Os dois",
};

export const ROTULO_TIPO: Record<TipoItem, string> = {
  produto: "Produto",
  servico: "Serviço",
};

/**
 * Alíquota efetiva sugerida por anexo do Simples, na primeira faixa. É ponto de partida, não
 * verdade: o app sempre pede para confirmar com o contador, porque a alíquota efetiva sobe com o
 * faturamento dos últimos doze meses.
 */
export const ANEXOS_SIMPLES: { valor: string; rotulo: string; aliquota: number }[] = [
  { valor: "1", rotulo: "Anexo I — comércio", aliquota: 0.04 },
  { valor: "2", rotulo: "Anexo II — indústria", aliquota: 0.045 },
  { valor: "3", rotulo: "Anexo III — serviços em geral", aliquota: 0.06 },
  { valor: "4", rotulo: "Anexo IV — construção e limpeza", aliquota: 0.045 },
  { valor: "5", rotulo: "Anexo V — serviços técnicos", aliquota: 0.155 },
];
