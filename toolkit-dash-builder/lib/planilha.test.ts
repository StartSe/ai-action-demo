// A leitura da planilha é a fronteira onde um erro vira número errado no painel — e número errado
// que parece certo é o pior defeito possível neste app. Daí os testes concentrarem os formatos que
// aparecem numa exportação brasileira de verdade.
import { describe, expect, it } from "vitest";
import { decodificar, detectarFormato, lerData, lerNumero, lerPlanilha } from "./planilha";

describe("lerNumero", () => {
  it("lê o formato brasileiro com milhar e decimal", () => {
    expect(lerNumero("1.234,56")).toBe(1234.56);
    expect(lerNumero("R$ 21.572,39")).toBe(21572.39);
    expect(lerNumero("12,5%")).toBe(12.5);
  });

  it("lê o formato americano", () => {
    expect(lerNumero("1,234.56")).toBe(1234.56);
    expect(lerNumero("1234.56")).toBe(1234.56);
  });

  it("decide pelo último separador quando os dois aparecem", () => {
    expect(lerNumero("1.234.567,89")).toBe(1234567.89);
    expect(lerNumero("1,234,567.89")).toBe(1234567.89);
  });

  it("trata um separador só pelo número de casas à direita", () => {
    expect(lerNumero("12,5")).toBe(12.5); // duas casas: decimal
    expect(lerNumero("1.234")).toBe(1234); // três casas e mais de 3 dígitos: milhar
  });

  it("lê negativo entre parênteses, como sai de planilha financeira", () => {
    expect(lerNumero("(1.500,00)")).toBe(-1500);
  });

  it("recusa o que não é número", () => {
    expect(lerNumero("")).toBeNull();
    expect(lerNumero("Ana Silva")).toBeNull();
    expect(lerNumero("-")).toBeNull();
  });
});

describe("lerData", () => {
  it("lê o padrão brasileiro e o ISO", () => {
    expect(lerData("21/09/2026")).toBe("2026-09-21");
    expect(lerData("2026-09-21")).toBe("2026-09-21");
    expect(lerData("21/09/26")).toBe("2026-09-21");
  });

  it("lê mês e ano sem dia", () => {
    expect(lerData("09/2026")).toBe("2026-09");
    expect(lerData("Set/2026")).toBe("2026-09");
  });

  it("recusa o que não é data", () => {
    expect(lerData("Ana Silva")).toBeNull();
    expect(lerData("32/13/2026")).toBeNull();
  });
});

