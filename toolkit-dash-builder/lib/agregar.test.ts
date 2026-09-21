// O agregador é quem transforma as linhas do arquivo nos números do painel. Um erro aqui não quebra
// a tela: entrega um painel bonito com a conta errada. Por isso cada agregação é conferida contra um
// valor calculado à mão no próprio teste.
import { describe, expect, it } from "vitest";
import { calcular, montarPainel } from "./agregar";
import { lerPlanilha, type Dados } from "./planilha";
import type { Receita } from "./receita";

const CSV = [
  "Data;Vendedor;Canal;Valor",
  "15/01/2026;Ana;Indicação;100",
  "20/01/2026;Bruno;Eventos;200",
  "10/02/2026;Ana;Indicação;300",
  "25/02/2026;Ana;Eventos;400",
  "05/03/2026;Bruno;Indicação;500",
].join("\n");

const dados: Dados = lerPlanilha(CSV, "teste.csv");
const posicao = { linha: 0, coluna: 0, largura: 1 as const };

describe("indicador", () => {
  it("soma a coluna inteira quando não há coluna de data", () => {
    const r: Receita = { id: "c1", titulo: "Total", posicao, tipo: "indicador", coluna: "valor", agregacao: "soma" };
    const c = calcular(r, dados);
    expect(c?.tipo).toBe("indicador");
    if (c?.tipo !== "indicador") throw new Error("tipo inesperado");
    expect(c.dados.valor).toBe(1500); // 100+200+300+400+500
    expect(c.dados.anterior).toBeUndefined(); // sem data não existe período anterior
  });

  it("com coluna de data, compara o último mês com o anterior", () => {
    const r: Receita = { id: "c1", titulo: "No mês", posicao, tipo: "indicador", coluna: "valor", agregacao: "soma", colunaData: "data", periodo: "mes" };
    const c = calcular(r, dados);
    if (c?.tipo !== "indicador") throw new Error("tipo inesperado");
    expect(c.dados.valor).toBe(500); // março
    expect(c.dados.anterior).toBe(700); // fevereiro: 300+400
  });

  it("conta linhas sem precisar de coluna numérica", () => {
    const r: Receita = { id: "c1", titulo: "Registros", posicao, tipo: "indicador", agregacao: "contagem" };
    const c = calcular(r, dados);
    if (c?.tipo !== "indicador") throw new Error("tipo inesperado");
    expect(c.dados.valor).toBe(5);
  });

  it("calcula média, mínimo, máximo e distintos", () => {
    const base = { id: "c1", titulo: "x", posicao, tipo: "indicador" as const, coluna: "valor" };
    const valor = (agregacao: "media" | "minimo" | "maximo") => {
      const c = calcular({ ...base, agregacao }, dados);
      if (c?.tipo !== "indicador") throw new Error("tipo inesperado");
      return c.dados.valor;
    };
    expect(valor("media")).toBe(300);
    expect(valor("minimo")).toBe(100);
    expect(valor("maximo")).toBe(500);
    const distintos = calcular({ ...base, coluna: "vendedor", agregacao: "distintos" }, dados);
    if (distintos?.tipo !== "indicador") throw new Error("tipo inesperado");
    expect(distintos.dados.valor).toBe(2);
  });

  it("marca o formato como moeda quando a coluna parece dinheiro", () => {
    const comReais = lerPlanilha("Cliente;Receita\nAna;R$ 10,00\nBruno;R$ 20,00", "r.csv");
    const c = calcular({ id: "c1", titulo: "Receita", posicao, tipo: "indicador", coluna: "receita", agregacao: "soma" }, comReais);
    if (c?.tipo !== "indicador") throw new Error("tipo inesperado");
    expect(c.dados.formato).toBe("moeda");
    expect(c.dados.prefixo).toBe("R$");
  });
});

