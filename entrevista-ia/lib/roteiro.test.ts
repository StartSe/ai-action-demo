// Testes do roteiro da entrevista (lib/roteiro.ts, US-016), fora do Next (`npm test`).
//
// O que é exercitado aqui decide, em silêncio, o que uma pessoa de verdade vai ouvir numa entrevista
// — e um erro em qualquer um destes pontos não quebra tela nenhuma:
//
//  - **O que a entrevistadora sabe (D6).** Um campo trazido da web sobre um possível homônimo não
//    pode virar pergunta enquanto o gestor não confirmar de quem é aquele perfil.
//  - **Quantas perguntas ela faz.** Follow-ups não podem substituir as perguntas combinadas com o gestor,
//    e o encerramento (o espaço para as perguntas do candidato) não pode ser comido por eles.
//  - **A posição na conversa**, que é deduzida da transcrição em vez de guardada: se a dedução não
//    devolver o mesmo caminho, uma entrevista retomada repete ou pula perguntas.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

// `lib/store.ts` lê `DATA_DIR` no momento em que é importado (lib/cultura.ts entra pelo import de
// lib/roteiro.ts), então a variável é definida ANTES dos imports do app, que são dinâmicos.
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "entrevista-roteiro-"));

const { contextoDaVagaAntiga, decidirPasso, fatosDaVaga, fichaParaEntrevista, normalizarRoteiro, pontosAEsclarecer, posicaoNoRoteiro, respostaVaga, passoEmTexto, lerPassoGravado, passoDaInterpretacao, lerMemoriaGravada } =
  await import("./roteiro");
const { roteiroDemo } = await import("./demo");

type Ctx = Awaited<ReturnType<typeof contextoDaVagaAntiga>>;
type Plano = ReturnType<typeof roteiroDemo>;

function contexto(extra: Partial<Ctx> = {}): Ctx {
  return {
    cargo: "Analista de Customer Success",
    desafios: ["reduzir o churn da carteira de PMEs", "montar o onboarding padrão"],
    requisitos: ["experiência com SaaS B2B", "HubSpot ou outro CRM", "inglês para reuniões", "análise de dados de uso"],
    competencias: [
      { nome: "Colaboração", descricao: "ajuda antes de ser pedido" },
      { nome: "Dono do resultado", descricao: "vai até o fim" },
    ],
    comportamentos: "resolve com autonomia",
    naoCombina: "esperar ordem para agir",
    tom: "acolhedor",
    numeroPerguntas: 8,
    duracaoMin: 15,
    perguntaPretensao: true,
    candidato: { nome: "Marina Souza", primeiroNome: "Marina", ficha: [], aEsclarecer: [] },
    ...extra,
  };
}

function conversa(plano: Plano, respostas: string[]): { papel: "entrevistadora" | "candidato"; texto: string }[] {
  // Uma conversa em que a entrevistadora fez exatamente as perguntas do plano, na ordem.
  const falas: { papel: "entrevistadora" | "candidato"; texto: string }[] = [];
  respostas.forEach((resposta, i) => {
    falas.push({ papel: "entrevistadora", texto: plano.perguntas[i]?.pergunta ?? "..." });
    falas.push({ papel: "candidato", texto: resposta });
  });
  return falas;
}

const LONGA =
  "Trabalho há quatro anos com atendimento a clientes B2B e hoje lidero o time de suporte sênior em uma empresa de software de médio porte, cuidando de uma carteira de sessenta contas. Redesenhei os processos de atendimento, treinei os colegas e medi os resultados semanalmente para diminuir o tempo de resolução e a perda de clientes.";

