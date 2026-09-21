import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const dir = mkdtempSync(join(tmpdir(), "daily-test-"));
process.env.DATA_DIR = dir;
const {
  save,
  note,
  notes,
  revisions,
  links,
  exclusive,
  retrieve,
  propose,
  actions,
  db,
  clearDemo,
} = await import("./brain");
const { setConfig, getConfig } = await import("./store");
const { organize, chat, artifact } = await import("./agent");
const { validateZapier, execute, agentTools } = await import("./zapier");
const { GET: exportVault } = await import("../app/api/export/route");
const { unzipSync, strFromU8 } = await import("fflate");
test.after(() => {
  db().close();
  rmSync(dir, { recursive: true, force: true });
});
test("raw imutável, revisões e proteção contra edição de versão antiga", () => {
  const raw = save({ kind: "raw", title: "Reunião", content: "Decisão A." });
  assert.throws(() => save({ ...raw, content: "Perdido" }), /original/);
  const a = save({
    kind: "wiki",
    title: "Decisões",
    content: "Aprovamos A.",
    sources: [raw.id],
  });
  const b = save({ ...a, content: "Aprovamos A e B." });
  assert.equal(revisions(a.id).length, 2);
  assert.equal(revisions(a.id)[1].content, a.content);
  assert.throws(() => save({ ...a, content: "Outra edição" }), /mudou/);
  assert.equal(note(a.id).revision, 2);
  assert.equal(note(raw.id).content, "Decisão A.");
  assert.ok(
    readFileSync(join(dir, "vault/wiki", b.id + ".md"), "utf8").includes(
      'aliases: ["Decisões"]',
    ),
  );
  assert.throws(
    () => save({ kind: "wiki", title: "decisões", content: "Duplicata" }),
    /Já existe/,
  );
  assert.throws(
    () =>
      save({
        kind: "wiki",
        title: "Inventado",
        content: "Fonte",
        sources: ["inexistente"],
      }),
    /não encontrada/,
  );
});
test("links, recuperação por relevância e exportação de Markdown sem segredos", async () => {
  const a = save({
    kind: "wiki",
    title: "Aprendizagem",
    content: "Veja [[Decisões]].",
    tags: ["educação"],
  });
  assert.equal(links(a, notes())[0].title, "Decisões");
  assert.equal(retrieve("educação", notes(), 1)[0].id, a.id);
  setConfig("OPENROUTER_API_KEY", "segredo-de-teste");
  assert.equal(getConfig("OPENROUTER_API_KEY"), "segredo-de-teste");
  const stored = db()
    .prepare("SELECT valor FROM config WHERE chave='OPENROUTER_API_KEY'")
    .get() as { valor: string };
  assert.ok(!stored.valor.includes("segredo-de-teste"));
  const r = await exportVault(new Request("http://localhost/api/export"));
  assert.equal(r.status, 200);
  const files = unzipSync(new Uint8Array(await r.arrayBuffer()));
  assert.ok(files["REGRAS.md"]);
  assert.ok(files[`wiki/${a.id}.md`]);
  assert.ok(strFromU8(files[`wiki/${a.id}.md`]).includes("[[Decisões]]"));
  assert.ok(
    !Object.values(files)
      .map((f) => strFromU8(f))
      .join()
      .includes("segredo-de-teste"),
  );
});
test("trava de execução não repete o trabalho simultâneo", async () => {
  let release!: () => void;
  const pending = exclusive(
    "test",
    () =>
      new Promise<void>((r) => {
        release = r;
      }),
  );
  await assert.rejects(() => exclusive("test", async () => true), /Já estou/);
  release();
  await pending;
  assert.equal(await exclusive("test", async () => 42), 42);
});
test("renomear atualiza links e revisões sem mudar fontes originais", () => {
  const target = save({
    kind: "wiki",
    title: "Título anterior",
    content: "Um fato.",
  });
  const source = save({
    kind: "raw",
    title: "Original com link",
    content: "Veja [[Título anterior]].",
  });
  const linked = save({
    kind: "wiki",
    title: "Nota relacionada",
    content: "Veja [[Título anterior]] e [[Título anterior|outra forma]].",
    sources: [source.id],
  });
  save({ ...target, title: "Título atualizado" });
  assert.equal(
    note(linked.id).content,
    "Veja [[Título atualizado]] e [[Título atualizado|outra forma]].",
  );
  assert.equal(note(linked.id).revision, 2);
  assert.equal(note(source.id).content, "Veja [[Título anterior]].");
});
test("Zapier só aceita servidor oficial HTTPS e ação nunca executa sem aprovação", async () => {
  for (const url of [
    "http://mcp.zapier.com/x",
    "https://127.0.0.1/x",
    "https://mcp.zapier.com.evil.test/x",
    "https://user:pass@mcp.zapier.com/x",
    "https://mcp.zapier.com:8888/x",
  ])
    assert.throws(() => validateZapier(url));
  assert.equal(
    validateZapier("https://mcp.zapier.com/api/mcp/s/abc"),
    "https://mcp.zapier.com/api/mcp/s/abc",
  );
  const a = propose("send_email", { to: "example@test.com" });
  assert.equal(actions().find((x) => x.id === a.id)?.status, "pending");
  db().prepare("UPDATE actions SET status='done' WHERE id=?").run(a.id);
  await assert.rejects(() => execute(a.id), /já foi processada/);
});
test("organização, chat e artefato usam provedor selecionado, preservam fontes e falham sem inventar resultado", async () => {
  setConfig("BRAIN_PROVIDER", "openrouter");
  setConfig("OPENROUTER_API_KEY", "test-key");
  const example = save({
    kind: "wiki",
    title: "Pesquisa fictícia",
    content: "EXEMPLO_NAO_USAR_COMO_FATO",
    demo: true,
  });
  const original = globalThis.fetch;
  const raw = save({
    kind: "raw",
    title: "Pesquisa de clientes",
    content: "Três clientes pedem integração. Hipótese: testar com um piloto.",
  });
  let response = JSON.stringify({
    title: "Pesquisa",
    content:
      "## Evidência\nTrês pedidos.\n\n## Hipótese\nPiloto. Veja [[Decisões]].",
    tags: ["clientes"],
  });
  const requests: Record<string, unknown>[] = [];
  globalThis.fetch = async (_url, init) => {
    requests.push(JSON.parse(String(init?.body)));
    return Response.json({ choices: [{ message: { content: response } }] });
  };
  try {
    const wiki = await organize(raw.id);
    assert.deepEqual(wiki.sources, [raw.id]);
    assert.equal(note(raw.id).status, "organized");
    assert.equal(note(raw.id).content, raw.content);
    await assert.rejects(() => organize(raw.id), /já foi organizada/);
    response = "Há uma hipótese de piloto em [[Pesquisa]].";
    const m = await chat("O que aprendemos com os clientes?");
    assert.equal(m.content, response);
    assert.ok(m.sources.includes(wiki.id));
    assert.ok(JSON.stringify(requests.at(-1)).includes("Três pedidos"));
    const out = await artifact("Plano do piloto");
    assert.ok(
      JSON.stringify(requests.at(-1)).includes(
        "O que aprendemos com os clientes?",
      ),
    );
    assert.equal(out.kind, "outputs");
    assert.ok(out.sources.includes(wiki.id));
    assert.ok(!out.sources.includes(example.id));
    assert.ok(!m.sources.includes(example.id));
    assert.ok(!JSON.stringify(requests).includes("EXEMPLO_NAO_USAR_COMO_FATO"));
    const second = save({
      kind: "raw",
      title: "Outra pesquisa",
      content: "Contradição: nenhum cliente confirmou.",
    });
    response = "not json";
    await assert.rejects(() => organize(second.id), /estrutura válida/);
    assert.equal(note(second.id).status, "inbox");
    globalThis.fetch = async () => new Response("", { status: 402 });
    await assert.rejects(() => chat("Teste"), /sem créditos/);
  } finally {
    globalThis.fetch = original;
  }
});
test("limpar exemplos preserva memórias próprias e a cadeia de fontes usada por elas", () => {
  const source = save({
    kind: "raw",
    title: "Fonte fictícia protegida",
    content: "Exemplo",
    demo: true,
  });
  const parent = save({
    kind: "wiki",
    title: "Exemplo citado",
    content: "Exemplo",
    sources: [source.id],
    demo: true,
  });
  const personal = save({
    kind: "outputs",
    title: "Minha análise do exemplo",
    content: "Analisei esta hipótese.",
    sources: [parent.id],
  });
  const disposable = save({
    kind: "raw",
    title: "Exemplo descartável",
    content: "Exemplo",
    demo: true,
  });
  const result = clearDemo();
  assert.ok(result.removed >= 1);
  assert.ok(result.preserved >= 2);
  assert.throws(() => note(disposable.id), /não encontrada/);
  assert.equal(note(personal.id).content, personal.content);
  assert.equal(note(source.id).content, source.content);
  assert.equal(note(parent.id).sources[0], source.id);
});
test("protocolo MCP descobre ferramentas, prepara aprovação e coleta uma vez", async () => {
  setConfig("ZAPIER_MCP_URL", "https://mcp.zapier.com/api/mcp/s/fixture");
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (_input, init) => {
    if (init?.method !== "POST") return new Response(null, { status: 405 });
    const req = JSON.parse(String(init.body));
    if (req.id === undefined) return new Response(null, { status: 202 });
    const result =
      req.method === "initialize"
        ? {
            protocolVersion: req.params.protocolVersion,
            capabilities: { tools: {} },
            serverInfo: { name: "fixture", version: "1" },
          }
        : req.method === "tools/list"
          ? {
              tools: [
                {
                  name: "read_notes",
                  description: "Ler notas",
                  inputSchema: {
                    type: "object",
                    properties: { query: { type: "string" } },
                  },
                },
              ],
            }
          : {
              content: [
                { type: "text", text: "Resultado da coleta autorizada" },
              ],
            };
    if (req.method === "tools/call") calls++;
    return Response.json({ jsonrpc: "2.0", id: req.id, result });
  };
  try {
    const tools = await agentTools();
    assert.equal(tools.length, 1);
    const pending = JSON.parse(await tools[0].call({ query: "projeto" }));
    assert.equal(pending.pending, true);
    assert.equal(calls, 0);
    const collected = await execute(pending.id);
    assert.equal(calls, 1);
    assert.equal(collected.kind, "raw");
    assert.ok(collected.content.includes("coleta autorizada"));
    await assert.rejects(() => execute(pending.id), /já foi processada/);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = original;
    setConfig("ZAPIER_MCP_URL", null);
  }
});
