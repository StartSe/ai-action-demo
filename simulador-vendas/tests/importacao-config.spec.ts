import { test, expect } from "./fixtures";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("LP usa scrape_as_markdown, salva o material e não cria produto quando a coleta falha", async () => {
  const { POST } = await import("../app/api/produtos/route");
  const { setConfig } = await import("../lib/store");
  const { listarFontes, listar, apagar } = await import("../lib/produtos");
  const original = globalThis.fetch;
  const metodos: string[] = [];
  const texto = "# Produto da LP\n" + "Gestão comercial para equipes, com relatórios e suporte. ".repeat(15);
  setConfig("BRIGHTDATA_API_KEY", "chave-ficticia-teste");
  globalThis.fetch = async (_url, init) => {
    const rpc = JSON.parse(String(init?.body));
    metodos.push(rpc.method);
    if (rpc.method === "notifications/initialized") return new Response(null, { status: 202 });
    if (rpc.method === "tools/call") {
      expect(rpc.params).toEqual({ name: "scrape_as_markdown", arguments: { url: "https://example.com/" } });
      return Response.json({ jsonrpc: "2.0", id: rpc.id, result: { content: [{ type: "text", text: texto }] } });
    }
    return Response.json({ jsonrpc: "2.0", id: rpc.id, result: { protocolVersion: "2025-03-26" } }, { headers: { "Mcp-Session-Id": "teste" } });
  };
  let id: string | undefined;
  try {
    const res = await POST(new Request("http://localhost/api/produtos", { method: "POST", body: JSON.stringify({ url: "https://example.com/" }) }));
    expect(res.status).toBe(200);
    const produto = await res.json(); id = produto.id;
    expect(produto.nome).toBe("Produto da LP");
    expect(produto.status).toBe("rascunho");
    expect(listarFontes(produto.id)[0].conteudo).toBe(texto);
    expect(metodos).toEqual(["initialize", "notifications/initialized", "tools/call"]);
    const antes = listar().length;
    globalThis.fetch = async () => new Response(null, { status: 401 });
    const falha = await POST(new Request("http://localhost/api/produtos", { method: "POST", body: JSON.stringify({ url: "https://example.com/" }) }));
    expect(falha.status).toBe(422);
    expect(listar()).toHaveLength(antes);
    const interno = await POST(new Request("http://localhost/api/produtos", { method: "POST", body: JSON.stringify({ url: "http://127.0.0.1/" }) }));
    expect(interno.status).toBe(422);
  } finally { globalThis.fetch = original; setConfig("BRIGHTDATA_API_KEY", null); if (id) apagar(id); }
});

test("limpeza protege origem e conta, preserva dados reais e não semeia novamente após reiniciar", async () => {
  const { DELETE } = await import("../app/api/setup/exemplos/route");
  const { criar, listarTodos, apagar } = await import("../lib/produtos");
  const { setConfig, getConfig } = await import("../lib/store");
  const real = criar({ nome: "Produto real" });
  const removivel = criar({ nome: "Exemplo removível", exemplo: true });
  setConfig("BRIGHTDATA_API_KEY", "preservar-config-teste");
  const anterior = process.env.CONTA_DESLIGADA;
  try {
    delete process.env.CONTA_DESLIGADA;
    expect((await DELETE(new Request("http://localhost/api/setup/exemplos", { method: "DELETE", headers: { origin: "http://localhost" } }))).status).toBe(401);
    process.env.CONTA_DESLIGADA = "1";
    expect((await DELETE(new Request("http://localhost/api/setup/exemplos", { method: "DELETE", headers: { origin: "https://externo.test" } }))).status).toBe(403);
    expect((await DELETE(new Request("http://localhost/api/setup/exemplos", { method: "DELETE", headers: { origin: "http://localhost" } }))).status).toBe(200);
    expect(listarTodos().some(p => p.id === real.id)).toBe(true);
    expect(listarTodos().some(p => p.id === removivel.id)).toBe(false);
    expect(getConfig("BRIGHTDATA_API_KEY")).toBe("preservar-config-teste");
    apagar(real.id);
    const pasta = mkdtempSync(join(tmpdir(), "simulador-reinicio-"));
    try {
      const env = { ...process.env, DATA_DIR: pasta };
      const limpar = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", `import { semearDemonstracao } from './lib/semear-demo.ts'; import { listarTodos } from './lib/produtos.ts'; import { DELETE } from './app/api/setup/exemplos/route.ts'; semearDemonstracao(); if (!listarTodos().length) process.exit(3); const r = await DELETE(new Request('http://localhost/api/setup/exemplos', { method: 'DELETE', headers: { origin: 'http://localhost' } })); if (r.status !== 200 || listarTodos().length) process.exit(4);`], { env, encoding: "utf8" });
      expect(limpar.status, limpar.stderr).toBe(0);
      const reinicio = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", `import { semearDemonstracao } from './lib/semear-demo.ts'; import { listarTodos } from './lib/produtos.ts'; semearDemonstracao(); if (listarTodos().length) process.exit(2);`], { env, encoding: "utf8" });
      expect(reinicio.status, reinicio.stderr).toBe(0);
    } finally { rmSync(pasta, { recursive: true, force: true }); }
  } finally {
    if (anterior === undefined) delete process.env.CONTA_DESLIGADA; else process.env.CONTA_DESLIGADA = anterior;
    setConfig("BRIGHTDATA_API_KEY", null); setConfig("DEMO_REMOVIDA", null); apagar(real.id);
  }
});