describe("a ficha que a entrevistadora recebe (D6)", () => {
  const ficha = {
    cargoAtual: { valor: "Analista de CS", origem: "cv" as const },
    empresaAtual: { valor: "Contabilizei", origem: "web" as const },
    cidade: { valor: "Curitiba", origem: "gestor" as const },
    links: [{ valor: "https://linkedin.com/in/marina", origem: "cv" as const }],
    competencias: [
      { valor: "HubSpot", origem: "cv" as const },
      { valor: "Zendesk", origem: "web" as const },
    ],
  };

  it("deixa a web de fora enquanto a identidade não foi confirmada", () => {
    const itens = fichaParaEntrevista(ficha, false);
    const valores = itens.map((i) => i.valor).join(" | ");
    assert.match(valores, /Analista de CS/);
    assert.match(valores, /Curitiba/);
    assert.doesNotMatch(valores, /Contabilizei/, "empresa vinda da web não pode entrar sem confirmação");
    assert.doesNotMatch(valores, /Zendesk/, "item de lista vindo da web também não");
  });

  it("deixa a web entrar depois da confirmação", () => {
    const valores = fichaParaEntrevista(ficha, true).map((i) => i.valor).join(" | ");
    assert.match(valores, /Contabilizei/);
    assert.match(valores, /Zendesk/);
  });

  it("nunca entrega os links de perfil, mesmo confirmada", () => {
    for (const confirmada of [false, true]) {
      const valores = fichaParaEntrevista(ficha, confirmada).map((i) => i.valor).join(" | ");
      assert.doesNotMatch(valores, /linkedin/i, "a entrevistadora não pode ter um perfil público à mão");
    }
  });

  it("vira ponto a esclarecer sem contar de onde saiu a outra versão", () => {
    const pontos = pontosAEsclarecer({ divergencias: [{ campo: "Cidade", cv: "Curitiba", web: "São Paulo" }] });
    assert.equal(pontos.length, 1);
    assert.match(pontos[0], /Curitiba/);
    assert.match(pontos[0], /São Paulo/);
    assert.doesNotMatch(pontos[0], /web|internet|LinkedIn|perfil/i);
  });
});

describe("os fatos que a entrevistadora pode dizer sobre a vaga", () => {
  it("não inventa faixa salarial quando ela não está no contexto", () => {
    const ctx = contexto({ perguntaPretensao: false, faixaSalarial: undefined });
    assert.ok(!fatosDaVaga(ctx).some((f) => /Faixa salarial/.test(f)));
  });

  it("inclui a faixa cadastrada nos fatos disponíveis", () => {
    const fatos = fatosDaVaga(contexto({ faixaSalarial: "R$ 5.500 a R$ 7.000" }));
    assert.ok(fatos.some((f) => f === "Faixa salarial: R$ 5.500 a R$ 7.000"));
  });
});

describe("o roteiro do modo demonstração", () => {
  it("nunca passa do total, abre na abertura e fecha no encerramento", () => {
    for (const numeroPerguntas of [6, 8, 12]) {
      const plano = roteiroDemo(contexto({ numeroPerguntas }));
      // "Respeita o total" é um TETO: com quatro requisitos, dois desafios e duas competências não
      // há doze perguntas honestas a fazer, e repetir para preencher seria pior que perguntar menos.
      assert.ok(plano.perguntas.length <= numeroPerguntas, `total com ${numeroPerguntas} perguntas: saíram ${plano.perguntas.length}`);
      assert.equal(plano.perguntas[0].bloco, "abertura");
      assert.equal(plano.perguntas[plano.perguntas.length - 1].bloco, "encerramento");
    }
  });

  it("usa o total inteiro quando há material para isso", () => {
    for (const numeroPerguntas of [6, 8]) {
      assert.equal(roteiroDemo(contexto({ numeroPerguntas })).perguntas.length, numeroPerguntas);
    }
  });

  it("corta cultura antes de desafios quando o total aperta", () => {
    const plano = roteiroDemo(contexto({ numeroPerguntas: 6 }));
    assert.ok(plano.perguntas.some((p) => p.bloco === "desafios"));
    assert.ok(!plano.perguntas.some((p) => p.bloco === "cultura"));
  });

  it("traz uma pergunta de desafio e uma de cultura reconhecíveis", () => {
    const plano = roteiroDemo(contexto());
    const desafio = plano.perguntas.find((p) => p.bloco === "desafios");
    const cultura = plano.perguntas.find((p) => p.bloco === "cultura");
    assert.ok(desafio, "o roteiro de exemplo precisa ter uma pergunta de desafio");
    assert.match(desafio.pergunta, /reduzir o churn da carteira de PMEs/);
    assert.ok(cultura, "o roteiro de exemplo precisa ter uma pergunta de cultura");
    // A regra do bloco de cultura: a pergunta é situacional e nunca nomeia a competência.
    assert.doesNotMatch(cultura.pergunta, /Colaboração|Dono do resultado/);
    assert.equal(cultura.foco, "Colaboração");
  });

  it("não pergunta pretensão quando a vaga não pede", () => {
    const plano = roteiroDemo(contexto({ perguntaPretensao: false }));
    assert.ok(!plano.perguntas.some((p) => p.bloco === "pretensao"));
  });

  it("não cita perfil público em pergunta nenhuma", () => {
    const plano = roteiroDemo(contexto({ candidato: { nome: "Marina Souza", primeiroNome: "Marina", ficha: [], aEsclarecer: ["Cidade: o currículo diz \"Curitiba\""] } }));
    for (const p of plano.perguntas) assert.doesNotMatch(p.pergunta, /LinkedIn|internet|perfil público|pesquis/i);
  });
});

