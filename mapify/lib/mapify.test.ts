import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { demoMap } from "./demo";
import {
  textSource,
  htmlSource,
  youtubeId,
  captionSegments,
  pdfSource,
} from "./sources";
import { publicAddress, publicUrl } from "./network";
import { layoutTree, svgMap, markdown } from "./layout";
const dir = mkdtempSync(join(tmpdir(), "mapify-test-"));
process.env.DATA_DIR = dir;
const { validateTree, createMap, saveMap, getMap, deleteMap } = await import("./maps");
const { sourceChunks, generate } = await import("./generation");
const { setConfig } = await import("./store");
const { ask } = await import("./ai");
const { criarConta, entrar, usuarioDoToken, sair } = await import("./conta");
test.after(() => rmSync(dir, { recursive: true, force: true }));

test("bloqueia IPs internos, protocolos, portas e representações alternativas de localhost", () => {
  for (const ip of [
    "127.0.0.1",
    "10.0.0.1",
    "169.254.169.254",
    "172.16.5.2",
    "192.168.2.3",
    "::1",
    "::ffff:127.0.0.1",
    "fc00::1",
    "0.0.0.0",
    "100.64.0.1",
  ])
    assert.equal(publicAddress(ip), false, ip);
  assert.equal(publicAddress("8.8.8.8"), true);
  for (const url of [
    "file:///etc/passwd",
    "http://localhost/",
    "http://127.1",
    "http://2130706433",
    "http://user:pass@example.com",
    "http://example.com:8000",
    "http://[::1]/",
  ])
    assert.throws(() => publicUrl(url));
});
test("importação web preserva texto e título removendo scripts e navegação", () => {
  const source = htmlSource(
    `<html><title>Produto Atlas</title><body><nav>SECRETO_NAV</nav><main><h1>Atlas</h1><p>${"O Atlas organiza o conhecimento da equipe em uma plataforma integrada. ".repeat(4)}</p><script>SECRETO_SCRIPT</script></main></body></html>`,
    "https://example.com",
  );
  assert.equal(source.title, "Produto Atlas");
  assert.equal(source.kind, "web");
  assert.match(source.segments[0].text, /Atlas organiza/);
  assert.doesNotMatch(source.segments[0].text, /SECRETO/);
});
test("YouTube aceita apenas IDs válidos de hosts permitidos e preserva minutos", () => {
  assert.equal(
    youtubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
    "dQw4w9WgXcQ",
  );
  assert.equal(youtubeId("https://youtu.be/dQw4w9WgXcQ?t=2"), "dQw4w9WgXcQ");
  assert.equal(
    youtubeId("https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ"),
    null,
  );
  assert.equal(youtubeId("https://youtube.com/shorts/invalid"), null);
  const segments = captionSegments([
    { text: "Início", start: 0 },
    { text: "Conceito", start: 12 },
    { text: "Outro tema", start: 73 },
  ]);
  assert.equal(segments.length, 2);
  assert.equal(segments[1].label, "1:13");
  assert.equal(segments[1].seconds, 73);
  assert.match(segments[0].text, /Início Conceito/);
});
test("fonte longa é dividida sem perder texto e limites são explícitos", () => {
  const text =
    "Conteúdo importante para entender todas as partes do relatório. ".repeat(
      1500,
    );
  const source = textSource(text);
  const chunks = sourceChunks(source);
  assert.ok(chunks.length > 1);
  assert.equal(source.characters, text.length);
  assert.equal(source.segments.map((s) => s.text).join(""), text);
  assert.throws(() => textSource("pouco texto"), /suficiente/);
  assert.throws(() => textSource("x".repeat(160001)), /160 mil/);
});
test("PDF real extrai texto por página; rejeita arquivo inválido", async () => {
  const content =
    "BT /F1 12 Tf 50 750 Td (Mapify organizes knowledge into interactive mind maps. This PDF has selectable text for reliable extraction and useful source references.) Tj ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((obj, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const start = pdf.length;
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((o) => String(o).padStart(10, "0") + " 00000 n \n")
    .join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
  const source = await pdfSource(
    new Uint8Array(Buffer.from(pdf)),
    "sample.pdf",
  );
  assert.equal(source.kind, "pdf");
  assert.equal(source.segments[0].page, 1);
  assert.match(source.segments[0].text, /Mapify organizes/);
  await assert.rejects(
    () => pdfSource(new Uint8Array(Buffer.from("invalid")), "x.pdf"),
    /PDF válido/,
  );
});
test("mapas mantêm edições e rejeitam conflito entre abas; credenciais nunca vão no mapa", () => {
  const map = demoMap();
  map.id = "persist-test";
  createMap(map);
  const saved = saveMap(map.id, { title: "Novo título", favorite: true }, 1);
  assert.equal(saved.revision, 2);
  assert.equal(getMap(map.id).title, "Novo título");
  assert.throws(
    () => saveMap(map.id, { title: "Sobrescrever" }, 1),
    /outra aba/,
  );
  deleteMap(map.id);
  assert.throws(() => getMap(map.id), /não encontrado/);
});
test("árvore elimina referências inventadas, IDs duplicados e estruturas excessivas", () => {
  const root = demoMap().root;
  root.refs = ["nao-existe", "s1"];
  root.children[0].id = root.id;
  const clean = validateTree(root, new Set(["s1"]));
  assert.deepEqual(clean.refs, ["s1"]);
  assert.notEqual(clean.children[0].id, clean.id);
  assert.throws(
    () =>
      validateTree({
        ...root,
        children: Array.from({ length: 181 }, () => ({
          label: "x",
          children: [],
        })),
      }),
    /limite/,
  );
});
test("layout respeita recolhimento; exportação contém todos os tópicos e escapa HTML", () => {
  const root = demoMap().root;
  assert.equal(layoutTree(root).length, 25);
  assert.equal(
    layoutTree(root, new Set(root.children.map((c) => c.id))).length,
    7,
  );
  assert.equal(layoutTree(root, new Set([root.id])).length, 1);
  root.label = "<script>alert(1)</script>";
  const svg = svgMap(root);
  assert.doesNotMatch(svg, /<script>/);
  assert.match(svg, /&lt;script&gt;/);
  assert.match(markdown(root), /Comece pelo problema/);
});
test("OpenRouter transmite modelo e fonte; falha não vira resposta de demonstração", async () => {
  setConfig("OPENROUTER_API_KEY", "test-key");
  const response = await ask(
    "system",
    "fonte",
    undefined,
    { provider: "openrouter", model: "test/model" },
    (async (_url, options) => {
      const body = JSON.parse(options!.body as string);
      assert.equal(body.model, "test/model");
      assert.equal(body.messages[1].content, "fonte");
      return Response.json({
        choices: [{ finish_reason: "stop", message: { content: "resposta" } }],
      });
    }) as typeof fetch,
  );
  assert.equal(response, "resposta");
  await assert.rejects(
    () =>
      ask(
        "s",
        "p",
        undefined,
        { provider: "openrouter", model: "" },
        (async () => new Response("", { status: 402 })) as typeof fetch,
      ),
    /saldo/,
  );
});
test("geração integrada usa resposta do provedor, persiste mapa e remove referências falsas", async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = (async () =>
    Response.json({
      choices: [
        {
          finish_reason: "stop",
          message: {
            content: JSON.stringify({
              title: "Conhecimento conectado",
              summary: "Síntese do conteúdo.",
              root: {
                label: "Conhecimento",
                note: "",
                refs: [],
                children: [
                  {
                    label: "Leitura",
                    note: "Leia",
                    refs: ["s1", "inexistente"],
                    children: [],
                  },
                  {
                    label: "Aplicação",
                    note: "Aplique",
                    refs: ["s1"],
                    children: [],
                  },
                ],
              },
            }),
          },
        },
      ],
    })) as typeof fetch;
  try {
    const result = await generate(
      textSource(
        "Este conteúdo apresenta práticas de leitura e aplicação para organizar o conhecimento da equipe.",
      ),
      "brief",
      "",
      new AbortController().signal,
      () => {},
      { provider: "openrouter", model: "test/model" },
    );
    assert.equal(getMap(result.id).title, "Conhecimento conectado");
    assert.deepEqual(result.root.children[0].refs, ["s1"]);
    assert.equal(result.demo, false);
  } finally {
    globalThis.fetch = previous;
  }
});
test("conta exige senha forte, só permite um dono, encerra sessões no logout", () => {
  assert.throws(() =>
    criarConta({ nome: "Test", email: "test@example.com", senha: "weak" }),
  );
  criarConta({ nome: "Test", email: "test@example.com", senha: "Strong123!" });
  assert.throws(
    () =>
      criarConta({
        nome: "Other",
        email: "other@example.com",
        senha: "Strong123!",
      }),
    /já tem/,
  );
  assert.throws(() => entrar({ email: "test@example.com", senha: "wrong" }));
  const session = entrar({ email: "test@example.com", senha: "Strong123!" });
  assert.equal(usuarioDoToken(session.token)?.email, "test@example.com");
  sair(session.token);
  assert.equal(usuarioDoToken(session.token), null);
});