test("cadastro por link abre produto importado e banner conectado oferece gerenciar exemplos", async ({ page }) => {
  let conectada = false;
  await page.route("**/api/status", route => route.fulfill({ json: { ai: conectada, demo: !conectada, model: "teste", integrations: {} } }));
  await page.route("**/api/produtos", async route => {
    if (route.request().method() === "POST") {
      expect(route.request().postDataJSON().url).toBe("https://example.com/produto");
      return route.fulfill({ json: { id: "lp-teste", aviso: "Página importada. Revise a ficha." } });
    }
    return route.fulfill({ json: { itens: [{ id: "exemplo", nome: "Demonstração", exemplo: true, status: "rascunho", materiais: 0, simulacoes: 0, atualizadoEm: new Date().toISOString() }] } });
  });
  await page.goto("/produtos");
  await expect(page.getByRole("link", { name: "Conectar a IA", exact: true })).toBeVisible();
  conectada = true;
  await page.evaluate(() => window.dispatchEvent(new Event("configuracao-atualizada")));
  await expect(page.getByRole("link", { name: "Gerenciar dados de exemplo" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Conectar a IA", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "+ Novo produto" }).click();
  await page.getByLabel("Link da página de vendas").fill("https://example.com/produto");
  await page.getByRole("button", { name: "Importar produto" }).click();
  await expect(page).toHaveURL(/\/produtos\/lp-teste$/);
});

test("LP com IA gera ficha para revisão e mantém o material quando a IA falha", async () => {
  const { POST } = await import("../app/api/produtos/route");
  const { setConfig } = await import("../lib/store");
  const { listarFontes, obter, apagar } = await import("../lib/produtos");
  const original = globalThis.fetch;
  const ids: string[] = [];
  let falhar = false;
  setConfig("BRIGHTDATA_API_KEY", "teste"); setConfig("OPENROUTER_API_KEY", "teste");
  globalThis.fetch = async (url, init) => {
    if (String(url).includes("openrouter.ai")) {
      if (falhar) return new Response(null, { status: 503 });
      return Response.json({ choices: [{ message: { content: JSON.stringify({ resumo: "Sistema comercial da LP.", publico: "Equipes de vendas", beneficios: ["Relatórios"], diferenciais: [], objecoes: [], concorrentes: [] }) } }] });
    }
    const rpc = JSON.parse(String(init?.body));
    if (rpc.method === "notifications/initialized") return new Response(null, { status: 202 });
    const result = rpc.method === "initialize" ? { protocolVersion: "2025-03-26" } : { content: [{ type: "text", text: "# Sistema comercial\n" + "Relatórios de vendas para equipes comerciais. ".repeat(12) }] };
    // O serviço hospedado também pode responder com SSE, mantendo a sessão.
    return new Response(`data: ${JSON.stringify({ jsonrpc: "2.0", id: rpc.id, result })}\n\n`, { headers: { "content-type": "text/event-stream", "Mcp-Session-Id": "sessao" } });
  };
  try {
    const cadastrar = async () => {
      const res = await POST(new Request("http://localhost/api/produtos", { method: "POST", body: JSON.stringify({ url: "https://example.com/" }) }));
      expect(res.status).toBe(200);
      const produto = await res.json(); ids.push(produto.id); return produto;
    };
    const produto = await cadastrar();
    expect(obter(produto.id)?.conhecimento?.resumo).toBe("Sistema comercial da LP.");
    expect(obter(produto.id)?.status).toBe("rascunho");
    falhar = true;
    const falha = await cadastrar();
    expect(falha.aviso).toContain("material está salvo");
    expect(listarFontes(falha.id)).toHaveLength(1);
    expect(obter(falha.id)?.conhecimento).toBeUndefined();
  } finally {
    globalThis.fetch = original;
    setConfig("BRIGHTDATA_API_KEY", null); setConfig("OPENROUTER_API_KEY", null);
    for (const id of ids) apagar(id);
  }
});
