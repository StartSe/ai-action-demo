// Operações de layout da grade, puras e sem React: mover um cartão, mudar a largura e reempacotar.
// Ficam separadas da tela porque são o tipo de regra que se quebra sem ninguém ver — a grade tem
// invariantes (soma de largura por linha ≤ 4, sem sobreposição, no máximo 4 linhas) que o validador
// do servidor vai reimpor de qualquer jeito. Melhor a tela já produzir layout válido do que
// descobrir no salvamento que o servidor remontou tudo.
//
// A grade do CSS é de fluxo (`painel-grade` + col-span): quem manda é a ORDEM dos componentes e a
// largura de cada um. `linha`/`coluna` são derivadas — é `normalizar()` que as recalcula.
// Sem import node:*.
import type { ComponentePainel, Posicao } from "./types";

export const COLUNAS = 4;
/** `validarPainel` reempacota o que passa da linha 3; o editor não deixa chegar lá. */
export const ULTIMA_LINHA = 3;

export type Largura = Posicao["largura"];

const LARGURAS: Largura[] = [1, 2, 3, 4];

export function larguraValida(n: number): Largura {
  const inteiro = Math.round(n);
  return (LARGURAS.find((l) => l === inteiro) ?? 1) as Largura;
}

/**
 * Recalcula `linha`/`coluna` de cada componente pela ordem do vetor, empacotando à esquerda e
 * quebrando a linha quando a largura não cabe. Devolve null quando o layout estoura a última linha:
 * quem chamou mantém o estado anterior em vez de entregar algo que o servidor vai desmontar.
 */
export function normalizar(componentes: ComponentePainel[]): ComponentePainel[] | null {
  let linha = 0;
  let coluna = 0;
  const saida: ComponentePainel[] = [];
  for (const c of componentes) {
    const largura = larguraValida(c.posicao.largura);
    if (coluna + largura > COLUNAS) {
      linha++;
      coluna = 0;
    }
    if (linha > ULTIMA_LINHA) return null;
    saida.push({ ...c, posicao: { linha, coluna, largura } } as ComponentePainel);
    coluna += largura;
  }
  return saida;
}

/** Move o componente `id` para a posição `destino` do vetor (o índice para onde ele foi arrastado). */
export function mover(componentes: ComponentePainel[], id: string, destino: number): ComponentePainel[] | null {
  const origem = componentes.findIndex((c) => c.id === id);
  if (origem < 0) return null;
  const alvo = Math.max(0, Math.min(componentes.length - 1, destino));
  if (alvo === origem) return null;
  const copia = [...componentes];
  const [movido] = copia.splice(origem, 1);
  copia.splice(alvo, 0, movido);
  return normalizar(copia);
}

/** Troca dois componentes de lugar, mantendo a largura de cada um. */
export function trocar(componentes: ComponentePainel[], a: string, b: string): ComponentePainel[] | null {
  const i = componentes.findIndex((c) => c.id === a);
  const j = componentes.findIndex((c) => c.id === b);
  if (i < 0 || j < 0 || i === j) return null;
  const copia = [...componentes];
  [copia[i], copia[j]] = [copia[j], copia[i]];
  return normalizar(copia);
}

/** Muda a largura de um componente. Devolve null quando o resultado não caberia na grade. */
export function redimensionar(componentes: ComponentePainel[], id: string, largura: number): ComponentePainel[] | null {
  const alvo = larguraValida(largura);
  const atual = componentes.find((c) => c.id === id);
  if (!atual || atual.posicao.largura === alvo) return null;
  return normalizar(componentes.map((c) => (c.id === id ? ({ ...c, posicao: { ...c.posicao, largura: alvo } } as ComponentePainel) : c)));
}

/** true quando dá para aumentar/diminuir sem estourar a grade — usado para desabilitar o botão. */
export function podeRedimensionar(componentes: ComponentePainel[], id: string, largura: number): boolean {
  return redimensionar(componentes, id, largura) !== null;
}

/** Os componentes agrupados por linha, na ordem — o que a tela precisa para desenhar as faixas de solta. */
export function porLinha(componentes: ComponentePainel[]): ComponentePainel[][] {
  const linhas: ComponentePainel[][] = [];
  for (const c of componentes) {
    const i = c.posicao.linha;
    while (linhas.length <= i) linhas.push([]);
    linhas[i].push(c);
  }
  return linhas;
}
