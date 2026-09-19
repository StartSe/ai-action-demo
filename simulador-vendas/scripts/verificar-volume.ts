import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { getConfig, setConfig } from "../lib/store";
const pasta = process.env.DATA_DIR!;
const chave = path.join(pasta, "chave-mestra");
const referencia = path.join(pasta, "chave-referencia");
if (process.argv[2] === "preparar") {
  setConfig("TESTE_VOLUME", "configuração preservada");
  fs.copyFileSync(chave, referencia);
} else {
  assert.equal(process.getuid?.(), 1000, "o serviço deve rodar sem privilégios de root");
  assert.equal(getConfig("TESTE_VOLUME"), "configuração preservada");
  assert.deepEqual(fs.readFileSync(chave), fs.readFileSync(referencia), "a chave deve permanecer idêntica");
  assert.equal(fs.statSync(chave).mode & 0o777, 0o600);
  setConfig("TESTE_GRAVACAO", "ok");
  assert.equal(getConfig("TESTE_GRAVACAO"), "ok");
  console.log("Volume antigo recuperado; chave e configuração preservadas; serviço sem root.");
}
