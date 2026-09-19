// Testes do parecer (lib/avaliacao.ts, US-022), fora do Next (`npm test`).
//
// O que se exercita aqui é o que o código garante POR CIMA do modelo — e nenhuma destas regras
// quebra tela nenhuma quando sai errada, ela só muda o que o gestor lê sobre uma pessoa de verdade:
//
//  - A lista de requisitos do parecer é a da VAGA. O que o modelo esqueceu de citar entra como "não
//    abordado"; um parecer com menos linhas do que a vaga tem exigências é lido como se tivesse
//    respondido tudo.
//  - Nota cultural só com evidência de comportamento. "Sou colaborativo" não é evidência.
//  - Nunca "avançar" com um requisito em "não atende".
//  - A pretensão dentro da faixa é uma conta, não um julgamento.
//
// As três chamadas ao modelo entram pelas costuras (`extrator`, `cruzador`, `redator`): assim o
// caminho exercitado é o de produção inteiro, e não o do modo demonstração.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
// Só o tipo: um `import type` é apagado na compilação e não carrega `lib/store.ts` antes da hora.
import type { Parecer } from "./types";

// `lib/store.ts` lê `DATA_DIR` no momento em que é importado: a variável vem ANTES dos imports do
// app, que por isso são dinâmicos.
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "entrevista-avaliacao-"));
delete process.env.OPENROUTER_API_KEY;

const { aplicarGuardas, avaliarEntrevista, contextoDaAvaliacao, cruzar, dentroDaFaixa, extrairFatos, montarParecer, redigirParecer, transcricaoNumerada } =
  await import("./avaliacao");
const { criar: criarCandidato } = await import("./candidatos");
const { criar: criarEntrevista, obter: obterEntrevista, registrarMensagem } = await import("./entrevistas");
const { obter: obterResultado } = await import("./historico");
const { criar: criarVaga } = await import("./vagas");

type Ctx = ReturnType<typeof contextoDaAvaliacao>;

const REQUISITOS = "Experiência com SaaS B2B\nHubSpot ou outro CRM\nInglês para reuniões";
const COMPETENCIAS = [
  { id: "colaboracao", nome: "Colaboração", descricao: "ajuda antes de ser pedido", origem: "empresa" as const },
  { id: "dono", nome: "Dono do resultado", descricao: "vai até o fim", origem: "empresa" as const },
];

let contador = 0;

/** Uma entrevista pronta para ser avaliada, com a conversa já gravada no servidor. */
function entrevistaPronta({ respostas = 4, salario = true }: { respostas?: number; salario?: boolean } = {}) {
  contador += 1;
  const vaga = criarVaga({
    cargo: `Analista de Customer Success ${contador}`,
    requisitos: REQUISITOS,
    competenciasCulturais: COMPETENCIAS,
    numeroPerguntas: 6,
    salarioMin: salario ? 5_500 : undefined,
    salarioMax: salario ? 7_000 : undefined,
    salarioACombinar: !salario,
  });
  const candidato = criarCandidato({ nome: `Pessoa ${contador} Sobrenome` });
  const entrevista = criarEntrevista({ vagaId: vaga.id, candidatoId: candidato.id, status: "em_andamento" });
  for (let i = 0; i < respostas; i++) {
    registrarMensagem({ entrevistaId: entrevista.id, papel: "entrevistadora", texto: `Pergunta ${i + 1}?` });
    registrarMensagem({
      entrevistaId: entrevista.id,
      papel: "candidato",
      texto: `Resposta ${i + 1}: cuidei de uma carteira de sessenta contas e reduzi o churn em dois pontos no trimestre.`,
    });
  }
  return { vaga, candidato, entrevista };
}

function contextoDe(extra: Partial<Ctx> = {}): Ctx {
  const { entrevista } = entrevistaPronta();
  return { ...contextoDaAvaliacao(entrevista.id), ...extra };
}

