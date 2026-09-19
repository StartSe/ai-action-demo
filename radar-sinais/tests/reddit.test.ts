import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

test("Reddit 403 pausa consultas, preserva outras fontes e volta a tentar após 15 minutos", async (t) => {
  const pasta = mkdtempSync(path.join(tmpdir(), "radar-reddit-"));
  const dataDir = process.env.DATA_DIR;
  process.env.DATA_DIR = pasta;
  t.after(() => {
    if (dataDir === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = dataDir;
    rmSync(pasta, { recursive: true, force: true });
  });
  let agora = Date.now();
  let status = 403;
  let chamadas = 0;
  t.mock.method(Date, "now", () => agora);
  const erros = t.mock.method(console, "error", () => {});
  const avisos = t.mock.method(console, "warn", () => {});
  t.mock.method(global, "fetch", async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes("reddit.com")) {
      chamadas++;
      return status === 200
        ? Response.json({ data: { children: [{ data: { title: "Discussão", permalink: "/r/test/comments/1", subreddit: "test", created_utc: agora / 1000 } }] } })
        : new Response(null, { status });
    }
    if (url.includes("algolia.com")) return Response.json({ hits: [{ title: "Notícia", url: "https://example.com/noticia", objectID: "1", created_at: new Date(agora).toISOString() }] });
    throw new Error(`Fetch inesperado: ${url}`);
  });
  const { estadoDasFontes, buscarDetalhado, ErroBusca } = await import("../lib/busca");
  assert.equal((await estadoDasFontes(["reddit"]))[0].estado, "indisponivel");
  const resultado = await buscarDetalhado({ consulta: "IA", dias: 7, provedores: ["reddit", "hackernews"] });
  assert.equal(resultado.achados.length, 1);
  assert.equal(resultado.fontes.find(f => f.id === "reddit")?.estado, "indisponivel");
  await assert.rejects(buscarDetalhado({ consulta: "IA", dias: 7, provedores: ["reddit"] }), ErroBusca);
  assert.equal(chamadas, 1, "não repete requisição durante o bloqueio");
  assert.equal(erros.mock.callCount(), 0);
  assert.equal(avisos.mock.callCount(), 1);

  agora += 15 * 60_000 + 1;
  status = 200;
  const recuperado = await buscarDetalhado({ consulta: "IA", dias: 7, provedores: ["reddit"] });
  assert.equal(chamadas, 2);
  assert.equal(recuperado.fontes[0].estado, "ok");
  assert.equal(recuperado.achados[0].fonte, "reddit");
  assert.equal((await estadoDasFontes(["reddit"]))[0].estado, "ok");

  agora += 1001;
  status = 500;
  await assert.rejects(buscarDetalhado({ consulta: "IA", dias: 7, provedores: ["reddit"] }), ErroBusca);
  assert.equal(erros.mock.callCount(), 1, "falhas inesperadas continuam visíveis");
});
