// A decomposição do preço em barra empilhada: para onde vai cada real cobrado. Puro, sem node:*.
//
// A ordem é sempre a mesma, e é a ordem em que o dinheiro sai:
// preço → (−) imposto → (−) taxa do canal → (−) custo direto → (−) rateio fixo → lucro.
import type { Corredor } from "./corredor";
import { impostoPct } from "./rateio";
import type { Negocio, TipoItem } from "./tipos";

export type FatiaCascata = {
  chave: "imposto" | "canal" | "direto" | "rateio" | "lucro";
  rotulo: string;
  /** Em reais. A fatia de lucro é a única que pode ser negativa. */
  valor: number;
  /** Fatia do preço, em fração, para a largura da barra. */
  fracao: number;
};

export type Cascata = {
  preco: number;
  fatias: FatiaCascata[];
  /** true quando o lucro é negativo: a barra mostra o vermelho estourando o preço. */
  prejuizo: boolean;
};

export function montarCascata(corredor: Corredor, negocio: Negocio, tipo: TipoItem, preco: number): Cascata {
  const p = Number.isFinite(preco) ? Math.max(0, preco) : 0;
  const imposto = p * impostoPct(negocio, tipo);
  const canal = p * Math.max(0, corredor.taxaTotalPct - impostoPct(negocio, tipo)) + corredor.taxaFixaCanal;
  const direto = corredor.custo.direto;
  const rateio = corredor.custo.rateioFixo;
  const lucro = p - imposto - canal - direto - rateio;

  const bruto: Omit<FatiaCascata, "fracao">[] = [
    { chave: "imposto", rotulo: "Imposto", valor: imposto },
    { chave: "canal", rotulo: "Taxa do canal", valor: canal },
    { chave: "direto", rotulo: "Custo direto", valor: direto },
    { chave: "rateio", rotulo: "Custo fixo rateado", valor: rateio },
    { chave: "lucro", rotulo: "Lucro", valor: lucro },
  ];

  // A barra sempre soma 100% da largura. Com lucro, a base é o preço e as cinco fatias o dividem.
  // No prejuízo, a base é o que foi de fato consumido (maior que o preço): as quatro fatias de
  // custo tomam a barra inteira e a de lucro fica sem largura — o buraco é mostrado pelo valor
  // negativo e pelo sinalizador `prejuizo`, não por uma quinta faixa que estouraria o desenho.
  const consumido = imposto + canal + direto + rateio;
  const base = Math.max(p, consumido);
  return {
    preco: p,
    fatias: bruto.map((f) => ({ ...f, fracao: base > 0 && f.valor > 0 ? f.valor / base : 0 })),
    prejuizo: lucro < 0,
  };
}