describe("lerPlanilha", () => {
  const csv = [
    "Data do pedido;Cliente;Canal;Valor da venda;Desconto %",
    "21/09/2026;Construtora Aurora;Indicação;R$ 21.572,39;11,9%",
    "15/08/2026;Rede Boa Mesa;Busca paga;R$ 8.310,00;7,1%",
    "03/08/2026;Clínica Vida Plena;Indicação;R$ 12.000,50;0%",
  ].join("\n");

  it("descobre o separador e tipa cada coluna", () => {
    const dados = lerPlanilha(csv, "vendas.csv");
    expect(dados.linhas).toHaveLength(3);
    expect(dados.colunas.map((c) => c.tipo)).toEqual(["data", "texto", "texto", "numero", "numero"]);
  });

  it("normaliza o cabeçalho em chave sem acento", () => {
    const dados = lerPlanilha(csv, "vendas.csv");
    expect(dados.colunas.map((c) => c.chave)).toEqual(["data_do_pedido", "cliente", "canal", "valor_da_venda", "desconto"]);
  });

  it("converte as células e normaliza a data", () => {
    const dados = lerPlanilha(csv, "vendas.csv");
    expect(dados.linhas[0].valor_da_venda).toBe(21572.39);
    expect(dados.linhas[0].data_do_pedido).toBe("2026-09-21");
  });

  it("reconhece dinheiro e percentual pelo cabeçalho e pelos valores", () => {
    const dados = lerPlanilha(csv, "vendas.csv");
    const valor = dados.colunas.find((c) => c.chave === "valor_da_venda");
    const desconto = dados.colunas.find((c) => c.chave === "desconto");
    expect(valor?.moeda).toBe(true);
    expect(desconto?.percentual).toBe(true);
  });

  it("conta os distintos, que é o que decide se a coluna serve de categoria", () => {
    const dados = lerPlanilha(csv, "vendas.csv");
    expect(dados.colunas.find((c) => c.chave === "canal")?.distintos).toBe(2);
    expect(dados.colunas.find((c) => c.chave === "cliente")?.distintos).toBe(3);
  });

  it("respeita aspas, inclusive com o separador e a quebra de linha dentro do campo", () => {
    const comAspas = 'Cliente,Observação,Valor\n"Aurora, Ltda","mora na rua A\nsegunda linha",100\n"Boa Mesa","simples",200';
    const dados = lerPlanilha(comAspas, "obs.csv");
    expect(dados.linhas).toHaveLength(2);
    expect(dados.linhas[0].cliente).toBe("Aurora, Ltda");
    expect(dados.linhas[0].observacao).toBe("mora na rua A\nsegunda linha");
  });

  it("aceita tabulação como separador", () => {
    const tsv = "Produto\tQuantidade\nPlano Pro\t12\nPlano Essencial\t7";
    const dados = lerPlanilha(tsv, "p.tsv");
    expect(dados.colunas).toHaveLength(2);
    expect(dados.linhas[0].quantidade).toBe(12);
  });

  it("ignora o BOM que o Excel escreve no começo do arquivo", () => {
    const dados = lerPlanilha("﻿Nome;Valor\nAna;10", "bom.csv");
    expect(dados.colunas[0].chave).toBe("nome");
  });

  it("conta como preenchido só o que converteu, e reporta o descarte", () => {
    // Um "N/A" no meio de números não é preenchimento: contar antes da conversão fazia a tela
    // prometer valores que as somas não usam.
    // 9 números e 1 "N/A": 90% converte, acima do limiar de 80%, então a coluna segue numérica.
    const linhas = ["Aulas;Nome", ...[8, 10, 12, 7, 9, 11, 6, 13, 5].map((n, i) => `${n};P${i}`), "N/A;Px"];
    const dados = lerPlanilha(linhas.join("\n"), "l.csv");
    const aulas = dados.colunas.find((c) => c.chave === "aulas");
    expect(aulas?.tipo).toBe("numero");
    expect(aulas?.preenchidos).toBe(9);
    expect(aulas?.descartados).toBe(1);
    expect(dados.linhas.at(-1)?.aulas).toBeNull();
  });

  it("não conta descarte numa coluna de texto", () => {
    const dados = lerPlanilha("Nome;Cidade\nAna;Santos\nBruno;", "t.csv");
    const cidade = dados.colunas.find((c) => c.chave === "cidade");
    expect(cidade?.preenchidos).toBe(1);
    expect(cidade?.descartados).toBe(0);
  });

  it("trata coluna de código como texto, preservando o zero à esquerda", () => {
    // "01310" virava 1310 e ainda aparecia somado num cartão "Total de CEP".
    const dados = lerPlanilha(["CEP;Cliente;Valor", "01310;Ana;10", "04567;Bruno;20"].join("\n"), "c.csv");
    const cep = dados.colunas.find((c) => c.chave === "cep");
    expect(cep?.tipo).toBe("texto");
    expect(cep?.identificador).toBe(true);
    expect(dados.linhas[0].cep).toBe("01310");
  });

  it("reconhece código pelo cabeçalho, mesmo sem zero à esquerda", () => {
    for (const rotulo of ["ID", "CPF", "CNPJ", "Telefone", "Matrícula", "student_id"]) {
      const dados = lerPlanilha([`${rotulo};Valor`, "1001;10", "1002;20"].join("\n"), "x.csv");
      expect(dados.colunas[0].tipo, rotulo).toBe("texto");
    }
  });

  it("trata ano de quatro dígitos como dimensão, não como medida", () => {
    const dados = lerPlanilha(["Ano;Receita", "2024;100", "2025;200", "2026;300"].join("\n"), "a.csv");
    expect(dados.colunas.find((c) => c.chave === "ano")?.tipo).toBe("texto");
    expect(dados.colunas.find((c) => c.chave === "receita")?.tipo).toBe("numero");
  });

  it("não confunde medida legítima com código", () => {
    // Nomes que contêm palavras vizinhas das da lista, e quantidades pequenas e distintas.
    const linhas = ["Número de aulas;Quantidade", ...Array.from({ length: 25 }, (_, i) => `${i + 1};${i + 40}`)];
    const dados = lerPlanilha(linhas.join("\n"), "q.csv");
    expect(dados.colunas.map((c) => c.tipo)).toEqual(["numero", "numero"]);
  });

  it("mede o comprimento do texto, que separa rótulo de prosa", () => {
    // Uma coluna de observação livre tem poucos valores distintos e passaria por categoria,
    // rendendo uma rosca de "receita por observação".
    const dados = lerPlanilha(
      ["Canal;Observação", "Indicação;cliente veio pelo evento da semana passada e pediu proposta", "Eventos;cliente veio pelo evento da semana passada e pediu proposta"].join("\n"),
      "o.csv",
    );
    const canal = dados.colunas.find((c) => c.chave === "canal");
    const obs = dados.colunas.find((c) => c.chave === "observacao");
    expect(canal?.comprimentoMedio).toBeLessThan(40);
    expect(obs?.comprimentoMedio).toBeGreaterThan(40);
  });

  it("recusa arquivo sem linha de dados e sem colunas separadas", () => {
    expect(() => lerPlanilha("Nome;Valor", "so-cabecalho.csv")).toThrow(/só tem o cabeçalho/);
    expect(() => lerPlanilha("uma coisa só\noutra", "sem-colunas.csv")).toThrow(/colunas separadas/);
  });
});

