import assert from "node:assert/strict";
import { test, after } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "entrevista-timeout-"));
process.env.OPENROUTER_API_KEY = "teste-sem-rede";
const { askText, askJSON, ErroIA } = await import("./ai");
const { abrirBanco } = await import("./store");
after(() => { abrirBanco().close(); fs.rmSync(process.env.DATA_DIR!, { recursive: true, force: true }); });
function timeout(err: unknown) {
  assert.ok(err instanceof ErroIA);
  assert.equal(err.codigo, "tempo_esgotado");
  assert.equal(err.status, 504);
  assert.equal(err.acao?.url, "/setup#openrouter");
  return true;
}
test("timeout antes dos cabeçalhos vira erro com ação para o gestor", async t => {
  t.mock.method(globalThis, "fetch", async () => { throw new DOMException("aborted", "TimeoutError"); });
  await assert.rejects(askText({ system: "teste", prompt: "teste" }), timeout);
});
test("timeout lendo o corpo após HTTP 200 não escapa como DOMException", async t => {
  t.mock.method(globalThis, "fetch", async () => {
    const res = new Response(null, { status: 200 });
    res.json = async () => { throw new DOMException("aborted", "TimeoutError"); };
    return res;
  });
  await assert.rejects(askJSON({ system: "teste", prompt: "teste", limiteMs: 90000 }), timeout);
});
test("AbortError lendo corpo após expiração usa o mesmo prazo da chamada", async t => {
  t.mock.method(globalThis, "fetch", async (_url: unknown, opts?: RequestInit) => {
    const signal = opts!.signal!;
    return new Response(new ReadableStream({ start(c) {
      signal.addEventListener("abort", () => c.error(new DOMException("aborted", "AbortError")), { once: true });
    } }), { status: 200 });
  });
  // Mantém o event loop vivo: AbortSignal.timeout não mantém o processo sozinho.
  const vivo = setTimeout(() => {}, 1000);
  try { await assert.rejects(askText({ system: "teste", prompt: "teste", limiteMs: 10 }), timeout); }
  finally { clearTimeout(vivo); }
});
test("correção de JSON compartilha o prazo total em vez de reiniciar o relógio", async t => {
  const sinais: AbortSignal[] = [];
  t.mock.method(globalThis, "fetch", async (_url: unknown, opts?: RequestInit) => {
    sinais.push(opts!.signal as AbortSignal);
    return Response.json({ choices: [{ message: { content: sinais.length === 1 ? "inválido" : '{"ok":true}' } }] });
  });
  assert.deepEqual(await askJSON({ system: "teste", prompt: "teste", limiteMs: 90000 }), { ok: true });
  assert.equal(sinais.length, 2);
  assert.equal(sinais[0], sinais[1]);
});