describe("normalizarRoteiro", () => {
  it("corta o excesso e garante o encerramento no fim", () => {
    const ctx = contexto({ numeroPerguntas: 6 });
    const plano = normalizarRoteiro(
      {
        perguntas: [
          ...Array.from({ length: 10 }, (_, i) => ({ bloco: "requisitos", pergunta: `Pergunta ${i}` })),
          { bloco: "encerramento", pergunta: "Você tem alguma pergunta?" },
        ],
        despedida: "Obrigada!",
      },
      ctx,
    );
    assert.equal(plano.perguntas.length, 6);
    assert.equal(plano.perguntas[5].bloco, "encerramento");
  });

  it("descarta a pretensão quando a vaga não pergunta, mesmo se o modelo insistir", () => {
    const ctx = contexto({ perguntaPretensao: false });
    const plano = normalizarRoteiro({ perguntas: [{ bloco: "pretensao", pergunta: "Quanto você quer ganhar?" }] }, ctx);
    assert.ok(!plano.perguntas.some((p) => p.bloco === "pretensao"));
  });

  it("inventa um encerramento e uma despedida quando o modelo esquece", () => {
    const plano = normalizarRoteiro({ perguntas: [{ bloco: "abertura", pergunta: "Me conta sobre você." }] }, contexto());
    assert.equal(plano.perguntas[plano.perguntas.length - 1].bloco, "encerramento");
    assert.match(plano.despedida, /Marina/);
  });
});

describe("respostaVaga", () => {
  it("chama de vaga a resposta curta e de suficiente a longa", () => {
    assert.equal(respostaVaga("Sim."), true);
    assert.equal(respostaVaga("Acho que sim, sempre trabalhei bem em equipe."), true);
    assert.equal(respostaVaga(LONGA), false);
    assert.equal(respostaVaga("   "), false, "silêncio não é resposta vaga: não há o que aprofundar");
  });
});

