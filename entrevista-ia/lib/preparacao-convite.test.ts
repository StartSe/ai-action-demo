import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test, after } from "node:test";
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "entrevista-link-"));
delete process.env.OPENROUTER_API_KEY;
const { criar: vagaNova, encerrar } = await import("./vagas");
const { criar: pessoaNova } = await import("./candidatos");
const { atribuirEConvidar } = await import("./convite");
const { entrevistaViva, lerRoteiro, obter } = await import("./entrevistas");
const { POST } = await import("../app/api/entrevistas/route");
const { lerPreparacaoConvite } = await import("./progresso-convite");
const { abrirBanco } = await import("./store");
after(() => { abrirBanco().close(); fs.rmSync(process.env.DATA_DIR!, { recursive: true, force: true }); });

test("rota gera convite com etapas reais e devolve entrevista com o código salvo", async () => {
  const vaga = vagaNova({ cargo: "Analista" });
  const pessoa = pessoaNova({ nome: "Pessoa teste" });
  const request = () => new Request("https://app.test/api/entrevistas", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/x-ndjson" }, body: JSON.stringify({ vagaId: vaga.id, candidatoId: pessoa.id }) });
  const etapas: string[] = [];
  const res = await POST(request());
  const dados = await lerPreparacaoConvite<{ entrevista: { id: string; codigo: string }; convite: { codigo: string } }>(res, etapa => etapas.push(etapa));
  assert.deepEqual([...new Set(etapas)], ["dados", "roteiro", "link"]);
  assert.equal(dados.entrevista.codigo, dados.convite.codigo);
  assert.ok(lerRoteiro(dados.entrevista.id));
  const repetida = await lerPreparacaoConvite<typeof dados>(await POST(request()), () => {});
  assert.equal(repetida.entrevista.id, dados.entrevista.id);
  assert.equal(repetida.convite.codigo, dados.convite.codigo);
});

test("falha na IA não libera link; nova tentativa reutiliza entrevista e cadastro", async (t) => {
  const vaga = vagaNova({ cargo: "Analista com falha" });
  const pessoa = pessoaNova({ nome: "Cadastro preservado" });
  const dados = { vagaId: vaga.id, candidatoId: pessoa.id, origem: "https://app.test" };
  process.env.OPENROUTER_API_KEY = "teste-sem-rede";
  t.mock.method(globalThis, "fetch", async () => new Response('{"error":{"message":"Indisponível"}}', { status: 401 }));
  t.mock.method(console, "error", () => {});
  try {
    const falha = await atribuirEConvidar(dados);
    assert.equal(falha.ok, false);
    if (!falha.ok) {
      assert.equal(falha.codigo, "chave_invalida");
      assert.equal(falha.acao?.url, "/setup#openrouter");
      assert.match(falha.erro, /chave.*recusada/);
    }
    const entrevista = entrevistaViva(vaga.id, pessoa.id)!;
    assert.ok(!entrevista.codigo, "não libera código sem roteiro");
    delete process.env.OPENROUTER_API_KEY;
    const recuperada = await atribuirEConvidar(dados);
    assert.ok(recuperada.ok);
    assert.equal(recuperada.entrevista.id, entrevista.id);
    assert.ok(recuperada.convite.codigo);
  } finally { delete process.env.OPENROUTER_API_KEY; }
});

test("encerrar a vaga durante a preparação impede liberar um novo link", async () => {
  const vaga = vagaNova({ cargo: "Vaga encerrada durante IA" });
  const pessoa = pessoaNova({ nome: "Pessoa" });
  let entrevistaId = "";
  const resultado = await atribuirEConvidar({ vagaId: vaga.id, candidatoId: pessoa.id, origem: "https://app.test", progresso: etapa => { if (etapa === "roteiro") { entrevistaId = entrevistaViva(vaga.id, pessoa.id)!.id; encerrar(vaga.id); } } });
  assert.equal(resultado.ok, false);
  if (!resultado.ok) assert.equal(resultado.status, 409);
  const interrompida = obter(entrevistaId);
  assert.ok(interrompida);
  assert.ok(!interrompida.codigo, "vaga encerrada não ganha link");
});
