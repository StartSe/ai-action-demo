// Testes do fim da entrevista (lib/conclusao.ts, US-021), fora do Next (`npm test`).
//
// O que se exercita aqui decide em silêncio o que a pessoa de RH vê sobre alguém de verdade — e
// nenhum destes casos quebra tela nenhuma quando dá errado:
//
//  - Uma conversa de uma resposta só não pode virar um parecer com cara de parecer.
//  - Uma conversa completa tem de sair da sala já com o parecer a caminho, sem ninguém clicar.
//  - Concluir duas vezes (um toque duplo, o aviso da ElevenLabs reentregue) não pode dobrar nada.
//
// Roda em modo demonstração: sem chave de IA, `gerarScorecard` devolve o exemplo depois de ~1,2 s —
// o que faz este arquivo exercitar o caminho de segundo plano inteiro, incluindo a gravação do
// resultado e a virada para `avaliada`.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

// `lib/store.ts` lê `DATA_DIR` no momento em que é importado: a variável vem ANTES dos imports do
// app, que por isso são dinâmicos.
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "entrevista-conclusao-"));
delete process.env.OPENROUTER_API_KEY;

const { criar: criarCandidato } = await import("./candidatos");
const { concluirEntrevista } = await import("./conclusao");
const {
  cancelar,
  criar: criarEntrevista,
  obter: obterEntrevista,
  registrarMensagem,
} = await import("./entrevistas");
const { criar: criarVaga } = await import("./vagas");

let contador = 0;

/** Uma entrevista pronta para ser concluída, com a conversa já gravada no servidor. */
function entrevistaCom(respostas: number) {
  contador += 1;
  const vaga = criarVaga({ cargo: `Analista ${contador}`, requisitos: "Atendimento\nCRM", numeroPerguntas: 6 });
  const candidato = criarCandidato({ nome: `Pessoa ${contador}` });
  const entrevista = criarEntrevista({ vagaId: vaga.id, candidatoId: candidato.id, status: "em_andamento" });
  for (let i = 0; i < respostas; i++) {
    registrarMensagem({ entrevistaId: entrevista.id, papel: "entrevistadora", texto: `Pergunta ${i + 1}?` });
    registrarMensagem({ entrevistaId: entrevista.id, papel: "candidato", texto: `Resposta ${i + 1}, com algum detalhe.` });
  }
  return entrevista;
}

/** Espera o trabalho de fundo terminar. Ele não avisa ninguém — é justamente o ponto dele. */
async function esperarParecer(id: string, tentativas = 60) {
  for (let i = 0; i < tentativas; i++) {
    if (obterEntrevista(id)?.status === "avaliada") return;
    await new Promise((r) => setTimeout(r, 100));
  }
}

describe("concluirEntrevista", () => {
  it("com uma resposta só, conclui sem parecer e diz por quê", () => {
    const entrevista = entrevistaCom(1);
    const fim = concluirEntrevista(entrevista.id);

    assert.equal(fim?.preparando, false);
    assert.equal(fim?.respostas, 1);
    const depois = obterEntrevista(entrevista.id);
    assert.equal(depois?.status, "concluida");
    assert.equal(depois?.parecerStatus, "sem_material");
    assert.equal(depois?.resultadoId, undefined);
    // O carimbo existe mesmo sem parecer: a conversa aconteceu, e é por ele que a lista ordena.
    assert.ok(depois?.concluidaEm);
  });

  it("com duas respostas ou mais, conclui na hora e prepara o parecer em segundo plano", async () => {
    const entrevista = entrevistaCom(3);
    const fim = concluirEntrevista(entrevista.id, { nivelVoz: "navegador" });

    // A resposta é imediata: quem está do outro lado é o candidato, e o parecer é do gestor.
    assert.equal(fim?.preparando, true);
    assert.equal(fim?.entrevista.status, "concluida");
    assert.equal(fim?.entrevista.parecerStatus, "em_andamento");
    assert.equal(fim?.entrevista.nivelVoz, "navegador");

    await esperarParecer(entrevista.id);
    const depois = obterEntrevista(entrevista.id);
    assert.equal(depois?.status, "avaliada");
    assert.equal(depois?.parecerStatus, "pronto");
    assert.ok(depois?.resultadoId);
  });

  it("concluir duas vezes não prepara um segundo parecer", async () => {
    const entrevista = entrevistaCom(3);
    concluirEntrevista(entrevista.id);
    await esperarParecer(entrevista.id);
    const primeiro = obterEntrevista(entrevista.id)?.resultadoId;

    const repetida = concluirEntrevista(entrevista.id);
    assert.equal(repetida?.preparando, false);
    assert.equal(obterEntrevista(entrevista.id)?.resultadoId, primeiro);
    assert.equal(obterEntrevista(entrevista.id)?.status, "avaliada");
  });

  it("não conclui uma entrevista cancelada", () => {
    const entrevista = entrevistaCom(3);
    cancelar(entrevista.id);

    assert.equal(concluirEntrevista(entrevista.id), null);
    assert.equal(obterEntrevista(entrevista.id)?.status, "cancelada");
  });

  it("não conclui uma entrevista que não existe", () => {
    assert.equal(concluirEntrevista("nao-existe"), null);
  });
});
