import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { QUESTIONARIO_MODELO } from "../lib/modelo";
test("encerramento preserva o assessment após limpeza de inicialização; análise lê mais de 500 respostas", async () => {
  const pasta = mkdtempSync(join(tmpdir(), "bussola-coleta-"));
  const anterior = process.env.DATA_DIR;
  process.env.DATA_DIR = pasta;
  try {
    const {
      guardarQuestionario,
      criarLinkAvaliacao,
      registrarRespostaAvaliacao,
      encerrarAvaliacao,
      listarAvaliacoesEmAndamento,
    } = await import("../lib/link-avaliacao");
    const { limparExpirados, contarRespostas } =
      await import("../lib/formularios");
    const { listarPorCodigo } = await import("../lib/respostas");
    const { id } = guardarQuestionario({
      titulo: QUESTIONARIO_MODELO.titulo,
      questionario: QUESTIONARIO_MODELO,
    });
    const codigo = criarLinkAvaliacao({
      questionarioId: id,
      titulo: "Grupo persistido",
      empresa: "Teste",
    });
    const dados = Object.fromEntries(
      QUESTIONARIO_MODELO.perguntas.map((p) => [p.id, "3"]),
    );
    for (let i = 0; i < 501; i++)
      assert.equal(registrarRespostaAvaliacao(codigo, dados).ok, true);
    assert.equal(listarPorCodigo(codigo).length, 501);
    assert.equal(contarRespostas(codigo), 501);
    encerrarAvaliacao(codigo);
    const modificado = structuredClone(QUESTIONARIO_MODELO);
    modificado.perguntas[0].texto =
      "Uma nova pergunta que não pode alterar o passado";
    const copia = guardarQuestionario({
      titulo: QUESTIONARIO_MODELO.titulo,
      questionario: modificado,
    });
    assert.notEqual(copia.id, id);
    const { obter } = await import("../lib/questionarios");
    assert.equal(
      obter(id)?.questionario.perguntas[0].texto,
      QUESTIONARIO_MODELO.perguntas[0].texto,
    );

    limparExpirados();
    assert.equal(listarAvaliacoesEmAndamento()[0].codigo, codigo);
    assert.equal(listarAvaliacoesEmAndamento()[0].encerrada, true);
    assert.equal(registrarRespostaAvaliacao(codigo, dados).ok, false);
    assert.equal(listarPorCodigo(codigo).length, 501);
  } finally {
    if (anterior === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = anterior;
    rmSync(pasta, { recursive: true, force: true });
  }
});
