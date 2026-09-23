// Porta de entrada do motor de cálculo. Quem precisa precificar importa daqui, não dos módulos
// soltos. Puro, sem node:*: a Bancada ("use client") e as rotas usam exatamente este código.
export * from "./tipos";
export * from "./unidades";
export * from "./rateio";
export * from "./custo";
export * from "./mercado";
export * from "./corredor";
export * from "./derivados";
export * from "./cascata";

import { calcularCorredor, precoSugerido, type Corredor } from "./corredor";
import { calcularDerivados, type Derivados } from "./derivados";
import { montarCascata, type Cascata } from "./cascata";
import type { Cenario } from "./tipos";

export type Precificacao = {
  corredor: Corredor;
  derivados: Derivados;
  cascata: Cascata;
};

/** Tudo o que a Bancada mostra, numa chamada. Roda a cada tecla; não faz nada além de conta. */
export function precificar(cenario: Cenario, preco: number): Precificacao {
  const corredor = calcularCorredor(cenario);
  return {
    corredor,
    derivados: calcularDerivados(corredor, preco),
    cascata: montarCascata(corredor, cenario.negocio, cenario.item.tipo, preco),
  };
}

export type PrecificacaoAutomatica = Precificacao & {
  /** true enquanto o preço está sendo derivado da margem-alvo, e não escolhido por alguém. */
  automatico: boolean;
};

/**
 * O preço de um item num canal, **automático até alguém escolher outro**.
 *
 * Enquanto a pessoa monta a ficha, o preço acompanha a margem-alvo: cada insumo, cada minuto de
 * tempo e cada ponto de perda empurram o preço junto, com imposto e taxa do canal já dentro da
 * conta. No instante em que ela arrasta o marcador ou digita um valor, o preço passa a ser dela e
 * para de seguir — voltar ao automático é apagar a escolha.
 *
 * Um preço escolhido de zero não existe: zero é "não escolhi", que é o que mantém o automático.
 */
export function precificarAutomatico(cenario: Cenario, escolhido?: number | null): PrecificacaoAutomatica {
  const corredor = calcularCorredor(cenario);
  const automatico = !(typeof escolhido === "number" && Number.isFinite(escolhido) && escolhido > 0);
  const preco = automatico ? precoSugerido(corredor) : (escolhido as number);
  return {
    corredor,
    derivados: calcularDerivados(corredor, preco),
    cascata: montarCascata(corredor, cenario.negocio, cenario.item.tipo, preco),
    automatico,
  };
}