/** O que os três passos devolvem quando tudo vem certo — cada teste muda só o pedaço que interessa. */
const JULGAMENTO_BOM = {
  notaGeral: 8.4,
  recomendacao: "avançar",
  resumo: "Conversa consistente. Nada ficou aberto. O que disse bate com o currículo.",
  tecnico: [
    { criterio: "Experiência na função", nota: 8.5, evidencia: "carteira de sessenta contas", pergunta: 2 },
    { criterio: "Resultado com números", nota: 8.3, evidencia: "churn em dois pontos", pergunta: 3 },
    { criterio: "Clareza", nota: 8.4, evidencia: "respostas diretas", pergunta: 1 },
  ],
  cultura: [
    { competencia: "Colaboração", nota: 8 },
    { competencia: "Dono do resultado", nota: 9 },
  ],
  pontosFortes: ["Responde com situações reais.", "Fala de número sem ser perguntado."],
  pontosAtencao: ["Não falou de inglês."],
  proximaEtapa: { perguntas: ["Conte um caso que deu errado."], foco: "Confirmar inglês com o gestor." },
};

describe("transcricaoNumerada", () => {
  it("numera as perguntas da entrevistadora na ordem, para o parecer poder citá-las", () => {
    const texto = transcricaoNumerada([
      { papel: "entrevistadora", texto: "Primeira?" },
      { papel: "candidato", texto: "Sim." },
      { papel: "entrevistadora", texto: "Segunda?" },
    ]);
    assert.match(texto, /Pergunta 1: Primeira\?/);
    assert.match(texto, /Pergunta 2: Segunda\?/);
    assert.match(texto, /Resposta: Sim\./);
  });
});

describe("contextoDaAvaliacao", () => {
  it("recusa uma conversa curta demais para avaliar", () => {
    const { entrevista } = entrevistaPronta({ respostas: 1 });
    assert.throws(() => contextoDaAvaliacao(entrevista.id), /pouco para avaliar/);
  });

  it("deduz `parcial` da conversa, comparando com o combinado na vaga", () => {
    assert.equal(contextoDaAvaliacao(entrevistaPronta({ respostas: 3 }).entrevista.id).parcial, true);
    assert.equal(contextoDaAvaliacao(entrevistaPronta({ respostas: 6 }).entrevista.id).parcial, false);
  });

  it("não deixa a ficha da web entrar sem a identidade confirmada (D6)", () => {
    const ctx = contextoDaAvaliacao(entrevistaPronta().entrevista.id);
    assert.deepEqual(ctx.fichaWeb, []);
  });
});

describe("extrairFatos", () => {
  it("guarda só os fatos com texto e descarta número de pergunta que não existe na conversa", async () => {
    const ctx = contextoDe();
    const extracao = await extrairFatos(ctx, {
      extrator: async () => ({
        fatos: [
          { fato: "Cuida de 60 contas B2B", pergunta: 2 },
          { fato: "Inventado", pergunta: 99 },
          { fato: "   " },
        ],
        pretensao: { valor: 6200, trecho: "por volta de seis e duzentos" },
      }),
    });

    assert.equal(extracao.fatos.length, 2);
    assert.equal(extracao.fatos[0].pergunta, 2);
    // O índice fora da conversa vira um link para lugar nenhum na tela do parecer: sai.
    assert.equal(extracao.fatos[1].pergunta, undefined);
    assert.equal(extracao.pretensao.valor, 6200);
  });

  it("não trata zero como pretensão", async () => {
    const ctx = contextoDe();
    const extracao = await extrairFatos(ctx, { extrator: async () => ({ fatos: [], pretensao: { valor: 0 } }) });
    assert.equal(extracao.pretensao.valor, undefined);
  });
});