describe("decidirPasso", () => {
  const plano = roteiroDemo(contexto({ numeroPerguntas: 8 }));

  it("começa pela abertura", () => {
    const passo = decidirPasso({ plano, posicao: { indice: 0, feitas: 0, followUps: [] }, resposta: "", numeroPerguntas: 8 });
    assert.equal(passo.tipo, "pergunta");
    assert.equal(passo.tipo === "pergunta" && passo.pergunta.bloco, "abertura");
  });

  it("aprofunda uma resposta vaga, uma vez só por pergunta", () => {
    const posicao = { indice: 2, feitas: 2, followUps: [] as never[] };
    const bloco = plano.perguntas[1].bloco;
    const primeiro = decidirPasso({ plano, posicao, resposta: "Sim, bastante.", numeroPerguntas: 8 });
    assert.equal(primeiro.tipo, "followup");
    assert.equal(primeiro.tipo === "followup" && primeiro.bloco, bloco);

    const segundo = decidirPasso({ plano, posicao: { ...posicao, followUps: [1] }, resposta: "Sim, bastante.", numeroPerguntas: 8 });
    assert.equal(segundo.tipo, "pergunta", "a mesma pergunta não ganha um segundo aprofundamento");
  });

  it("não aprofunda uma resposta longa", () => {
    const passo = decidirPasso({ plano, posicao: { indice: 2, feitas: 2, followUps: [] }, resposta: LONGA, numeroPerguntas: 8 });
    assert.equal(passo.tipo, "pergunta");
  });

  it("aprofundamentos nunca fazem pular perguntas para ir ao encerramento", () => {
    const posicao = { indice: 3, feitas: 7, followUps: [2] };
    const passo = decidirPasso({ plano, posicao, resposta: "Sim.", numeroPerguntas: 8 });
    assert.equal(passo.tipo, "pergunta");
    assert.equal(passo.tipo === "pergunta" && passo.indice, 3);
  });

  it("não insiste quando a pessoa diz que não sabe responder", () => {
    const passo = decidirPasso({ plano, posicao: { indice: 3, feitas: 3, followUps: [] }, resposta: "Não tenho experiência nessa área.", numeroPerguntas: 8 });
    assert.equal(passo.tipo, "pergunta");
  });

  it("encerra quando o total acabou", () => {
    assert.equal(decidirPasso({ plano, posicao: { indice: 8, feitas: 8, followUps: [] }, resposta: "", numeroPerguntas: 8 }).tipo, "encerrar");
  });

  it("repete a pergunta quando a pessoa pede de qualquer jeito, antes de aprofundar ou de tratar como dúvida", () => {
    const posicao = { indice: 2, feitas: 2, followUps: [] as never[] };
    for (const pedido of ["pode repetir a pergunta", "Você pode repetir?", "não escutei", "Qual era a pergunta?", "hã", "Não entendi, pode repetir?"]) {
      const passo = decidirPasso({ plano, posicao, resposta: pedido, numeroPerguntas: 8 });
      assert.equal(passo.tipo, "retomar", pedido);
      assert.equal(passo.tipo === "retomar" && passo.indice, 1, pedido);
    }
  });

  it("devolve a palavra quando a pessoa pede um momento ou avisa que não terminou", () => {
    for (const pedido of ["espera, não terminei", "Só um momento.", "deixa eu pensar"]) {
      assert.equal(decidirPasso({ plano, posicao: { indice: 2, feitas: 2, followUps: [] }, resposta: pedido, numeroPerguntas: 8 }).tipo, "continuar", pedido);
    }
  });
});

