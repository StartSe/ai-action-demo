// O editor sem IA é o que responde ao ajuste conversando quando não há chave. Ele precisa acertar o
// componente certo — mexer no cartão errado é pior que não mexer — e, quando não entende, dizer que
// não entendeu em vez de chutar. Cada caso aqui nasceu de um erro visto rodando.
import { describe, expect, it } from "vitest";
import { editarReceitasSemIA } from "./refinar-receitas";
import { lerPlanilha } from "./planilha";
import type { EspecReceitas } from "./receita";

const dados = lerPlanilha(
  ["Data;Vendedor;Canal;UF;Valor", "15/01/2026;Ana;Indicação;SP;100", "10/02/2026;Bruno;Eventos;RJ;200", "05/03/2026;Ana;Eventos;SP;300"].join("\n"),
  "vendas.csv",
);

const posicao = { linha: 0, coluna: 0, largura: 1 as const };
const espec = (): EspecReceitas => ({
  titulo: "Painel",
  resumo: "r",
  setor: "Dados",
  componentes: [
    { id: "c1", titulo: "Valor no mês", posicao, tipo: "indicador", coluna: "valor", agregacao: "soma", colunaData: "data", periodo: "mes" },
    { id: "c2", titulo: "Valor da venda por mês", posicao, tipo: "linha", agruparPor: "data", periodo: "mes", coluna: "valor", agregacao: "soma" },
    { id: "c3", titulo: "Valor da venda por Canal", posicao, tipo: "barra", agruparPor: "canal", coluna: "valor", agregacao: "soma" },
    { id: "c4", titulo: "Maiores por Valor", posicao, tipo: "tabela", colunas: ["vendedor", "valor"], ordenarPor: "valor", ordem: "desc" },
  ],
});

const achar = (r: EspecReceitas, id: string) => r.componentes.find((c) => c.id === id);

describe("trocar o tipo", () => {
  it("troca o gráfico citado, não o que apenas compartilha a palavra 'por'", () => {
    // Antes da lista de palavras vazias, "por" casava com "Valor da venda por mês" e o ajuste caía
    // no gráfico errado.
    const r = editarReceitasSemIA(espec(), "troque o grafico de barras por rosca", dados);
    if (r.tipo !== "ok") throw new Error(r.mensagem);
    expect(achar(r.receitas, "c3")?.tipo).toBe("rosca");
    expect(achar(r.receitas, "c2")?.tipo).toBe("linha");
  });

  it("preserva a coluna e a agregação ao converter", () => {
    const r = editarReceitasSemIA(espec(), "troque as barras por pizza", dados);
    if (r.tipo !== "ok") throw new Error(r.mensagem);
    const c = achar(r.receitas, "c3");
    expect(c).toMatchObject({ tipo: "pizza", agruparPor: "canal", coluna: "valor", agregacao: "soma" });
  });

  it("recusa converter indicador ou tabela", () => {
    expect(editarReceitasSemIA(espec(), "troque a tabela por pizza", dados).tipo).toBe("esclarecimento");
  });
});

describe("tirar", () => {
  it("remove o componente citado e renumera os ids", () => {
    const r = editarReceitasSemIA(espec(), "tire a tabela", dados);
    if (r.tipo !== "ok") throw new Error(r.mensagem);
    expect(r.receitas.componentes).toHaveLength(3);
    expect(r.receitas.componentes.map((c) => c.id)).toEqual(["c1", "c2", "c3"]);
    expect(r.receitas.componentes.some((c) => c.tipo === "tabela")).toBe(false);
  });

  it("pede o título quando não dá para saber qual cartão é", () => {
    expect(editarReceitasSemIA(espec(), "tire aquilo ali", dados).tipo).toBe("esclarecimento");
  });
});

describe("acrescentar", () => {
  it("acrescenta indicador da coluna numérica citada", () => {
    const r = editarReceitasSemIA(espec(), "acrescente o total de valor", dados);
    if (r.tipo !== "ok") throw new Error(r.mensagem);
    const novo = r.receitas.componentes[r.receitas.componentes.length - 1];
    expect(novo).toMatchObject({ tipo: "indicador", coluna: "valor", agregacao: "soma" });
  });

  it("usa média quando a pessoa pede média", () => {
    const r = editarReceitasSemIA(espec(), "acrescente a media de valor", dados);
    if (r.tipo !== "ok") throw new Error(r.mensagem);
    expect(r.receitas.componentes.at(-1)).toMatchObject({ agregacao: "media" });
  });

  it("usa média em coluna de percentual, mesmo quando pedem o total", () => {
    // Somar 1.200 descontos rendia "550,8%" na tela — um número sem significado nenhum.
    const comPercentual = lerPlanilha(
      ["Data;Canal;Valor;Desconto %", "15/01/2026;Indicação;100;10,0%", "10/02/2026;Eventos;200;20,0%"].join("\n"),
      "d.csv",
    );
    const r = editarReceitasSemIA(espec(), "acrescente o total de desconto", comPercentual);
    if (r.tipo !== "ok") throw new Error(r.mensagem);
    expect(r.receitas.componentes.at(-1)).toMatchObject({ coluna: "desconto", agregacao: "media" });
  });

  it("lista as colunas numéricas quando não identifica qual", () => {
    const r = editarReceitasSemIA(espec(), "acrescente um indicador", dados);
    expect(r.tipo).toBe("esclarecimento");
    if (r.tipo !== "esclarecimento") throw new Error("esperava esclarecimento");
    expect(r.mensagem).toContain("Valor");
  });
});

describe("agrupar", () => {
  it("reagrupa por coluna de duas letras como UF", () => {
    // "uf" tem 2 letras: com o corte antigo de 3, "agrupe por UF" não achava a coluna.
    const r = editarReceitasSemIA(espec(), "agrupe por UF", dados);
    if (r.tipo !== "ok") throw new Error(r.mensagem);
    expect(achar(r.receitas, "c2")).toMatchObject({ agruparPor: "uf" });
  });

  it("converte linha em barra ao reagrupar por categoria", () => {
    const r = editarReceitasSemIA(espec(), "agrupe por UF", dados);
    if (r.tipo !== "ok") throw new Error(r.mensagem);
    expect(achar(r.receitas, "c2")?.tipo).toBe("barra");
  });
});

describe("período", () => {
  it("muda o período da série temporal", () => {
    const r = editarReceitasSemIA(espec(), "mostre por trimestre", dados);
    if (r.tipo !== "ok") throw new Error(r.mensagem);
    expect(achar(r.receitas, "c2")).toMatchObject({ periodo: "trimestre" });
  });
});

describe("pedido não reconhecido", () => {
  it("explica o que sabe fazer em vez de chutar um ajuste", () => {
    const r = editarReceitasSemIA(espec(), "faca um rodizio de patos", dados);
    expect(r.tipo).toBe("esclarecimento");
    if (r.tipo !== "esclarecimento") throw new Error("esperava esclarecimento");
    expect(r.mensagem).toContain("Valor da venda por Canal");
  });
});