describe("cruzar", () => {
  it("devolve uma linha por requisito da vaga, mesmo quando o modelo esquece um", async () => {
    const ctx = contextoDe();
    const cruzamento = await cruzar(ctx, { fatos: [], pretensao: {} }, {
      cruzador: async () => ({
        requisitos: [{ requisito: "experiencia com saas b2b", situacao: "atende", evidencia: "sessenta contas", pergunta: 2 }],
        competencias: [],
      }),
    });

    assert.equal(cruzamento.requisitos.length, 3);
    // Casado pelo texto normalizado, mas quem manda no rótulo é a vaga.
    assert.equal(cruzamento.requisitos[0].requisito, "Experiência com SaaS B2B");
    assert.equal(cruzamento.requisitos[0].situacao, "atende");
    assert.equal(cruzamento.requisitos[2].situacao, "nao_abordado");
    assert.equal(cruzamento.competencias.length, 2);
    assert.equal(cruzamento.competencias[0].comportamental, false);
  });

  it("não carimba como conferido na web o que não tem perfil público confirmado", async () => {
    const ctx = contextoDe();
    const cruzamento = await cruzar(ctx, { fatos: [], pretensao: {} }, {
      cruzador: async () => ({
        consistencia: [{ afirmacao: "Trabalha na Acme", fonte: "web", situacao: "confirmado", detalhe: "o perfil diz o mesmo" }],
      }),
    });

    assert.equal(cruzamento.consistencia[0].fonte, "cv");
  });
});

describe("redigirParecer", () => {
  it("corta as listas nos limites do tipo e aceita a recomendação escrita de outro jeito", async () => {
    const ctx = contextoDe();
    const julgamento = await redigirParecer(ctx, { fatos: [], pretensao: {} }, { consistencia: [], requisitos: [], competencias: [] }, {
      redator: async () => ({
        ...JULGAMENTO_BOM,
        recomendacao: "Avançar",
        pontosFortes: ["a", "b", "c", "d", "e"],
        proximaEtapa: { perguntas: ["1", "2", "3", "4", "5", "6"], foco: "x" },
      }),
    });

    assert.equal(julgamento.recomendacao, "avançar");
    assert.equal(julgamento.pontosFortes.length, 4);
    assert.equal(julgamento.proximaEtapa.perguntas.length, 5);
  });
});

describe("montarParecer", () => {
  const cruzamentoBom = {
    consistencia: [],
    requisitos: [
      { requisito: "Experiência com SaaS B2B", situacao: "atende" as const, evidencia: "sessenta contas", pergunta: 2 },
      { requisito: "HubSpot ou outro CRM", situacao: "parcial" as const, evidencia: "usou Pipedrive" },
      { requisito: "Inglês para reuniões", situacao: "nao_abordado" as const, evidencia: "" },
    ],
    competencias: [
      { competencia: "Colaboração", evidencia: "montou o onboarding com o time de produto", pergunta: 3, comportamental: true },
      { competencia: "Dono do resultado", evidencia: "se considera dona do número", pergunta: 4, comportamental: false },
    ],
  };

  it("dá nota cultural só com evidência de comportamento", () => {
    const parecer = montarParecer(contextoDe(), { fatos: [], pretensao: {} }, cruzamentoBom, JULGAMENTO_BOM as never);

    assert.equal(parecer.cultura[0].nota, 8);
    // "Se considera dona do número" é a pessoa se descrevendo: não vira nota.
    assert.equal(parecer.cultura[1].nota, null);
    assert.match(parecer.cultura[1].evidencia, /situação concreta/);
  });

  it("nunca recomenda avançar com um requisito em não atende", () => {
    const comFalha = {
      ...cruzamentoBom,
      requisitos: [{ ...cruzamentoBom.requisitos[0], situacao: "nao_atende" as const }, ...cruzamentoBom.requisitos.slice(1)],
    };
    const parecer = montarParecer(contextoDe(), { fatos: [], pretensao: {} }, comFalha, JULGAMENTO_BOM as never);

    assert.equal(parecer.recomendacao, "avaliar com o gestor");
  });

  it("preenche a evidência do requisito que a conversa não alcançou", () => {
    const parecer = montarParecer(contextoDe(), { fatos: [], pretensao: {} }, cruzamentoBom, JULGAMENTO_BOM as never);
    assert.match(parecer.aderencia[2].evidencia, /não chegou a este ponto/);
  });

  it("cai na média dos critérios técnicos quando o modelo não dá nota geral", () => {
    const parecer = montarParecer(contextoDe(), { fatos: [], pretensao: {} }, cruzamentoBom, {
      ...JULGAMENTO_BOM,
      notaGeral: undefined,
      recomendacao: undefined,
    } as never);

    assert.equal(parecer.notaGeral, 8.4);
    // Sem recomendação escrita, ela sai da nota — e 8,4 é "avançar" porque nenhum requisito ficou em
    // "não atende".
    assert.equal(parecer.recomendacao, "avançar");
  });

  it("compara a pretensão com a faixa da vaga por conta própria", () => {
    const dentro = montarParecer(contextoDe(), { fatos: [], pretensao: { valor: 6_200 } }, cruzamentoBom, JULGAMENTO_BOM as never);
    assert.deepEqual(dentro.pretensao, { valor: 6_200, dentroDaFaixa: true });

    const fora = montarParecer(contextoDe(), { fatos: [], pretensao: { valor: 9_000 } }, cruzamentoBom, JULGAMENTO_BOM as never);
    assert.equal(fora.pretensao.dentroDaFaixa, false);
  });
});

