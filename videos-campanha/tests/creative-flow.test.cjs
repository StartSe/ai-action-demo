/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS loader compiles the application TypeScript in isolated tests. */
const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const Module = require("node:module");
const ts = require("typescript");
const root = path.resolve(__dirname, "..");
const resolve = Module._resolveFilename;
Module._resolveFilename = function (name, ...rest) {
  return resolve.call(
    this,
    name.startsWith("@/") ? path.join(root, name.slice(2)) : name,
    ...rest,
  );
};
require.extensions[".ts"] = (module, file) =>
  module._compile(
    ts.transpileModule(fs.readFileSync(file, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText,
    file,
  );
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "creative-flow-test-"));
process.env.DATA_DIR = temp;
process.env.MUAPI_API_KEY = "test-only-key";
const model = require("../lib/flow/model.ts");
const store = require("../lib/flow/store.ts");
const provider = require("../lib/flow/provider.ts");
const flows = require("../app/api/flows/route.ts");
const generate = require("../app/api/flow-generate/route.ts");
const originalFetch = global.fetch;
after(() => {
  global.fetch = originalFetch;
  fs.rmSync(temp, { recursive: true, force: true });
});
const post = (url, body) =>
  new Request("http://test/" + url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
test("receitas são grafos válidos; ramificações mantêm contexto e rejeitam ciclos", () => {
  for (const r of model.RECIPES) {
    const p = model.recipe(r.id);
    model.validateProject(p);
    assert.equal(model.order(p).length, p.nodes.length);
  }
  const p = model.recipe("social");
  assert.equal(p.edges.filter((e) => e.source === p.nodes[1].id).length, 3);
  assert.deepEqual(
    model.context(p, p.nodes[2].id).map((n) => n.id),
    [p.nodes[0].id, p.nodes[1].id],
  );
  p.nodes[2].data.excluded = [p.nodes[0].id];
  assert.equal(model.context(p, p.nodes[2].id).length, 1);
  p.edges.push({
    id: "cycle",
    source: p.nodes[2].id,
    target: p.nodes[0].id,
    data: { kind: "input" },
  });
  assert.throws(() => model.order(p), /ciclo/);
});
test("armazenamento persiste projetos e rejeita sobrescrita por revisão antiga", async () => {
  const p = model.recipe("blank");
  const one = store.save(p);
  assert.equal(store.project(p.id).revision, 1);
  assert.throws(() => store.save(p), /outra aba/);
  assert.equal(store.save({ ...one, title: "Revisado" }).revision, 2);
  const bad = {
    ...one,
    edges: [
      {
        id: "bad",
        source: "missing",
        target: one.nodes[0].id,
        data: { kind: "input" },
      },
    ],
  };
  const r = await flows.PUT(
    new Request("http://test/api/flows", {
      method: "PUT",
      body: JSON.stringify(bad),
    }),
  );
  assert.equal(r.status, 400);
});
test("capabilities escolhem edição e validam duração, formato e referências", () => {
  const image = model.block("image", 0);
  assert.equal(provider.payload(image, "test", []).endpoint, "nano-banana-2");
  assert.equal(
    provider.payload(image, "test", ["https://test/image"]).endpoint,
    "nano-banana-2-edit",
  );
  const video = model.block("video", 0);
  assert.equal(
    provider.payload(video, "test", []).endpoint,
    "veo3.1-fast-text-to-video",
  );
  const p = provider.payload(video, "test", ["https://a", "https://b"]);
  assert.equal(p.body.image_url, "https://a");
  assert.equal(p.body.last_image, "https://b");
  assert.throws(
    () => provider.payload(video, "test", ["a", "b", "c"]),
    /até 2/,
  );
  video.data.ratio = "1:1";
  assert.throws(() => provider.payload(video, "test", []), /Formato/);
  assert.throws(
    () => provider.payload(model.block("transform", 0), "test", []),
    /Conecte/,
  );
});
test("geração envia contexto, preserva idempotência e publica asset para próxima etapa", async () => {
  const p = model.recipe("product");
  p.nodes[0].data.prompt = "Campanha de verão";
  p.nodes[1].data.prompt = "Produto ao pôr do sol";
  store.save(p);
  const calls = [];
  global.fetch = async (url, init) => {
    if (String(url).startsWith("https://cdn.example/"))
      return new Response(Buffer.from("test-image"), {
        headers: { "content-type": "image/png" },
      });
    if (String(url).endsWith("/upload_file"))
      return Response.json({ url: "https://cdn.example/reuploaded.png" });
    calls.push({ url, body: init.body ? JSON.parse(init.body) : undefined });
    return Response.json(
      init.method === "POST"
        ? { request_id: "remote-1" }
        : { status: "completed", outputs: ["https://cdn.example/result.png"] },
    );
  };
  const request = { id: "run-1", projectId: p.id, nodeId: p.nodes[1].id };
  const first = await generate.POST(post("api/flow-generate", request));
  assert.equal(first.status, 200);
  assert.equal((await first.json()).job.status, "pending");
  assert.match(calls[0].body.prompt, /Campanha de verão/);
  await generate.POST(post("api/flow-generate", request));
  assert.equal(calls.length, 1);
  const result = await generate.GET(
    new Request("http://test/api/flow-generate?id=run-1"),
  );
  const j = (await result.json()).job;
  assert.equal(j.status, "completed");
  assert.equal(
    store.assets().find((a) => a.id === "run-1").url,
    "/api/flow-assets/run-1/file",
  );
  const latest = store.project(p.id);
  latest.nodes[1].data.assetId = j.asset.id;
  store.save(latest);
  const second = await generate.POST(
    post("api/flow-generate", {
      id: "run-2",
      projectId: p.id,
      nodeId: p.nodes[2].id,
    }),
  );
  assert.equal(second.status, 200);
  assert.equal(
    calls.at(-1).body.image_url,
    "https://cdn.example/reuploaded.png",
  );
  assert.match(calls.at(-1).url, /image-to-video$/);
});
test("falha ambígua não dispara nova cobrança e referências ausentes bloqueiam antes do envio", async () => {
  const p = model.recipe("product");
  p.nodes[0].data.prompt = "Ideia para teste";
  store.save(p);
  let calls = 0;
  global.fetch = async () => {
    calls++;
    throw new Error("Network disconnected");
  };
  const missing = await generate.POST(
    post("api/flow-generate", {
      id: "missing",
      projectId: p.id,
      nodeId: p.nodes[2].id,
    }),
  );
  assert.equal(missing.status, 400);
  assert.equal(calls, 0);
  const request = { id: "ambiguous", projectId: p.id, nodeId: p.nodes[1].id };
  assert.equal(
    (await generate.POST(post("api/flow-generate", request))).status,
    400,
  );
  assert.equal(store.job("ambiguous").status, "uncertain");
  const duplicate = await generate.POST(
    post("api/flow-generate", { ...request, id: "retry" }),
  );
  assert.equal((await duplicate.json()).job.id, "ambiguous");
  assert.equal(calls, 1);
});
test("alteração de prompt invalida dependentes, posição não invalida e novo resultado preserva histórico", () => {
  const p = model.recipe("product");
  p.nodes[1].data.assetId = "old-image";
  p.nodes[2].data.assetId = "old-video";
  const moved = structuredClone(p);
  moved.nodes[0].position.x = 50;
  assert.equal(model.reconcile(p, moved).nodes[1].data.dirty, undefined);
  const changed = structuredClone(p);
  changed.nodes[0].data.prompt = "Nova ideia";
  const result = model.reconcile(p, changed);
  assert.equal(result.nodes[1].data.dirty, true);
  assert.equal(result.nodes[2].data.dirty, true);
  assert.equal(result.nodes[1].data.assetId, "old-image");
  const completed = structuredClone(result);
  completed.nodes[1].data.assetId = "new-image";
  completed.nodes[1].data.dirty = false;
  const next = model.reconcile(result, completed);
  assert.equal(next.nodes[1].data.dirty, false);
  assert.equal(next.nodes[2].data.dirty, true);
});
test("arquivos persistidos suportam reprodução por range e não dependem da URL do provedor", async () => {
  const media = require("../app/api/flow-assets/[id]/file/route.ts");
  const response = await media.GET(
    new Request("http://test/api/flow-assets/run-1/file", {
      headers: { range: "bytes=0-3" },
    }),
    { params: Promise.resolve({ id: "run-1" }) },
  );
  assert.equal(response.status, 206);
  assert.equal(await response.text(), "test");
  assert.equal(response.headers.get("content-range"), "bytes 0-3/10");
  const invalid = await media.GET(
    new Request("http://test/api/flow-assets/run-1/file", {
      headers: { range: "bytes=100-200" },
    }),
    { params: Promise.resolve({ id: "run-1" }) },
  );
  assert.equal(invalid.status, 416);
});
test("rejeição HTTP conhecida permite corrigir a chave e tentar novamente", async () => {
  const p = model.recipe("product");
  p.nodes[0].data.prompt = "Ideia";
  store.save(p);
  global.fetch = async () => new Response("{}", { status: 401 });
  const response = await generate.POST(
    post("api/flow-generate", {
      id: "rejected",
      projectId: p.id,
      nodeId: p.nodes[1].id,
    }),
  );
  assert.equal(response.status, 400);
  assert.equal(store.job("rejected").status, "failed");
});
test("reconciliação exige aguardar envio e recupera pelo ID sem criar outra geração", async () => {
  const p = model.recipe("product");
  p.nodes[0].data.prompt = "Teste";
  store.save(p);
  store.saveJob({
    id: "lost",
    projectId: p.id,
    nodeId: p.nodes[1].id,
    status: "uncertain",
    prompt: "Teste",
    kind: "image",
    title: "Imagem",
    createdAt: new Date().toISOString(),
  });
  const body = { id: "lost", requestId: "remote-recovered" };
  const tooEarly = await generate.PATCH(
    new Request("http://test/api/flow-generate", {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  );
  assert.equal(tooEarly.status, 400);
  store.saveJob({
    ...store.job("lost"),
    createdAt: new Date(Date.now() - 180000).toISOString(),
  });
  let reads = 0;
  global.fetch = async (_url, init) => {
    assert.equal(init.method, "GET");
    reads++;
    return Response.json({ status: "processing" });
  };
  const recovered = await generate.PATCH(
    new Request("http://test/api/flow-generate", {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  );
  assert.equal(recovered.status, 200);
  assert.equal(store.job("lost").requestId, "remote-recovered");
  assert.equal(reads, 1);
});
test("edição e referências enviam os nomes de campos documentados pela MuAPI", () => {
  const n = model.block("transform", 0);
  const image = provider.payload(n, "Editar", ["https://image"]);
  assert.deepEqual(image.body.images_list, ["https://image"]);
  assert.equal(image.body.image_urls, undefined);
  const v = model.block("video", 0);
  v.data.model = "veo3.1-reference";
  v.data.ratio = "Original";
  v.data.resolution = "1080p";
  const video = provider.payload(v, "Animar", ["https://a", "https://b"]);
  assert.equal(video.endpoint, "veo3.1-reference-to-video");
  assert.deepEqual(video.body.images_list, ["https://a", "https://b"]);
  assert.equal(video.body.resolution, "1080p");
  assert.equal(video.body.aspect_ratio, undefined);
});
test("Output entrega a entrada direta e rejeita mídia desatualizada", () => {
  const p = model.recipe("product");
  p.nodes[1].data.assetId = "image";
  p.nodes[2].data.assetId = "video";
  p.edges.push({
    id: "ref-output",
    source: p.nodes[1].id,
    target: p.nodes[3].id,
    data: { kind: "context" },
  });
  assert.equal(model.outputSource(p, p.nodes[3].id).id, p.nodes[2].id);
  p.nodes[2].data.dirty = true;
  assert.throws(() => model.outputSource(p, p.nodes[3].id), /Atualize/);
});
test("exclusão em etapa intermediária não esconde contexto herdado por outra etapa", () => {
  const p = model.recipe("product");
  p.nodes[1].data.excluded = [p.nodes[0].id];
  p.nodes[1].data.assetId = "image";
  p.nodes[2].data.assetId = "video";
  const edited = structuredClone(p);
  edited.nodes[0].data.prompt = "Nova ideia";
  const result = model.reconcile(p, edited);
  assert.equal(result.nodes[1].data.dirty, undefined);
  assert.equal(result.nodes[2].data.dirty, true);
  p.nodes[2].data.inherit = false;
  const directOnly = structuredClone(p);
  directOnly.nodes[0].data.prompt = "Outra ideia";
  assert.equal(model.reconcile(p, directOnly).nodes[2].data.dirty, undefined);
});
test("reabrir não recoloca uma geração removida ou uma versão substituída", () => {
  const p = model.recipe("product");
  p.nodes[0].data.prompt = "Campanha";
  const receipt = {
    id: "completed-result",
    nodeId: p.nodes[1].id,
    signature: model.generationSignature(p, p.nodes[1].id),
    asset: { id: "new-result", kind: "image" },
  };
  const applied = model.receiveGeneration(p, receipt);
  assert.equal(applied.nodes[1].data.assetId, "new-result");
  assert.equal(applied.nodes[1].data.lastJobId, receipt.id);
  const removed = structuredClone(applied);
  delete removed.nodes[1].data.assetId;
  assert.equal(model.receiveGeneration(removed, receipt), removed);
  const chosen = structuredClone(applied);
  chosen.nodes[1].data.assetId = "chosen-old-version";
  assert.equal(
    model.receiveGeneration(chosen, receipt).nodes[1].data.assetId,
    "chosen-old-version",
  );
});
test("resultado tardio permanece na biblioteca quando prompt, referência ou escolha mudou", () => {
  const p = model.recipe("product");
  p.nodes[0].data.prompt = "Campanha original";
  p.nodes[1].data.assetId = "previous";
  const receipt = {
    id: "late-result",
    nodeId: p.nodes[1].id,
    signature: model.generationSignature(p, p.nodes[1].id),
    asset: { id: "late-asset", kind: "image" },
  };
  for (const modify of [
    (n) => (n.data.prompt = "Nova instrução"),
    (n) => (n.data.referenceId = "new-reference"),
    (n) => (n.data.selectionVersion = 1),
  ]) {
    const edited = structuredClone(p);
    modify(edited.nodes[1]);
    edited.nodes[1].data.dirty = true;
    const received = model.receiveGeneration(edited, receipt);
    assert.equal(received.nodes[1].data.assetId, "previous");
    assert.equal(received.nodes[1].data.dirty, true);
    assert.equal(received.nodes[1].data.lastJobId, receipt.id);
  }
  const moved = structuredClone(p);
  moved.nodes[1].position.x = 900;
  moved.nodes[1].data.title = "Novo título";
  assert.equal(
    model.receiveGeneration(moved, receipt).nodes[1].data.assetId,
    "late-asset",
  );
});
test("gerações antigas sem assinatura não sobrescrevem escolhas atuais", () => {
  const p = model.recipe("product");
  p.nodes[1].data.assetId = "chosen";
  const received = model.receiveGeneration(p, {
    id: "legacy",
    nodeId: p.nodes[1].id,
    asset: { id: "legacy-asset", kind: "image" },
  });
  assert.equal(received.nodes[1].data.assetId, "chosen");
});
test("entrada direta tem prioridade sobre contexto herdado e ativos repetidos são deduplicados", () => {
  const p = model.recipe("character");
  p.nodes[1].data.assetId = "original";
  p.nodes[2].data.assetId = "edited";
  const plan = model.referencePlan(p, p.nodes[3].id);
  assert.deepEqual(
    plan.map((r) => [r.assetId, r.role]),
    [
      ["edited", "input"],
      ["original", "context"],
    ],
  );
  p.nodes[3].data.referenceId = "original";
  assert.deepEqual(
    model.referencePlan(p, p.nodes[3].id).map((r) => [r.assetId, r.role]),
    [
      ["edited", "input"],
      ["original", "input"],
    ],
  );
  p.nodes[3].data.referenceId = undefined;
  p.nodes[3].data.excluded = [p.nodes[1].id];
  assert.deepEqual(
    model.referencePlan(p, p.nodes[3].id).map((r) => r.assetId),
    ["edited"],
  );
});
test("API envia mídia direta antes do contexto e informa os papéis ao modelo", async () => {
  const p = model.recipe("character");
  p.nodes[0].data.prompt = "Campanha com personagem";
  p.nodes[1].data.assetId = "role-original";
  p.nodes[2].data.assetId = "role-edited";
  for (const [id, url] of [
    ["role-original", "https://media.test/original.png"],
    ["role-edited", "https://media.test/edited.png"],
  ])
    store.addAsset({
      id,
      url,
      kind: "image",
      projectId: p.id,
      nodeId: "",
      title: id,
      prompt: "",
      createdAt: new Date().toISOString(),
    });
  store.save(p);
  let sent;
  global.fetch = async (_url, init) => {
    sent = JSON.parse(init.body);
    return Response.json({ request_id: "role-remote" });
  };
  const response = await generate.POST(
    post("api/flow-generate", {
      id: "role-job",
      projectId: p.id,
      nodeId: p.nodes[3].id,
    }),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(sent.images_list, [
    "https://media.test/edited.png",
    "https://media.test/original.png",
  ]);
  assert.match(sent.prompt, /Imagem 1: entrada principal/);
  assert.match(sent.prompt, /Imagem 2: referência de contexto visual/);
  assert.equal(
    store.job("role-job").signature,
    model.generationSignature(p, p.nodes[3].id),
  );
});


test("Wan e Kling usam contratos próprios e rejeitam parâmetros incompatíveis", () => {
  const n = model.block("video", 0);
  Object.assign(n.data, { model: "wan2.2", duration: 6, resolution: "720p", ratio: "9:16" });
  const refs = ["https://cdn.example/start.png", "https://cdn.example/end.png"];
  assert.deepEqual(provider.payload(n, "Movimento", refs), {
    endpoint: "wan2.2-image-to-video",
    body: { prompt: "Movimento", aspect_ratio: "9:16", duration: 6, resolution: "720p", quality: "medium", image_url: refs[0], last_image: refs[1] },
  });
  assert.equal(provider.payload(n, "Movimento", []).endpoint, "wan2.2-text-to-video");
  n.data.duration = 10;
  assert.throws(() => provider.payload(n, "Movimento", refs), /segundos/);
  Object.assign(n.data, { model: "kling-v2.1-standard-i2v", duration: 5, resolution: "Automática" });
  assert.deepEqual(provider.payload(n, "Movimento", refs.slice(0, 1)), {
    endpoint: "kling-v2.1-standard-i2v",
    body: { prompt: "Movimento", aspect_ratio: "9:16", duration: 5, image_url: refs[0] },
  });
  assert.throws(() => provider.payload(n, "Movimento", []), /Conecte uma imagem/);
  assert.throws(() => provider.payload(n, "Movimento", refs), /até 1 imagens/);
});

test("uma imagem alimenta modelos distintos sem invalidar a ramificação vizinha", () => {
  const p = model.recipe("product");
  const source = p.nodes[1], left = p.nodes[2];
  const right = model.block("video", 4);
  source.data.assetId = "shared-image";
  left.data.assetId = "left-video";
  Object.assign(right.data, { model: "wan2.2", duration: 5, resolution: "480p", assetId: "right-video" });
  p.nodes.push(right);
  p.edges.push({ id: "branch", source: source.id, target: right.id, data: { kind: "input" } });
  model.validateProject(p);
  for (const n of [left, right]) assert.equal(model.referencePlan(p, n.id)[0].assetId, "shared-image");
  const next = structuredClone(p);
  next.nodes.find(n => n.id === right.id).data.model = "kling-v2.1-standard-i2v";
  const updated = model.reconcile(p, next);
  assert.equal(updated.nodes.find(n => n.id === right.id).data.dirty, true);
  assert.ok(!updated.nodes.find(n => n.id === left.id).data.dirty);
  assert.ok(!updated.nodes.find(n => n.id === source.id).data.dirty);
});


test("OAuth Higgsfield usa PKCE, state, resource e troca o código só na sessão correta", async () => {
  const config = require("../lib/store.ts");
  const oauth = require("../lib/mcp-oauth.ts");
  const start = require("../app/api/setup/oauth/mcp/[prefixo]/route.ts");
  const callback = require("../app/api/setup/oauth/mcp/[prefixo]/callback/route.ts");
  const crypto = require("node:crypto");
  config.setConfig("HIGGSFIELD_URL", "https://mcp.higgsfield.ai");
  const calls = [];
  global.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url).endsWith("oauth-protected-resource")) return Response.json({ resource: "https://mcp.higgsfield.ai/mcp", authorization_servers: ["https://auth.example"], scopes_supported: ["openid", "email", "offline_access"] });
    if (String(url).endsWith("oauth-authorization-server")) return Response.json({ authorization_endpoint: "https://auth.example/authorize", token_endpoint: "https://auth.example/token", registration_endpoint: "https://auth.example/register" });
    if (String(url).endsWith("/register")) return Response.json({ client_id: "test-client" });
    if (String(url).endsWith("/token")) return Response.json({ access_token: "private-test-token", refresh_token: "private-test-refresh", expires_in: 3600 });
    throw Error("Unexpected OAuth URL");
  };
  const ctx = { params: Promise.resolve({ prefixo: "HIGGSFIELD" }) };
  const response = await start.GET(new Request("http://localhost/api/setup/oauth/mcp/HIGGSFIELD"), ctx);
  assert.equal(response.status, 302);
  const destination = new URL(response.headers.get("location"));
  assert.equal(destination.searchParams.get("resource"), "https://mcp.higgsfield.ai/mcp");
  assert.equal(destination.searchParams.get("scope"), "openid email offline_access");
  const cookies = response.headers.getSetCookie();
  const verifier = cookies.find(c => c.startsWith("mcp_HIGGSFIELD_verifier=")).split(";")[0].split("=")[1];
  assert.equal(destination.searchParams.get("code_challenge"), crypto.createHash("sha256").update(verifier).digest("base64url"));
  const cookie = cookies.map(c => c.split(";")[0]).join("; ");
  const before = calls.length;
  const rejected = await callback.GET(new Request("http://localhost/api/setup/oauth/mcp/HIGGSFIELD/callback?code=test&state=wrong", { headers: { cookie } }), ctx);
  assert.match(rejected.headers.get("location"), /erro=/);
  assert.equal(calls.length, before);
  const result = await callback.GET(new Request("http://localhost/api/setup/oauth/mcp/HIGGSFIELD/callback?code=test&state=" + destination.searchParams.get("state"), { headers: { cookie } }), ctx);
  assert.match(result.headers.get("location"), /conectado=HIGGSFIELD/);
  assert.equal(result.headers.getSetCookie().length, 2);
  const tokenRequest = new URLSearchParams(calls.at(-1).init.body);
  assert.equal(tokenRequest.get("code_verifier"), verifier);
  assert.equal(tokenRequest.get("resource"), "https://mcp.higgsfield.ai/mcp");
  assert.equal(config.getConfig("HIGGSFIELD_CODIGO"), "private-test-token");
  oauth.desconectar("HIGGSFIELD");
  assert.ok(!config.getConfig("HIGGSFIELD_CODIGO"));
  assert.ok(!config.getConfig("HIGGSFIELD_REFRESH"));
  config.setConfig("HIGGSFIELD_CLIENT_ID", null);
});

test("MCP inicializa sessão, lê streaming e respeita erros das ferramentas", async () => {
  const mcp = require("../lib/mcp-cliente.ts");
  const calls = [];
  global.fetch = async (_url, init) => {
    const request = JSON.parse(init.body);
    calls.push(request.method);
    assert.match(init.headers.Accept, /text\/event-stream/);
    if (request.method === "initialize") return Response.json({ jsonrpc: "2.0", id: request.id, result: { protocolVersion: "2025-03-26" } }, { headers: { "Mcp-Session-Id": "session-test" } });
    assert.equal(init.headers["Mcp-Session-Id"], "session-test");
    if (request.method === "notifications/initialized") return new Response(null, { status: 202 });
    const result = request.method === "tools/list" ? { tools: [{ name: "generate_video", inputSchema: { type: "object" } }] } : { isError: true, content: [{ type: "text", text: "rejected" }] };
    return new Response('event: message\r\ndata: ' + JSON.stringify({ jsonrpc: "2.0", method: "notifications/progress", params: {} }) + '\r\n\r\ndata: ' + JSON.stringify({ jsonrpc: "2.0", id: request.id, result }) + '\r\n\r\n', { headers: { "content-type": "text/event-stream" } });
  };
  const connection = mcp.conectar("https://mcp.example/mcp", "private-token");
  assert.equal((await mcp.listarFerramentas(connection))[0].nome, "generate_video");
  await assert.rejects(() => mcp.chamar(connection, "generate_video", {}), /recusou a operação/);
  assert.deepEqual(calls, ["initialize", "notifications/initialized", "tools/list", "tools/call"]);
});


test("demonstração termina com qualquer provedor, sem depender do OpenRouter", async () => {
  const config = require("../lib/store.ts");
  const { generationConnections } = require("../lib/flow/connections.ts");
  const setup = require("../app/api/setup/route.ts");
  const originalKey = process.env.MUAPI_API_KEY;
  delete process.env.MUAPI_API_KEY;
  try {
    config.setConfig("MUAPI_API_KEY", null);
    config.setConfig("HIGGSFIELD_CODIGO", null);
    assert.equal(generationConnections().demo, true);
    assert.equal((await (await flows.GET()).json()).demo, true);
    config.setConfig("HIGGSFIELD_CODIGO", "test-authorization");
    assert.equal(generationConnections().demo, false);
    assert.equal((await (await setup.GET()).json()).pronto, true);
    config.setConfig("HIGGSFIELD_CODIGO", null);
    config.setConfig("MUAPI_API_KEY", "test-api-key");
    assert.equal(generationConnections().demo, false);
    assert.equal((await (await setup.GET()).json()).demo, false);
    config.setConfig("MUAPI_API_KEY", null);
    assert.equal(generationConnections().demo, true);
  } finally {
    config.setConfig("MUAPI_API_KEY", null);
    config.setConfig("HIGGSFIELD_CODIGO", null);
    if (originalKey !== undefined) process.env.MUAPI_API_KEY = originalKey;
  }
});

test("trocar modelo preserva escolhas compatíveis e ajusta somente as incompatíveis", () => {
  const { modelSettings } = require("../lib/flow/experience.ts");
  const video = model.block("video", 0);
  Object.assign(video.data, { ratio: "9:16", resolution: "720p", duration: 8 });
  assert.deepEqual(modelSettings(video.data, "wan2.2"), { model: "wan2.2", ratio: "9:16", resolution: "720p", duration: 8 });
  assert.deepEqual(modelSettings(video.data, "kling-v2.1-standard-i2v"), { model: "kling-v2.1-standard-i2v", ratio: "9:16", resolution: "Automática", duration: 5 });
  assert.throws(() => modelSettings(video.data, "nano-banana-2"), /incompatível/);
});

test("prévia de geração valida toda a sequência antes de cobrar e não altera o projeto", () => {
  const { generationPlan } = require("../lib/flow/experience.ts");
  const p = model.recipe("product");
  p.nodes[0].data.prompt = "Campanha de verão";
  const before = structuredClone(p);
  const plan = generationPlan(p, "all", []);
  assert.equal(plan.issue, null);
  assert.deepEqual(plan.steps.map((n) => n.data.kind), ["image", "video"]);
  assert.deepEqual(p, before);
  assert.match(generationPlan(p, p.nodes[2].id, []).issue.message, /primeiro/);
  p.nodes[2].data.model = "kling-v2.1-standard-i2v";
  p.nodes[2].data.duration = 8;
  const invalid = generationPlan(p, "all", []);
  assert.equal(invalid.issue.nodeId, p.nodes[2].id);
  assert.match(invalid.issue.message, /5 segundos/);
});

test("prévia bloqueia prompt vazio e vídeo como imagem, mas adapta referências ao limite", () => {
  const { generationPlan } = require("../lib/flow/experience.ts");
  const p = model.recipe("product");
  p.nodes[0].data.prompt = "";
  p.nodes[1].data.prompt = "";
  assert.match(generationPlan(p, "all", []).issue.message, /prompt/);
  p.nodes[0].data.prompt = "Produto de verão";
  p.nodes[1].data.assetId = "ready";
  const ready = { id: "ready", kind: "video", url: "https://example.test/video.webm" };
  assert.match(generationPlan(p, "all", [ready]).issue.message, /apenas imagens/);
  ready.kind = "image";
  assert.deepEqual(generationPlan(p, "all", [ready]).steps.map((n) => n.data.kind), ["video"]);
  Object.assign(p.nodes[2].data, { model: "kling-v2.1-standard-i2v", duration: 5, referenceId: "extra" });
  const limited = generationPlan(p, "all", [ready, { ...ready, id: "extra" }]);
  assert.equal(limited.issue, null);
  assert.equal(limited.warnings.length, 1);
  assert.match(limited.warnings[0].message, /permanecerão conectadas sem envio/);
});

test("duplicar mantém entradas e arquivo, sem reutilizar o trabalho ou compartilhar campos mutáveis", () => {
  const { deriveBlock } = require("../lib/flow/editing.ts");
  const p = model.recipe("product");
  const source = p.nodes[1];
  Object.assign(source.data, { prompt: "Produto ao sol", assetId: "ready-duplicate", lastJobId: "paid-job", status: "pending" });
  const result = deriveBlock(p, source.id, "duplicate");
  const duplicate = result.project.nodes.at(-1);
  assert.notEqual(duplicate.id, source.id);
  assert.equal(duplicate.data.assetId, source.data.assetId);
  assert.equal(duplicate.data.lastJobId, undefined);
  assert.equal(duplicate.data.status, "completed");
  assert.equal(result.project.edges.find((e) => e.target === duplicate.id).source, p.nodes[0].id);
  assert.equal(result.project.edges.filter((e) => e.source === duplicate.id).length, 0);
  duplicate.data.excluded.push("different");
  assert.deepEqual(source.data.excluded, []);
  assert.equal(p.nodes.length, 4);
  model.validateProject(result.project);
});

test("ramificações de imagem criam vídeo; variações de vídeo reutilizam as imagens de entrada", () => {
  const { deriveBlock } = require("../lib/flow/editing.ts");
  const p = model.recipe("product");
  const branch = deriveBlock(p, p.nodes[1].id, "branch");
  const video = branch.project.nodes.at(-1);
  assert.equal(video.data.kind, "video");
  assert.equal(branch.project.edges.find((e) => e.target === video.id).source, p.nodes[1].id);
  p.nodes[2].data.assetId = "ready-video";
  const variation = deriveBlock(p, p.nodes[2].id, "branch");
  assert.equal(variation.project.nodes.at(-1).data.assetId, undefined);
  assert.equal(variation.project.edges.find((e) => e.target === variation.nodeId).source, p.nodes[1].id);
  assert.throws(() => deriveBlock(p, p.nodes[3].id, "branch"), /entrega/);
  model.validateProject(branch.project);
  model.validateProject(variation.project);
});

test("preview público publica só o canvas e suas mídias, mantendo alterações posteriores privadas", async () => {
  const { publishCanvas, sharedCanvas } = require("../lib/flow/share.ts");
  const { saveUpload } = require("../lib/flow/media.ts");
  const publicMedia = require("../app/api/flow-preview/[token]/assets/[id]/route.ts");
  const p = model.recipe("product");
  p.nodes[0].data.prompt = "Ideia compartilhada";
  Object.assign(p.nodes[1].data, { assetId: "shared-image", referenceId: "private-reference", lastJobId: "private-job-id" });
  store.save(p);
  store.addAsset({ id: "shared-image", projectId: p.id, nodeId: p.nodes[1].id, kind: "image", title: "Imagem pública", prompt: "PRIVATE ASSET PROMPT", url: "/api/flow-assets/shared-image/file", mimeType: "image/png", createdAt: new Date().toISOString() });
  store.addAsset({ id: "private-reference", projectId: p.id, nodeId: "", kind: "image", title: "Não publicada", url: "https://example.test/private-image", prompt: "", createdAt: new Date().toISOString() });
  await saveUpload("shared-image", Buffer.from("shared-file-bytes"));
  const published = publishCanvas(p.id);
  const token = published.path.split("/").at(-1);
  assert.match(token, /^[\w-]{43}$/);
  const shared = sharedCanvas(token);
  assert.equal(shared.media.length, 1);
  const body = JSON.stringify(shared.canvas);
  assert.match(body, /Ideia compartilhada/);
  assert.doesNotMatch(body, /PRIVATE ASSET PROMPT|private-reference|private-job-id|api\/flow-assets|projectId|revision/);
  let response = await publicMedia.GET(new Request("http://test/public-file", { headers: { Range: "bytes=0-5" } }), { params: Promise.resolve({ token, id: "shared-image" }) });
  assert.equal(response.status, 206);
  assert.equal(await response.text(), "shared");
  response = await publicMedia.GET(new Request("http://test/public-file"), { params: Promise.resolve({ token, id: "private-reference" }) });
  assert.equal(response.status, 404);
  response = await publicMedia.GET(new Request("http://test/public-file"), { params: Promise.resolve({ token: "x".repeat(43), id: "shared-image" }) });
  assert.equal(response.status, 404);
  const latest = store.project(p.id);
  latest.title = "Título ainda privado";
  store.save(latest);
  assert.equal(sharedCanvas(token).canvas.title, p.title);
  assert.equal(publishCanvas(p.id).path, published.path);
  assert.equal(sharedCanvas(token).canvas.title, "Título ainda privado");
  store.remove(p.id);
  assert.equal(sharedCanvas(token), undefined);
});

test("exceção pública permite apenas leitura do preview e da mídia autorizada", () => {
  const { isPreviewRead } = require("../lib/flow/preview-model.ts");
  const token = "a".repeat(43);
  assert.equal(isPreviewRead(`/preview/${token}`, "GET"), true);
  assert.equal(isPreviewRead(`/api/flow-preview/${token}/assets/image-id`, "HEAD"), true);
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    assert.equal(isPreviewRead(`/preview/${token}`, method), false);
    assert.equal(isPreviewRead(`/api/flow-preview/${token}/assets/image-id`, method), false);
  }
  for (const path of ["/api/flow-share", "/api/flows", "/api/flow-assets/image-id/file", `/preview/${token}/edit`, "/preview/invalid"]) assert.equal(isPreviewRead(path, "GET"), false);
});

test("download de arquivo envia attachment com nome seguro e preserva conteúdo", async () => {
  const { serveAsset } = require("../lib/flow/serve-media.ts");
  const { saveUpload } = require("../lib/flow/media.ts");
  await saveUpload("download-test", Buffer.from("download bytes"));
  const r = await serveAsset(new Request("http://test/file?download=1"), { id: "download-test", title: 'Vídeo "final"', kind: "video", mimeType: "video/mp4", url: "" });
  assert.equal(r.status, 200);
  assert.match(r.headers.get("Content-Disposition"), /^attachment; filename\*=UTF-8''V%C3%ADdeo%20%22final%22.mp4$/);
  assert.equal(await r.text(), "download bytes");
});

test("referências excedentes são preservadas; Kling, Veo e Wan recebem só o limite", async () => {
  const { generationInput, modelReferences, modelSettings } = require("../lib/flow/experience.ts");
  const p = model.recipe("social");
  const video = model.block("video", 5);
  video.data.prompt = "Anime o produto";
  p.nodes.push(video);
  for (const [i, source] of p.nodes.slice(1, 5).entries()) {
    source.data.assetId = `cap-ref-${i}`;
    store.addAsset({ id: source.data.assetId, kind: "image", url: `https://test.example/${i}.png` });
    p.edges.push({ id: `ref-${i}`, source: source.id, target: video.id, data: { kind: "input" } });
  }
  for (const [id, count] of [["kling-v2.1-standard-i2v", 1], ["veo3.1-fast", 2], ["wan2.2", 2], ["veo3.1-reference", 3]]) {
    Object.assign(video.data, modelSettings(video.data, id));
    const input = generationInput(p, video, store.assets());
    assert.equal(input.images.length, count);
    assert.equal(modelReferences(p, video).omitted.length, 4 - count);
    assert.equal(model.referencePlan(p, video.id).length, 4);
    const before = JSON.stringify(p);
    store.save(p);
    let sent;
    global.fetch = async (url, init) => {
      sent = JSON.parse(init.body);
      return Response.json({ request_id: "cap-request" });
    };
    const response = await generate.POST(post("flow-generate", { projectId: p.id, nodeId: video.id, id: crypto.randomUUID() }));
    assert.equal(response.status, 200);
    const j = (await response.json()).job;
    store.saveJob({ ...j, status: "failed" });
    p.revision = store.project(p.id).revision;
    assert.equal(sent.images_list?.length ?? (sent.last_image ? 2 : 1), count);
    assert.equal(JSON.parse(before).nodes.length, p.nodes.length);
  }
  video.data.excluded = [p.nodes[1].id];
  assert.equal(modelReferences(p, video).used[0].assetId, p.nodes[2].data.assetId);
  global.fetch = originalFetch;
});

const tick = () => new Promise((resolve) => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
test("Gerar tudo executa folhas em paralelo, compartilha ancestrais e espera cada dependência", async () => {
  const { executeFlow } = require("../lib/flow/execution.ts");
  const p = model.recipe("social");
  const upstream = deferred();
  const gates = p.nodes.slice(2).map(() => deferred());
  const started = [];
  const finished = [];
  const run = executeFlow(p, "all", async (n) => {
    started.push(n.id);
    if (n.id === p.nodes[1].id) await upstream.promise;
    else await gates[p.nodes.findIndex((b) => b.id === n.id) - 2].promise;
    finished.push(n.id);
  });
  await tick();
  assert.deepEqual(started, [p.nodes[1].id]);
  upstream.resolve();
  await tick();
  assert.deepEqual(started, p.nodes.slice(1).map((n) => n.id));
  assert.equal(finished.length, 1);
  gates.forEach((g) => g.resolve());
  await run;
  assert.equal(finished.length, 4);
});

test("falha em uma folha não abandona a vizinha nem executa entrega dependente", async () => {
  const { executeFlow } = require("../lib/flow/execution.ts");
  const p = model.recipe("campaign");
  p.nodes[1].data.assetId = "ready";
  const gate = deferred();
  const started = [];
  let settled = false;
  const run = executeFlow(p, "all", async (n) => {
    started.push(n.id);
    if (n.id === p.nodes[3].id) throw new Error("Falha no vídeo");
    await gate.promise;
  }).catch((e) => { settled = true; return e; });
  await tick();
  assert.equal(settled, false);
  assert.deepEqual(started.sort(), [p.nodes[2].id, p.nodes[3].id].sort());
  gate.resolve();
  assert.match((await run).message, /Falha no vídeo/);
  assert.ok(!started.includes(p.nodes[4].id));
});

test("pausar espera envios ativos e impede os dependentes; execução individual não dispara ancestrais", async () => {
  const { executeFlow } = require("../lib/flow/execution.ts");
  const p = model.recipe("product");
  const gate = deferred();
  const started = [];
  let stop = false;
  const run = executeFlow(p, "all", async (n) => { started.push(n.id); await gate.promise; }, () => stop);
  await tick();
  stop = true;
  gate.resolve();
  await run;
  assert.deepEqual(started, [p.nodes[1].id]);
  const single = [];
  await executeFlow(p, p.nodes[2].id, async (n) => { single.push(n.id); });
  assert.deepEqual(single, [p.nodes[2].id]);
});

test("upload ou biblioteca mantém referência após gerar, reabrir, remover resultado e gerar novamente", async () => {
  const { selectReference } = require("../lib/flow/editing.ts");
  const p = model.recipe("product");
  const n = p.nodes[1];
  n.data.prompt = "Produto iluminado";
  Object.assign(n.data, selectReference(n, "original-ref"));
  assert.equal(n.data.dirty, true);
  store.addAsset({ id: "original-ref", kind: "image", url: "https://test.example/original.png" });
  let current = store.save(p);
  const sent = [];
  global.fetch = async (url, init) => {
    sent.push(JSON.parse(init.body));
    return Response.json({ request_id: crypto.randomUUID() });
  };
  for (let i = 0; i < 2; i++) {
    const response = await generate.POST(post("flow-generate", { projectId: p.id, nodeId: n.id, id: crypto.randomUUID() }));
    assert.equal(response.status, 200);
    const j = (await response.json()).job;
    const asset = { id: `generated-${i}`, kind: "image", url: `https://test.example/generated-${i}.png` };
    store.saveJob({ ...j, status: "completed", asset });
    current = model.receiveGeneration(current, { ...j, asset });
    assert.equal(current.nodes[1].data.referenceId, "original-ref");
    current.nodes[1].data.assetId = undefined;
    current = store.save(current);
    current = store.project(p.id);
  }
  assert.deepEqual(sent.map((body) => body.images_list), [["https://test.example/original.png"], ["https://test.example/original.png"]]);
  const changed = structuredClone(current);
  changed.nodes[1].data.referenceId = "replacement";
  assert.equal(model.reconcile(current, changed).nodes[1].data.dirty, true);
  global.fetch = originalFetch;
});

test("varinha melhora o prompt atual com ideia, fluxo e múltiplas imagens reais", async () => {
  const improve = require("../app/api/flow-prompt/route.ts");
  const { saveUpload, assetUrl } = require("../lib/flow/media.ts");
  const p = model.recipe("product");
  p.nodes[0].data.prompt = "Campanha de verão";
  p.nodes[1].data.prompt = "Produto na praia";
  p.nodes[1].data.assetId = "vision-input";
  p.nodes[2].data.prompt = "Anime lentamente";
  p.nodes[2].data.referenceId = "vision-selected";
  for (const id of ["vision-input", "vision-selected"]) {
    await saveUpload(id, Buffer.from(`image bytes ${id}`));
    store.addAsset({ id, kind: "image", mimeType: "image/png", title: id, url: assetUrl(id) });
  }
  const key = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = "test-only-key";
  let body;
  global.fetch = async (url, init) => {
    assert.match(String(url), /openrouter/);
    body = JSON.parse(init.body);
    return Response.json({ choices: [{ message: { content: "Anime lentamente o produto com luz de verão." } }] });
  };
  try {
    const response = await improve.POST(post("flow-prompt", { project: p, nodeId: p.nodes[2].id }));
    assert.equal(response.status, 200);
    assert.match((await response.json()).prompt, /luz de verão/);
    const content = body.messages[1].content;
    assert.equal(content.filter((p) => p.type === "image_url").length, 2);
    assert.ok(content[1].image_url.url.startsWith("data:image/png;base64,"));
    const input = JSON.parse(content[0].text);
    assert.equal(input.promptAtual, "Anime lentamente");
    assert.equal(input.fluxoConectado[0].prompt, "Campanha de verão");
    assert.equal(input.fluxoConectado[1].prompt, "Produto na praia");
    assert.equal(p.nodes[2].data.prompt, "Anime lentamente");
    p.nodes[2].data.excluded = [p.nodes[1].id];
    await improve.POST(post("flow-prompt", { project: p, nodeId: p.nodes[2].id }));
    assert.equal(body.messages[1].content.filter((p) => p.type === "image_url").length, 1);
    let called = false;
    global.fetch = async () => { called = true; throw new Error("Should not call"); };
    p.nodes[2].data.prompt = "";
    assert.notEqual((await improve.POST(post("flow-prompt", { project: p, nodeId: p.nodes[2].id }))).status, 200);
    assert.equal(called, false);
  } finally {
    if (key === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY = key;
    global.fetch = originalFetch;
  }
});

test("vídeos folha rodam juntos e cada Output é liberado sem esperar o outro ramo", async () => {
  const { executeFlow } = require("../lib/flow/execution.ts");
  const p = model.recipe("product");
  p.nodes[1].data.assetId = "ready-image";
  const video = model.block("video", 4);
  const output = model.block("output", 5);
  p.nodes.push(video, output);
  p.edges.push({ id: "parallel-video", source: p.nodes[1].id, target: video.id, data: { kind: "input" } }, { id: "parallel-output", source: video.id, target: output.id, data: { kind: "input" } });
  const first = deferred(), second = deferred();
  const started = [];
  const run = executeFlow(p, "all", async (n) => {
    started.push(n.id);
    if (n.id === p.nodes[2].id) await first.promise;
    if (n.id === video.id) await second.promise;
  });
  await tick();
  assert.deepEqual(started, [p.nodes[2].id, video.id]);
  first.resolve();
  await tick();
  assert.ok(started.includes(p.nodes[3].id));
  assert.ok(!started.includes(output.id));
  second.resolve();
  await run;
  assert.ok(started.includes(output.id));
});

test("imagem enviada sem prompt permanece como fonte pronta; limite de imagem não é truncado", () => {
  const { selectReference } = require("../lib/flow/editing.ts");
  const { generationInput } = require("../lib/flow/experience.ts");
  const p = model.recipe("product"), next = structuredClone(p);
  Object.assign(next.nodes[1].data, selectReference(next.nodes[1], "source-image"));
  const reconciled = model.reconcile(p, next);
  assert.equal(reconciled.nodes[1].data.dirty, false);
  assert.equal(reconciled.nodes[2].data.dirty, true);
  const image = model.block("image", 0);
  image.data.prompt = "Componha o produto";
  const many = { ...model.recipe("blank"), nodes: [image], edges: [] };
  const assets = [];
  for (let i = 0; i < 15; i++) {
    const source = model.block("image", i + 1);
    source.data.assetId = `many-${i}`;
    many.nodes.push(source);
    many.edges.push({ id: `edge-${i}`, source: source.id, target: image.id, data: {kind: "input"} });
    assets.push({id: source.data.assetId, kind: "image", url: `https://test.example/${i}.png`});
  }
  assert.throws(() => generationInput(many, image, assets), /até 14/);
});

test("receita UGC compartilha influencer e isola produtos A/B até os dois vídeos folha", async () => {
  const { generationPlan, generationInput } = require("../lib/flow/experience.ts");
  const { executeFlow } = require("../lib/flow/execution.ts");
  const p = model.recipe("ugc");
  model.validateProject(p);
  assert.ok(model.RECIPES.some((r) => r.id === "ugc"));
  assert.deepEqual(p.nodes.map((n) => n.data.kind), ["idea", "image", "image", "image", "video", "video"]);
  const [idea, influencer, a, b, va, vb] = p.nodes;
  assert.deepEqual(p.nodes.filter((n) => !p.edges.some((e) => e.source === n.id)).map((n) => n.id), [va.id, vb.id]);
  assert.deepEqual(model.context(p, a.id).map((n) => n.id), [idea.id, influencer.id]);
  assert.deepEqual(model.context(p, b.id).map((n) => n.id), [idea.id, influencer.id]);
  assert.deepEqual(model.context(p, va.id).map((n) => n.id), [idea.id, a.id]);
  assert.deepEqual(model.context(p, vb.id).map((n) => n.id), [idea.id, b.id]);
  assert.equal(generationPlan(p, "all", []).issue, null);
  assert.equal(generationPlan(p, "all", []).steps.length, 5);
  assert.ok(p.nodes.slice(1).every((n) => n.data.ratio === "9:16"));
  const available = [];
  const sent = [];
  const aGate = deferred(), bGate = deferred();
  const running = executeFlow(p, "all", async (n) => {
    sent.push(n.id);
    if (n.id === a.id) await aGate.promise;
    if (n.id === b.id) await bGate.promise;
    const input = generationInput(p, n, available);
    if (n.data.kind === "video") assert.deepEqual(input.images, [`https://test.example/${n.id === va.id ? a.id : b.id}.png`]);
    n.data.assetId = n.id;
    available.push({id:n.id,kind:n.data.kind,url:`https://test.example/${n.id}.png`});
  });
  await tick();
  assert.deepEqual(sent, [influencer.id, a.id, b.id]);
  aGate.resolve();
  await tick();
  assert.ok(sent.includes(va.id));
  assert.ok(!sent.includes(vb.id));
  bGate.resolve();
  await running;
  assert.ok(sent.includes(vb.id));
  assert.equal(sent.filter((id) => id === influencer.id).length, 1);
});

test("geração individual reserva somente a etapa e suas dependências, liberando a imagem vizinha", () => {
  const { generationBlockReason } = require("../lib/flow/execution.ts");
  const p = model.recipe("ugc");
  const [, influencer, a, b, va, vb] = p.nodes;
  assert.equal(generationBlockReason(p, b.id, [a.id]), null);
  assert.equal(generationBlockReason(p, vb.id, [a.id]), null);
  assert.match(generationBlockReason(p, a.id, [a.id]), /já está gerando/);
  assert.match(generationBlockReason(p, va.id, [a.id]), /usada como referência/);
  assert.match(generationBlockReason(p, influencer.id, [a.id]), /está usando esta etapa/);
  assert.equal(generationBlockReason(p, a.id, [vb.id]), null);
  assert.match(generationBlockReason(p, b.id, [vb.id]), /está usando esta etapa/);
  assert.equal(generationBlockReason(p, b.id, [a.id, va.id]), null);
});

test("API aceita duas imagens UGC simultâneas, evita duplicata e protege referências em uso", async () => {
  const p = model.recipe("ugc");
  const [, influencer, a, b, va] = p.nodes;
  for (const node of [influencer, a, b]) {
    node.data.assetId = `independent-${node.id}`;
    store.addAsset({ id: node.data.assetId, kind: "image", url: `https://test.example/${node.id}.png` });
  }
  store.save(p);
  const calls = [];
  global.fetch = async (url, init) => {
    calls.push(JSON.parse(init.body));
    return Response.json({ request_id: crypto.randomUUID() });
  };
  const start = (node) => generate.POST(post("flow-generate", { projectId: p.id, nodeId: node.id, id: crypto.randomUUID() }));
  try {
    const first = await start(a);
    assert.equal(first.status, 200);
    const jobA = (await first.json()).job;
    assert.equal(jobA.status, "pending");
    const second = await start(b);
    assert.equal(second.status, 200);
    const jobB = (await second.json()).job;
    assert.equal(jobB.status, "pending");
    assert.equal(calls.length, 2);
    assert.equal((await (await start(a)).json()).job.id, jobA.id);
    assert.equal((await start(va)).status, 400);
    assert.equal((await start(influencer)).status, 400);
    assert.equal(calls.length, 2);
    store.saveJob({ ...jobA, status: "completed" });
    assert.equal((await start(va)).status, 200);
    assert.equal(store.job(jobB.id).status, "pending");
    assert.equal(calls.length, 3);
  } finally { global.fetch = originalFetch; }
});

test("UGC e geração de imagens orientam a não escrever o prompt nem acrescentar texto", () => {
  const { generationInput } = require("../lib/flow/experience.ts");
  const { promptImprovementInput } = require("../lib/flow/prompt.ts");
  const p = model.recipe("ugc");
  const images = p.nodes.filter((n) => n.data.kind === "image");
  assert.ok(images.every((n) => /nenhum texto/.test(n.data.prompt)));
  const input = generationInput(p, images[0], []);
  assert.match(input.prompt, /não devem ser escritos na imagem/);
  assert.match(input.prompt, /Não acrescente textos, legendas/);
  // The server guidance also protects projects saved before the template changed.
  images[0].data.prompt = "Uma influencer mostrando o produto";
  p.nodes[0].data.prompt = "Campanha UGC";
  assert.match(generationInput(p, images[0], []).prompt, /Não acrescente textos, legendas/);
  const improvement = promptImprovementInput(p, images[0], []);
  assert.match(improvement.system, /imagem sem texto/);
  assert.match(improvement.system, /Não sugira legendas/);
});

test("prompts UGC priorizam o produto exato e contínuo sem misturar os ramos", () => {
  const p = model.recipe("ugc");
  const [, influencer, a, b, va, vb] = p.nodes;
  assert.match(influencer.data.prompt, /mãos vazias/);
  for (const [image, video, label, other] of [[a, va, "A", "B"], [b, vb, "B", "A"]]) {
    assert.match(image.data.prompt, new RegExp(`exclusivamente o produto ${label}`));
    assert.match(image.data.prompt, /única fonte para a identidade do produto/);
    assert.match(image.data.prompt, /produto é o protagonista/);
    assert.match(video.data.prompt, /uma única tomada contínua/);
    assert.match(video.data.prompt, /do primeiro ao último quadro/);
    assert.match(video.data.prompt, /não transforme, deforme, duplique, substitua/);
    assert.match(video.data.prompt, /sem encobri-lo/);
    assert.ok(!video.data.prompt.includes(`produto ${other}`));
    assert.match(video.data.prompt, /Não acrescente outros produtos, textos/);
  }
});