describe("posicaoNoRoteiro", () => {
  const plano = roteiroDemo(contexto({ numeroPerguntas: 8 }));

  it("deduz a posição de uma conversa sem aprofundamentos", () => {
    const falas = conversa(plano, [LONGA, LONGA, LONGA]);
    const posicao = posicaoNoRoteiro(plano, falas, 8);
    assert.equal(posicao.feitas, 3);
    assert.equal(posicao.indice, 3);
    assert.deepEqual(posicao.followUps, []);
    assert.equal(posicao.ultimaResposta, LONGA);
  });

  it("conta o aprofundamento como pergunta feita, sem andar no plano", () => {
    // Pergunta 1 → resposta curta → aprofundamento → resposta longa.
    const falas = [
      { papel: "entrevistadora" as const, texto: plano.perguntas[0].pergunta },
      { papel: "candidato" as const, texto: "Sim." },
      { papel: "entrevistadora" as const, texto: "Pode detalhar com um exemplo concreto?" },
      { papel: "candidato" as const, texto: LONGA },
    ];
    const posicao = posicaoNoRoteiro(plano, falas, 8);
    assert.equal(posicao.feitas, 2, "o aprofundamento conta como fala, sem consumir o plano");
    assert.equal(posicao.indice, 1, "mas o plano não andou");
    assert.deepEqual(posicao.followUps, [0]);
  });

  it("repetição e pausa não andam no plano nem gastam o aprofundamento", () => {
    const falas = [
      { papel: "entrevistadora" as const, texto: plano.perguntas[0].pergunta },
      { papel: "candidato" as const, texto: "pode repetir" },
      { papel: "entrevistadora" as const, texto: `Claro. ${plano.perguntas[0].pergunta}` },
      { papel: "candidato" as const, texto: "só um momento" },
      { papel: "entrevistadora" as const, texto: "Claro, sem pressa. Pode continuar." },
      { papel: "candidato" as const, texto: LONGA },
    ];
    const posicao = posicaoNoRoteiro(plano, falas, 8);
    assert.equal(posicao.indice, 1);
    assert.equal(posicao.feitas, 1);
    assert.deepEqual(posicao.followUps, []);
    assert.equal(posicao.ultimaResposta, LONGA);
  });

  it("'não terminei' logo depois de uma pergunta nova devolve essa pergunta à fila", () => {
    // Pergunta 1 → resposta cortada cedo pelo fim de fala → pergunta 2 saiu → "espera" → continuação.
    const falas = [
      { papel: "entrevistadora" as const, texto: plano.perguntas[0].pergunta },
      { papel: "candidato" as const, texto: LONGA },
      { papel: "entrevistadora" as const, texto: plano.perguntas[1].pergunta },
      { papel: "candidato" as const, texto: "espera, eu não terminei" },
      { papel: "entrevistadora" as const, texto: "Claro, sem pressa. Pode continuar." },
      { papel: "candidato" as const, texto: LONGA },
    ];
    const posicao = posicaoNoRoteiro(plano, falas, 8);
    assert.equal(posicao.indice, 1, "a pergunta 2 volta a ficar pendente");
    assert.equal(posicao.feitas, 1);
    const passo = decidirPasso({ plano, posicao, resposta: posicao.ultimaResposta, numeroPerguntas: 8 });
    assert.equal(passo.tipo, "pergunta");
    assert.equal(passo.tipo === "pergunta" && passo.pergunta.pergunta, plano.perguntas[1].pergunta, "e é feita de novo");
  });

  it("'não terminei' na primeira pergunta não volta para a saudação nem para antes do plano", () => {
    const falas = [
      { papel: "entrevistadora" as const, texto: plano.perguntas[0].pergunta },
      { papel: "candidato" as const, texto: "espera" },
    ];
    const posicao = posicaoNoRoteiro(plano, falas, 8);
    assert.equal(decidirPasso({ plano, posicao, resposta: posicao.ultimaResposta, numeroPerguntas: 8 }).tipo, "continuar");
    const depois = posicaoNoRoteiro(plano, [...falas, { papel: "entrevistadora" as const, texto: "Claro, sem pressa. Pode continuar." }], 8);
    assert.equal(depois.indice, 1);
    assert.equal(depois.feitas, 1);
  });

  it("uma conversa com respostas curtas cobre TODO o roteiro antes de encerrar", () => {
    let falas: { papel: "entrevistadora" | "candidato"; texto: string }[] = [];
    const perguntas: string[] = [];
    // Toda resposta é curta: o pior caso para o orçamento, com um aprofundamento por bloco.
    for (let turno = 0; turno < 30; turno++) {
      const posicao = posicaoNoRoteiro(plano, falas, 8);
      const passo = decidirPasso({ plano, posicao, resposta: posicao.ultimaResposta, numeroPerguntas: 8 });
      if (passo.tipo === "encerrar") break;
      assert.notEqual(passo.tipo, "duvida");
      const texto = passo.tipo === "followup" || passo.tipo === "duvida" || passo.tipo === "continuar" ? "Pode detalhar?" : passo.pergunta.pergunta;
      perguntas.push(texto);
      falas = [...falas, { papel: "entrevistadora", texto }, { papel: "candidato", texto: "Sim." }];
    }
    assert.deepEqual(perguntas.filter((p) => p !== "Pode detalhar?"), plano.perguntas.map((p) => p.pergunta));
    assert.equal(perguntas.length, plano.perguntas.length * 2 - 1, "um aprofundamento por pergunta, exceto no encerramento");
    assert.equal(perguntas[perguntas.length - 1], plano.perguntas[plano.perguntas.length - 1].pergunta, "a última pergunta tem de ser a do encerramento");
  });
});