describe("dentroDaFaixa", () => {
  it("não responde nada sobre uma vaga sem faixa cadastrada", () => {
    assert.equal(dentroDaFaixa(6_000, {}), undefined);
    assert.equal(dentroDaFaixa(undefined, { min: 5_000, max: 7_000 }), undefined);
  });

  it("conta as duas pontas", () => {
    assert.equal(dentroDaFaixa(4_000, { min: 5_000, max: 7_000 }), false);
    assert.equal(dentroDaFaixa(7_000, { min: 5_000, max: 7_000 }), true);
  });
});

describe("aplicarGuardas", () => {
  it("não mexe no que já não era avançar", () => {
    const reprovado = aplicarGuardas("não avançar", [{ requisito: "x", situacao: "nao_atende", evidencia: "" }]);
    assert.equal(reprovado, "não avançar");
  });
});

describe("avaliarEntrevista", () => {
  it("salva o parecer no histórico e vira a entrevista para avaliada", async () => {
    const { entrevista, vaga, candidato } = entrevistaPronta({ respostas: 6 });

    const { resultadoId } = await avaliarEntrevista(entrevista.id, {
      extrator: async () => ({ fatos: [{ fato: "Cuida de 60 contas", pergunta: 2 }], pretensao: { valor: 6_000 } }),
      cruzador: async () => ({
        consistencia: [{ afirmacao: "Cuida de 60 contas", fonte: "cv", situacao: "confirmado", detalhe: "o currículo diz o mesmo" }],
        requisitos: [{ requisito: "Experiência com SaaS B2B", situacao: "atende", evidencia: "sessenta contas", pergunta: 2 }],
        competencias: [{ competencia: "Colaboração", evidencia: "montou o onboarding com o time", pergunta: 3, comportamental: true }],
      }),
      redator: async () => JULGAMENTO_BOM,
    });

    const depois = obterEntrevista(entrevista.id);
    assert.equal(depois?.status, "avaliada");
    assert.equal(depois?.parecerStatus, "pronto");
    assert.equal(depois?.resultadoId, resultadoId);

    const registro = obterResultado<{ entrevistaId: string; vagaId: string; candidatoId: string }, Parecer>(resultadoId);
    assert.equal(registro?.tipo, "parecer");
    assert.deepEqual(registro?.entrada, { entrevistaId: entrevista.id, vagaId: vaga.id, candidatoId: candidato.id });
    assert.equal(registro?.saida.notaGeral, 8.4);
    assert.equal(registro?.saida.aderencia.length, 3);
    assert.equal(registro?.saida.parcial, false);
    assert.equal(registro?.saida.pretensao.dentroDaFaixa, true);
  });

  it("sem IA conectada, devolve o parecer de exemplo sobre esta mesma conversa", async () => {
    const { entrevista, candidato } = entrevistaPronta({ respostas: 6 });
    const { parecer } = await avaliarEntrevista(entrevista.id);

    assert.equal(parecer.aderencia.length, 3);
    assert.equal(parecer.cultura.length, 2);
    assert.ok(parecer.resumo.includes(candidato.nome.split(" ")[0]));
    assert.ok(parecer.notaGeral > 0 && parecer.notaGeral <= 10);
  });
});
