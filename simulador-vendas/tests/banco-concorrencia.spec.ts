import { test, expect } from "@playwright/test";
import { execFile } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

// Processos reais e banco temporário: a contenção precisa acontecer fora do event loop
// bloqueado pelo DatabaseSync para verificar se a espera de escrita funciona.
async function executar(codigo: string) {
  const dir = mkdtempSync(join(tmpdir(), "simulador-lock-tests-"));
  try {
    return await promisify(execFile)(process.execPath, ["--import", "tsx", "--input-type=module", "-e", `
      import assert from 'node:assert/strict';
      import { spawn } from 'node:child_process';
      import { once } from 'node:events';
      import { join } from 'node:path';
      async function importar(nome) { const m = await import('./lib/' + nome + '.ts'); return m.default ?? m; }
      async function bloquear() {
        const filho = spawn(process.execPath, ['--input-type=module', '-e',
          "import {DatabaseSync} from 'node:sqlite'; const d = new DatabaseSync(process.argv[1]); d.exec('BEGIN IMMEDIATE'); process.send('pronto'); setTimeout(()=>{d.exec('COMMIT'); d.close()},400);",
          join(process.env.DATA_DIR, 'app.sqlite')], {stdio:['ignore','ignore','inherit','ipc']});
        const fim = once(filho, 'exit');
        await once(filho, 'message');
        return {fim, filho};
      }
      ${codigo}
    `], { env: { ...process.env, DATA_DIR: dir }, timeout: 15000 });
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

test("limpeza da inicialização aguarda a escrita de outro processo sem SQLITE_BUSY", async () => {
  const resultado = await executar(`
    for (const nome of ['historico','formularios','salas']) {
      const {limparExpirados} = await importar(nome);
      limparExpirados();
      const lock = await bloquear();
      try { limparExpirados(); } finally { await lock.fim; }
    }
    const {abrirBanco} = await importar('store');
    assert.equal(abrirBanco().prepare('PRAGMA journal_mode').get().journal_mode, 'wal');
    console.log('limpeza-ok');
  `);
  expect(resultado.stdout).toContain("limpeza-ok");
});

test("inicialização que encontra bloqueio pode tentar novamente sem esquema incompleto", async () => {
  const resultado = await executar(`
    const {abrirBanco} = await importar('store');
    const d = abrirBanco();
    d.exec('PRAGMA busy_timeout = 20');
    const {banco} = await importar('banco');
    const lock = await bloquear();
    try { assert.throws(() => banco(), /database is locked/); } finally { await lock.fim; }
    d.exec('PRAGMA busy_timeout = 5000');
    assert.equal(banco().prepare('SELECT COUNT(*) AS total FROM produtos').get().total, 1);
    assert.equal(banco().prepare('SELECT COUNT(*) AS total FROM mensagens_sessao').get().total, 0);
    console.log('recuperacao-ok');
  `);
  expect(resultado.stdout).toContain("recuperacao-ok");
});

test("site e agentes podem migrar simultaneamente preservando os dados existentes", async () => {
  const resultado = await executar(`
    const {abrirBanco} = await importar('store');
    const d = abrirBanco();
    d.exec("CREATE TABLE produtos (id TEXT PRIMARY KEY, nome TEXT, descricao TEXT, categoria TEXT, conhecimento TEXT, status TEXT, exemplo INTEGER, criadoEm TEXT, atualizadoEm TEXT); INSERT INTO produtos VALUES ('real', 'Produto real', NULL, NULL, NULL, 'rascunho', 0, '', '')");
    const filhos = Array.from({length:4}, () => spawn(process.execPath,
      ['--import','tsx','--input-type=module','-e', "const m=await import('./lib/banco.ts'); const d=(m.default ?? m).banco(); console.log(d.prepare('SELECT nome FROM produtos WHERE id = ?').get('real').nome);"],
      {env:process.env, stdio:['ignore','pipe','pipe']}));
    await Promise.all(filhos.map(async filho => {
      let saida='', erros=''; filho.stdout.on('data', c=>saida+=c); filho.stderr.on('data', c=>erros+=c);
      const [code] = await once(filho,'exit'); assert.equal(code,0,erros); assert.match(saida,/Produto real/);
    }));
    assert.equal(d.prepare('SELECT COUNT(*) AS total FROM produtos').get().total,1);
    console.log('concorrencia-ok');
  `);
  expect(resultado.stdout).toContain("concorrencia-ok");
});