describe("os desafios escritos como parágrafo corrido", () => {
  it("viram um desafio por frase", async () => {
    // O gestor digita os desafios num parágrafo só, e é assim que a vaga de exemplo os guarda. Sem
    // a quebra por frase, "como você atacaria isso?" chegaria com os três de uma vez.
    const { obterCultura } = await import("./cultura");
    assert.ok(obterCultura, "lib/cultura.ts precisa carregar para o contexto ser montado");
    const { contextoDaVaga } = await import("./roteiro");
    const ctx = contextoDaVaga({
      id: "v1",
      cargo: "Analista",
      salarioACombinar: true,
      desafios: "Assumir uma carteira de 40 contas. Reduzir o cancelamento no primeiro ano. Deixar registrado no CRM.",
      requisitos: "SQL\nPython",
      competenciasCulturais: [],
      tom: "acolhedor",
      numeroPerguntas: 8,
      duracaoMin: 15,
      perguntaPretensao: false,
      status: "aberta",
      exemplo: false,
      criadoEm: "",
      atualizadoEm: "",
    });
    assert.deepEqual(ctx.desafios, ["Assumir uma carteira de 40 contas", "Reduzir o cancelamento no primeiro ano", "Deixar registrado no CRM"]);
    assert.deepEqual(ctx.requisitos, ["SQL", "Python"], "requisito continua sendo um por linha");
  });
});

describe("contextoDaVagaAntiga", () => {
  it("monta um contexto sem cultura, sem desafios e sem dinheiro", () => {
    const ctx = contextoDaVagaAntiga({ titulo: "Analista", requisitos: "SQL\nPython", candidato: "João da Silva", tom: "objetivo", numero_perguntas: 5 });
    assert.deepEqual(ctx.requisitos, ["SQL", "Python"]);
    assert.equal(ctx.perguntaPretensao, false);
    assert.equal(ctx.faixaSalarial, undefined);
    assert.equal(ctx.candidato.primeiroNome, "João");
    assert.equal(ctx.numeroPerguntas, 5);
  });
});

describe("o passo gravado em cada fala (0.8.0)", () => {
  const plano = roteiroDemo(contexto({ numeroPerguntas: 8 }));

  it("vai e volta do texto guardado no banco, e ignora o que não reconhece", () => {
    assert.equal(passoEmTexto({ tipo: "pergunta", indice: 3, pergunta: plano.perguntas[3] }), "pergunta:3");
    assert.equal(passoEmTexto({ tipo: "pergunta", indice: 4, pergunta: plano.perguntas[4], coberta: 3 }), "pergunta:4;coberta:3");
    assert.equal(passoEmTexto({ tipo: "followup", bloco: "requisitos" }), "followup");
    assert.deepEqual(lerPassoGravado("pergunta:4;coberta:3"), { tipo: "pergunta", indice: 4, coberta: 3 });
    assert.deepEqual(lerPassoGravado("continuar"), { tipo: "continuar" });
    assert.equal(lerPassoGravado("pergunta:x"), null);
    assert.equal(lerPassoGravado("qualquer coisa"), null);
    assert.equal(lerPassoGravado(undefined), null);
  });

  it("a posição segue o passo gravado, não a regra, quando os dois discordam", () => {
    // Resposta de sete palavras: a regra aprofundaria; o modelo seguiu para a pergunta 2 e gravou isso.
    const falas = [
      { papel: "entrevistadora" as const, texto: plano.perguntas[0].pergunta, passo: "pergunta:0" },
      { papel: "candidato" as const, texto: "Sim, três anos com HubSpot em PMEs." },
      { papel: "entrevistadora" as const, texto: plano.perguntas[1].pergunta, passo: "pergunta:1" },
      { papel: "candidato" as const, texto: LONGA },
    ];
    const gravada = posicaoNoRoteiro(plano, falas, 8);
    assert.equal(gravada.indice, 2);
    assert.deepEqual(gravada.followUps, []);
    const pelasRegras = posicaoNoRoteiro(plano, falas.map(({ papel, texto }) => ({ papel, texto })), 8);
    assert.equal(pelasRegras.indice, 1, "sem o passo, a regra teria lido a segunda fala como aprofundamento");
    assert.deepEqual(pelasRegras.followUps, [0]);
  });

  it("uma pergunta coberta anda o roteiro em dois", () => {
    const falas = [
      { papel: "entrevistadora" as const, texto: plano.perguntas[0].pergunta, passo: "pergunta:0" },
      { papel: "candidato" as const, texto: LONGA },
      { papel: "entrevistadora" as const, texto: plano.perguntas[2].pergunta, passo: "pergunta:2;coberta:1" },
      { papel: "candidato" as const, texto: LONGA },
    ];
    assert.equal(posicaoNoRoteiro(plano, falas, 8).indice, 3);
  });
});