describe("série", () => {
  it("agrupa por mês em ordem cronológica", () => {
    const r: Receita = { id: "c1", titulo: "Por mês", posicao, tipo: "linha", agruparPor: "data", periodo: "mes", coluna: "valor", agregacao: "soma" };
    const c = calcular(r, dados);
    if (c?.tipo !== "linha") throw new Error("tipo inesperado");
    expect(c.dados.pontos).toEqual([
      { rotulo: "Jan/26", valor: 300 },
      { rotulo: "Fev/26", valor: 700 },
      { rotulo: "Mar/26", valor: 500 },
    ]);
  });

  it("agrupa por trimestre", () => {
    const doisTrimestres = lerPlanilha(
      ["Data;Valor", "15/01/2026;100", "10/02/2026;200", "05/05/2026;300"].join("\n"),
      "t.csv",
    );
    const r: Receita = { id: "c1", titulo: "Por trimestre", posicao, tipo: "linha", agruparPor: "data", periodo: "trimestre", coluna: "valor", agregacao: "soma" };
    const c = calcular(r, doisTrimestres);
    if (c?.tipo !== "linha") throw new Error("tipo inesperado");
    expect(c.dados.pontos).toEqual([
      { rotulo: "T1/26", valor: 300 },
      { rotulo: "T2/26", valor: 300 },
    ]);
  });

  it("descarta a série quando o período inteiro cabe num balde só", () => {
    // Um gráfico de tendência com um ponto não diz nada: melhor não entregar o componente.
    const porAno: Receita = { id: "c1", titulo: "Por ano", posicao, tipo: "linha", agruparPor: "data", periodo: "ano", coluna: "valor", agregacao: "soma" };
    expect(calcular(porAno, dados)).toBeNull();
  });

  it("ordena ranking por valor, do maior para o menor", () => {
    const r: Receita = { id: "c1", titulo: "Ranking", posicao, tipo: "barra", agruparPor: "vendedor", coluna: "valor", agregacao: "soma", ordenar: "valor" };
    const c = calcular(r, dados);
    if (c?.tipo !== "barra") throw new Error("tipo inesperado");
    expect(c.dados.pontos).toEqual([
      { rotulo: "Ana", valor: 800 }, // 100+300+400
      { rotulo: "Bruno", valor: 700 }, // 200+500
    ]);
  });

  it("descarta o componente quando sobra menos de dois pontos", () => {
    const umaLinha = lerPlanilha("Cliente;Valor\nAna;10", "uma.csv");
    const r: Receita = { id: "c1", titulo: "x", posicao, tipo: "barra", agruparPor: "cliente", coluna: "valor", agregacao: "soma" };
    expect(calcular(r, umaLinha)).toBeNull();
  });
});

describe("distribuição", () => {
  it("soma por categoria", () => {
    const r: Receita = { id: "c1", titulo: "Por canal", posicao, tipo: "rosca", agruparPor: "canal", coluna: "valor", agregacao: "soma" };
    const c = calcular(r, dados);
    if (c?.tipo !== "rosca") throw new Error("tipo inesperado");
    expect(c.dados.fatias).toEqual([
      { rotulo: "Indicação", valor: 900 }, // 100+300+500
      { rotulo: "Eventos", valor: 600 }, // 200+400
    ]);
  });

  it("agrupa o excedente em Outros respeitando o limite", () => {
    const muitas = lerPlanilha(
      ["Cat;Valor", "a;10", "b;9", "c;8", "d;7", "e;6", "f;5", "g;4"].join("\n"),
      "m.csv",
    );
    const r: Receita = { id: "c1", titulo: "x", posicao, tipo: "pizza", agruparPor: "cat", coluna: "valor", agregacao: "soma", limite: 4 };
    const c = calcular(r, muitas);
    if (c?.tipo !== "pizza") throw new Error("tipo inesperado");
    expect(c.dados.fatias).toHaveLength(4);
    expect(c.dados.fatias[3]).toEqual({ rotulo: "Outros", valor: 22 }); // 7+6+5+4
  });
});

describe("tabela", () => {
  it("ordena pela coluna pedida e corta no limite", () => {
    const r: Receita = { id: "c1", titulo: "Maiores", posicao, tipo: "tabela", colunas: ["vendedor", "valor"], ordenarPor: "valor", ordem: "desc", limite: 2 };
    const c = calcular(r, dados);
    if (c?.tipo !== "tabela") throw new Error("tipo inesperado");
    expect(c.dados.linhas).toEqual([
      { vendedor: "Bruno", valor: 500 },
      { vendedor: "Ana", valor: 400 },
    ]);
  });
});

describe("montarPainel", () => {
  it("posiciona indicadores na linha 0 e gráficos na linha 1, sem estourar a grade", () => {
    const painel = montarPainel(
      {
        titulo: "T",
        resumo: "R",
        setor: "S",
        componentes: [
          { id: "c1", titulo: "a", posicao, tipo: "indicador", coluna: "valor", agregacao: "soma" },
          { id: "c2", titulo: "b", posicao, tipo: "indicador", agregacao: "contagem" },
          { id: "c3", titulo: "c", posicao, tipo: "linha", agruparPor: "data", periodo: "mes", coluna: "valor", agregacao: "soma" },
          { id: "c4", titulo: "d", posicao, tipo: "barra", agruparPor: "vendedor", coluna: "valor", agregacao: "soma" },
          { id: "c5", titulo: "e", posicao, tipo: "rosca", agruparPor: "canal", coluna: "valor", agregacao: "soma" },
        ],
      },
      dados,
    );
    const porLinha = (l: number) => painel.componentes.filter((c) => c.posicao.linha === l);
    expect(porLinha(0).every((c) => c.tipo === "indicador" && c.posicao.largura === 1)).toBe(true);
    expect(porLinha(1)).toHaveLength(2);
    for (const linha of [0, 1, 2, 3]) {
      const soma = porLinha(linha).reduce((s, c) => s + c.posicao.largura, 0);
      expect(soma).toBeLessThanOrEqual(4);
    }
  });

  it("renumera os ids em sequência", () => {
    const painel = montarPainel(
      { titulo: "T", resumo: "R", setor: "S", componentes: [{ id: "cX", titulo: "a", posicao, tipo: "indicador", coluna: "valor", agregacao: "soma" }] },
      dados,
    );
    expect(painel.componentes.map((c) => c.id)).toEqual(["c1"]);
  });
});
