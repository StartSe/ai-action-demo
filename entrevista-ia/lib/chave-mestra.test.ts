import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { carregarChaveMestra } from "./chave-mestra";

function diretorio(t: TestContext) {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), "entrevista-chave-"));
  t.after(() => fs.rmSync(pasta, { recursive: true, force: true }));
  return pasta;
}

test("instalação nova cria chave restrita e reinicialização mantém os mesmos bytes", (t) => {
  const pasta = diretorio(t);
  const chave = carregarChaveMestra(pasta, undefined, () => false);
  assert.equal(chave.length, 32);
  assert.equal(fs.statSync(path.join(pasta, "chave-mestra")).mode & 0o777, 0o600);
  assert.deepEqual(carregarChaveMestra(pasta, undefined, () => true), chave);
  assert.deepEqual(fs.readdirSync(pasta), ["chave-mestra"]);
});

test("EACCES na leitura não tenta substituir chave existente", (t) => {
  const pasta = diretorio(t);
  const arquivo = path.join(pasta, "chave-mestra");
  const original = Buffer.alloc(32, 17);
  fs.writeFileSync(arquivo, original);
  const ler = fs.readFileSync;
  const mock = t.mock.method(fs, "readFileSync", ((caminho: fs.PathOrFileDescriptor, ...args: unknown[]) => {
    if (caminho === arquivo) throw Object.assign(new Error("permission denied"), { code: "EACCES" });
    return Reflect.apply(ler, fs, [caminho, ...args]);
  }) as typeof fs.readFileSync);
  const gravar = t.mock.method(fs, "writeFileSync", () => { throw new Error("Não deveria gravar"); });
  assert.throws(() => carregarChaveMestra(pasta, undefined, () => true), { code: "EACCES" });
  assert.equal(gravar.mock.callCount(), 0);
  mock.mock.restore();
  assert.deepEqual(fs.readFileSync(arquivo), original);
});

test("chave ausente com dados cifrados e chave inválida não geram substitutas", (t) => {
  const pasta = diretorio(t);
  assert.throws(() => carregarChaveMestra(pasta, undefined, () => true), /configurações cifradas/);
  assert.deepEqual(fs.readdirSync(pasta), []);
  fs.writeFileSync(path.join(pasta, "chave-mestra"), "danificada");
  assert.throws(() => carregarChaveMestra(pasta, undefined, () => true), /tamanho inválido/);
  assert.equal(fs.readFileSync(path.join(pasta, "chave-mestra"), "utf8"), "danificada");
  assert.throws(() => carregarChaveMestra(pasta, "invalida", () => false), /tamanho inválido/);
});

test("outro processo vence a criação: reutiliza sua chave, sem sobrescrever", (t) => {
  const pasta = diretorio(t);
  const arquivo = path.join(pasta, "chave-mestra");
  const vencedora = Buffer.alloc(32, 29);
  t.mock.method(fs, "linkSync", () => {
    fs.writeFileSync(arquivo, vencedora, { mode: 0o600, flag: "wx" });
    throw Object.assign(new Error("already exists"), { code: "EEXIST" });
  });
  assert.deepEqual(carregarChaveMestra(pasta, undefined, () => false), vencedora);
  assert.deepEqual(fs.readdirSync(pasta), ["chave-mestra"]);
});