describe("decodificar", () => {
  it("lê UTF-8 quando os bytes são válidos", () => {
    const bytes = new TextEncoder().encode("Canal;Valor\nIndicação;10");
    const { texto, codificacao } = decodificar(bytes);
    expect(codificacao).toBe("utf-8");
    expect(texto).toContain("Indicação");
  });

  it("cai para windows-1252 no CSV que o Excel salva", () => {
    // "Indicação" em windows-1252: ç = 0xE7, ã = 0xE3. Em UTF-8 estrito esses bytes são inválidos.
    const bytes = Uint8Array.from([
      0x43, 0x61, 0x6e, 0x61, 0x6c, 0x3b, 0x56, 0x61, 0x6c, 0x6f, 0x72, 0x0a, // "Canal;Valor\n"
      0x49, 0x6e, 0x64, 0x69, 0x63, 0x61, 0xe7, 0xe3, 0x6f, 0x3b, 0x31, 0x30, // "Indicaç ão;10"
    ]);
    const { texto, codificacao } = decodificar(bytes);
    expect(codificacao).toBe("windows-1252");
    expect(texto).toContain("Indicação");
  });

  it("preserva as aspas curvas que o Excel põe na faixa do windows-1252", () => {
    // 0x93 e 0x94 são aspas curvas em windows-1252 e caracteres de controle em iso-8859-1.
    const bytes = Uint8Array.from([0x41, 0x3b, 0x93, 0x42, 0x94]);
    const { texto } = decodificar(bytes);
    expect(texto).toBe("A;“B”");
  });

  it("a coluna decodificada vira categoria com o acento certo", () => {
    const bytes = Uint8Array.from([
      0x43, 0x61, 0x6e, 0x61, 0x6c, 0x3b, 0x56, 0x61, 0x6c, 0x6f, 0x72, 0x0a,
      0x49, 0x6e, 0x64, 0x69, 0x63, 0x61, 0xe7, 0xe3, 0x6f, 0x3b, 0x31, 0x30, 0x0a,
      0x45, 0x76, 0x65, 0x6e, 0x74, 0x6f, 0x73, 0x3b, 0x32, 0x30,
    ]);
    const { texto, codificacao } = decodificar(bytes);
    const dados = lerPlanilha(texto, "e.csv", codificacao);
    expect(dados.codificacao).toBe("windows-1252");
    expect(dados.linhas[0].canal).toBe("Indicação");
  });
});

describe("detectarFormato", () => {
  it("reconhece xlsx pelos bytes de zip e manda salvar como CSV", () => {
    const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
    expect(detectarFormato("vendas.xlsx", zip)).toMatch(/CSV/);
  });

  it("deixa passar um CSV", () => {
    expect(detectarFormato("vendas.csv", new TextEncoder().encode("a;b\n1;2"))).toBeNull();
  });
});