describe("passoDaInterpretacao", () => {
  const plano = roteiroDemo(contexto({ numeroPerguntas: 8 }));
  const base = { proximaJaCoberta: false, fala: "", notas: [] as string[] };

  it("respeita as garantias das regras: um aprofundamento por pergunta, nunca no encerramento", () => {
    const posicao = { indice: 2, feitas: 2, followUps: [1] };
    assert.equal(passoDaInterpretacao(plano, posicao, "Sim.", { ...base, intencao: "resposta", aprofundar: true }).tipo, "pergunta", "a pergunta 2 já teve aprofundamento");
    const ultima = { indice: 8, feitas: 8, followUps: [] };
    assert.equal(passoDaInterpretacao(plano, ultima, "Não, obrigada.", { ...base, intencao: "resposta", aprofundar: true }).tipo, "encerrar");
    assert.equal(passoDaInterpretacao(plano, ultima, "E quais são os benefícios?", { ...base, intencao: "duvida" }).tipo, "duvida");
  });

  it("sem 'aprofundar' do modelo, vale a regra de tamanho", () => {
    const posicao = { indice: 2, feitas: 2, followUps: [] };
    assert.equal(passoDaInterpretacao(plano, posicao, "Sim.", { ...base, intencao: "resposta" }).tipo, "followup");
    assert.equal(passoDaInterpretacao(plano, posicao, LONGA, { ...base, intencao: "resposta" }).tipo, "pergunta");
    assert.equal(passoDaInterpretacao(plano, posicao, "Sim.", { ...base, intencao: "resposta", aprofundar: false }).tipo, "pergunta");
  });

  it("'pular' e 'já respondida' nunca aprofundam; 'já coberta' não pula a abertura nem o encerramento", () => {
    const posicao = { indice: 2, feitas: 2, followUps: [] };
    assert.equal(passoDaInterpretacao(plano, posicao, "Não sei.", { ...base, intencao: "pular" }).tipo, "pergunta");
    const coberta = passoDaInterpretacao(plano, posicao, LONGA, { ...base, intencao: "resposta", aprofundar: false, proximaJaCoberta: true });
    assert.equal(coberta.tipo === "pergunta" && coberta.indice, 3);
    assert.equal(coberta.tipo === "pergunta" && coberta.coberta, 2);
    const penultima = passoDaInterpretacao(plano, { indice: 7, feitas: 7, followUps: [] }, LONGA, { ...base, intencao: "resposta", aprofundar: false, proximaJaCoberta: true });
    assert.equal(penultima.tipo === "pergunta" && penultima.indice, 7, "o encerramento nunca é coberto");
    const inicio = passoDaInterpretacao(plano, { indice: 0, feitas: 0, followUps: [] }, "", { ...base, intencao: "resposta", proximaJaCoberta: true });
    assert.equal(inicio.tipo === "pergunta" && inicio.indice, 0, "a abertura nunca é coberta");
  });

  it("'repetir' e 'continuar' vindos do modelo viram os mesmos passos das regras", () => {
    const posicao = { indice: 2, feitas: 2, followUps: [] };
    assert.equal(passoDaInterpretacao(plano, posicao, "Hum, não sei se entendi direito.", { ...base, intencao: "repetir" }).tipo, "retomar");
    assert.equal(passoDaInterpretacao(plano, posicao, "Ainda estou pensando aqui.", { ...base, intencao: "continuar" }).tipo, "continuar");
  });
});

describe("a memória gravada", () => {
  it("lê o JSON guardado e nunca derruba a sala com um formato estranho", () => {
    assert.deepEqual(lerMemoriaGravada(null), { notas: [] });
    assert.deepEqual(lerMemoriaGravada("{isso não é json"), { notas: [] });
    assert.deepEqual(lerMemoriaGravada(JSON.stringify({ notas: ["P1: ok", 42, ""] })), { notas: ["P1: ok"] });
  });
});
