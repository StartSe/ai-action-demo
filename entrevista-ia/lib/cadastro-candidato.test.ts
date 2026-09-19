import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "cadastro-candidato-"));
const { POST } = await import("../app/api/candidatos/route");
const { obter } = await import("./candidatos");

test("cadastro simples preserva anotação do gestor e LinkedIn sem exigir contatos", async () => {
  const form = new FormData();
  form.set("nome", "Ana Silva");
  form.set("linkedinUrl", "https://linkedin.com/in/ana-silva");
  form.set("anotacao", "Indicada pela equipe. Conversar sobre disponibilidade.");
  const resposta = await POST(new Request("http://localhost/api/candidatos", { method: "POST", body: form }));
  assert.equal(resposta.status, 200);
  const { candidato } = await resposta.json();
  const salvo = obter(candidato.id);
  assert.equal(salvo?.ficha?.observacoes?.valor, "Indicada pela equipe. Conversar sobre disponibilidade.");
  assert.equal(salvo?.ficha?.observacoes?.origem, "gestor");
  assert.equal(salvo?.linkedinUrl, "https://linkedin.com/in/ana-silva");
  assert.equal(salvo?.pesquisaStatus, "nao_pedida");
});
test("anotação é opcional e texto acima do limite é recusado", async () => {
  for (const anotacao of ["", "a".repeat(1501)]) {
    const form = new FormData(); form.set("nome", "Bruno Alves"); form.set("anotacao", anotacao);
    const resposta = await POST(new Request("http://localhost/api/candidatos", { method: "POST", body: form }));
    assert.equal(resposta.status, anotacao ? 400 : 200);
  }
});
