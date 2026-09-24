// A grade tem invariantes que o servidor reimpõe: se a tela produzir layout inválido, o painel
// salvo volta remontado e a pessoa perde o arranjo que fez. Estes testes são a garantia de que o
// editor só emite layout que sobrevive ao salvamento.
import { describe, expect, it } from "vitest";
import { mover, normalizar, podeRedimensionar, porLinha, redimensionar, trocar } from "./layout";
import type { ComponentePainel } from "./types";

/** Um indicador qualquer: aqui só interessam id e largura. */
function card(id: string, largura: 1 | 2 | 3 | 4): ComponentePainel {
  return {
    id,
    titulo: id,
    posicao: { linha: 0, coluna: 0, largura },
    tipo: "indicador",
    dados: { valor: 1, formato: "numero" },
  };
}

const posicoes = (cs: ComponentePainel[] | null) => cs?.map((c) => [c.id, c.posicao.linha, c.posicao.coluna, c.posicao.largura]);

describe("normalizar", () => {
  it("empacota à esquerda e quebra a linha quando não cabe", () => {
    const r = normalizar([card("a", 1), card("b", 1), card("c", 2), card("d", 2)]);
    expect(posicoes(r)).toEqual([
      ["a", 0, 0, 1],
      ["b", 0, 1, 1],
      ["c", 0, 2, 2],
      ["d", 1, 0, 2], // não cabia na linha 0: desceu
    ]);
  });

  it("nunca deixa a soma de largura passar de 4 numa linha", () => {
    const r = normalizar([card("a", 3), card("b", 3), card("c", 2)]);
    for (const linha of porLinha(r ?? [])) {
      expect(linha.reduce((s, c) => s + c.posicao.largura, 0)).toBeLessThanOrEqual(4);
    }
  });

  it("recusa o layout que estoura a última linha", () => {
    // Cinco cartões de largura 4 precisariam de 5 linhas; só existem as linhas 0 a 3.
    expect(normalizar([card("a", 4), card("b", 4), card("c", 4), card("d", 4), card("e", 4)])).toBeNull();
  });
});

describe("mover", () => {
  it("leva o cartão para o índice de destino e reempacota", () => {
    const r = mover([card("a", 1), card("b", 1), card("c", 1)], "c", 0);
    expect(r?.map((c) => c.id)).toEqual(["c", "a", "b"]);
    expect(posicoes(r)).toEqual([
      ["c", 0, 0, 1],
      ["a", 0, 1, 1],
      ["b", 0, 2, 1],
    ]);
  });

  it("devolve null quando não há mudança", () => {
    const cs = [card("a", 1), card("b", 1)];
    expect(mover(cs, "a", 0)).toBeNull();
    expect(mover(cs, "inexistente", 1)).toBeNull();
  });
});

describe("trocar", () => {
  it("troca dois cartões de lugar mantendo a largura de cada um", () => {
    const r = trocar([card("a", 1), card("b", 2), card("c", 1)], "a", "c");
    expect(r?.map((c) => c.id)).toEqual(["c", "b", "a"]);
    expect(r?.find((c) => c.id === "b")?.posicao.largura).toBe(2);
  });
});

describe("redimensionar", () => {
  it("muda a largura e reempacota o que vem depois", () => {
    const r = redimensionar([card("a", 1), card("b", 1), card("c", 1)], "a", 4);
    expect(posicoes(r)).toEqual([
      ["a", 0, 0, 4],
      ["b", 1, 0, 1],
      ["c", 1, 1, 1],
    ]);
  });

  it("recusa quando o resultado não caberia na grade", () => {
    const cheio = [card("a", 4), card("b", 4), card("c", 4), card("d", 1)];
    expect(redimensionar(cheio, "d", 4)).not.toBeNull(); // ainda cabe: linha 3
    const maisCheio = [card("a", 4), card("b", 4), card("c", 4), card("d", 1), card("e", 1)];
    expect(redimensionar(maisCheio, "d", 4)).toBeNull(); // empurraria "e" para a linha 4
  });

  it("podeRedimensionar responde sem aplicar a mudança", () => {
    const cs = [card("a", 1), card("b", 1)];
    expect(podeRedimensionar(cs, "a", 2)).toBe(true);
    expect(cs[0].posicao.largura).toBe(1); // não mexeu no original
  });
});
