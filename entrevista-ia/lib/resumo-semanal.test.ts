// Testes do resumo semanal (lib/resumo-semanal.ts, US-027), fora do Next (`npm test`).
//
// Este resumo sai por e-mail de madrugada, sem ninguém olhando, e é a única notícia que muita gente
// vai ter do processo naquela semana. Um erro aqui não quebra tela nenhuma — só manda um número
// errado para a caixa de entrada de quem decide. Por isso o que se exercita é:
//
//  - a janela de ACONTECIMENTOS (convite pela data em que saiu, conversa pela data em que terminou);
//  - a fila de decisão como estoque de AGORA, que não depende da janela;
//  - o que fica de fora (convite cancelado pela própria casa) e a vaga encerrada que ainda tem
//    parecer esperando, que não pode sumir do aviso;
//  - o melhor avaliado da semana e o silêncio quando nada se moveu.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

// `lib/store.ts` lê `DATA_DIR` no momento em que é importado: a variável vem ANTES dos imports do
// app, que por isso são dinâmicos.
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "entrevista-resumo-"));
delete process.env.OPENROUTER_API_KEY;

const { criar: criarCandidato } = await import("./candidatos");
const { cancelar, criar: criarEntrevista, decidir, mudarStatus, registrarResultado } = await import("./entrevistas");
const { salvar } = await import("./historico");
const { resumoSemanal, textoDoResumo } = await import("./resumo-semanal");
const { criar: criarVaga, mudarStatus: mudarStatusVaga } = await import("./vagas");

const DIA_MS = 86_400_000;
const SEMANA = () => new Date(Date.now() - 7 * DIA_MS).toISOString();

let contador = 0;

function vagaNova() {
  contador += 1;
  return criarVaga({ cargo: `Analista ${contador}`, requisitos: "Atendimento\nCRM" });
}

/** Uma entrevista no estado pedido, com parecer salvo quando uma nota é informada. */
function entrevista(vagaId: string, estado: "convidada" | "concluida" | "avaliada" | "cancelada", nota?: number) {
  contador += 1;
  const candidato = criarCandidato({ nome: `Pessoa ${contador}` });
  const criada = criarEntrevista({ vagaId, candidatoId: candidato.id });
  if (estado === "cancelada") return cancelar(criada.id) as NonNullable<ReturnType<typeof cancelar>>;
  if (estado === "concluida" || estado === "avaliada") mudarStatus(criada.id, estado, { nivelVoz: "navegador" });
  if (typeof nota === "number") {
    const resultadoId = salvar({
      tipo: "parecer",
      titulo: `Pessoa ${contador}`,
      entrada: { entrevistaId: criada.id },
      saida: { notaGeral: nota, recomendacao: "avançar" },
      meta: {},
    });
    registrarResultado(criada.id, resultadoId);
  }
  return criada;
}

describe("a janela do resumo", () => {
  it("conta convite e conclusão da semana e ignora o que aconteceu antes dela", () => {
    const vaga = vagaNova();
    entrevista(vaga.id, "convidada");
    entrevista(vaga.id, "concluida");

    const daSemana = resumoSemanal(SEMANA());
    assert.equal(daSemana.convites, 2);
    assert.equal(daSemana.concluidas, 1);

    // Uma janela que começa no futuro não pode enxergar movimento nenhum — mas a fila continua lá.
    const daquiAPouco = resumoSemanal(new Date(Date.now() + DIA_MS).toISOString(), new Date(Date.now() + 2 * DIA_MS).toISOString());
    assert.equal(daquiAPouco.convites, 0);
    assert.equal(daquiAPouco.concluidas, 0);
  });

  it("conta a fila de decisão como estoque de agora, fora da janela", () => {
    const vaga = vagaNova();
    entrevista(vaga.id, "avaliada", 7.5);

    // A janela do ano passado não tem convite nem conversa; o parecer parado continua esperando hoje.
    const antiga = resumoSemanal(new Date(Date.now() - 400 * DIA_MS).toISOString(), new Date(Date.now() - 300 * DIA_MS).toISOString());
    assert.equal(antiga.convites, 0);
    assert.equal(antiga.aguardandoDecisao, 1);
    assert.equal(antiga.vazio, false);
  });

  it("tira da fila o que já foi decidido", () => {
    const vaga = vagaNova();
    const avaliada = entrevista(vaga.id, "avaliada", 8);
    assert.equal(resumoSemanal(SEMANA()).vagas.find((v) => v.vagaId === vaga.id)?.aguardandoDecisao, 1);

    decidir(avaliada.id, "avancar");
    assert.equal(resumoSemanal(SEMANA()).vagas.find((v) => v.vagaId === vaga.id)?.aguardandoDecisao, 0);
  });

  it("não cobra decisão de uma conversa que ainda não virou parecer", () => {
    const vaga = vagaNova();
    entrevista(vaga.id, "concluida");
    assert.equal(resumoSemanal(SEMANA()).vagas.find((v) => v.vagaId === vaga.id)?.aguardandoDecisao, 0);
  });
});

describe("o que fica de fora", () => {
  it("não conta o convite que a própria casa cancelou", () => {
    const vaga = vagaNova();
    entrevista(vaga.id, "cancelada");
    assert.equal(
      resumoSemanal(SEMANA()).vagas.find((v) => v.vagaId === vaga.id),
      undefined,
    );
  });

  it("mantém a vaga encerrada que ainda tem parecer esperando decisão", () => {
    const vaga = vagaNova();
    entrevista(vaga.id, "avaliada", 6.2);
    mudarStatusVaga(vaga.id, "encerrada");

    const linha = resumoSemanal(SEMANA()).vagas.find((v) => v.vagaId === vaga.id);
    assert.equal(linha?.aberta, false);
    assert.equal(linha?.aguardandoDecisao, 1);
    assert.match(textoDoResumo(resumoSemanal(SEMANA())), new RegExp(`${vaga.cargo} \\(encerrada\\)`));
  });
});

describe("o melhor avaliado da semana", () => {
  it("é o de maior nota entre as conversas concluídas na janela", () => {
    const vaga = vagaNova();
    entrevista(vaga.id, "avaliada", 6.1);
    entrevista(vaga.id, "avaliada", 9.2);
    entrevista(vaga.id, "avaliada", 7.4);

    const resumo = resumoSemanal(SEMANA());
    assert.equal(resumo.melhor?.notaGeral, 9.2);
    assert.match(textoDoResumo(resumo), /nota 9,2/);
  });

  it("some quando nenhuma conversa da janela tem parecer", () => {
    // Uma janela no futuro não alcança conversa nenhuma, então não há melhor de quem falar.
    const resumo = resumoSemanal(new Date(Date.now() + DIA_MS).toISOString(), new Date(Date.now() + 2 * DIA_MS).toISOString());
    assert.equal(resumo.melhor, null);
  });
});

describe("o resumo em palavras", () => {
  it("escreve uma linha por vaga e uma frase de abertura com os três números", () => {
    const texto = textoDoResumo(resumoSemanal(SEMANA()));
    assert.match(texto, /convites enviados, \d+ conversas concluídas e \d+ pareceres esperando a sua decisão\./);
    assert.match(texto, /^· .+: \d+ convidados?, \d+ concluídas?/m);
  });

  it("corta a lista de vagas e diz quantas ficaram de fora", () => {
    const resumo = resumoSemanal(SEMANA());
    assert.ok(resumo.vagas.length > 1, "o teste precisa de mais de uma vaga com movimento");
    assert.match(textoDoResumo(resumo, 1), new RegExp(`e mais ${resumo.vagas.length - 1} vagas?\\.`));
  });
});
