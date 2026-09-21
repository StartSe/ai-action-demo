import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  analyzeYouTubeVideo,
  parseVideoAnalysis,
  geminiVideoStatus,
  geminiVideoConfig,
  saveGeminiVideo,
  removeGeminiVideo,
  setYouTubeMode,
  youtubeMode,
  GEMINI_VIDEO_MODEL,
} from "./gemini-video";

const dir = mkdtempSync(join(tmpdir(), "mapify-gemini-test-"));
process.env.DATA_DIR = dir;
const id = "1QNsdr-Qx_I";
const key = "AIza-test-gemini-secret-for-unit-tests";
const config = { key, model: GEMINI_VIDEO_MODEL };
const notes =
  "A aula explica como organizar ideias em mapas mentais, relacionar conceitos e aplicar o aprendizado a situações concretas. São notas de estudo resumidas, sem reproduzir a fala literalmente.";
const analysis = {
  accessible: true,
  title: "Vídeo de teste",
  duration_seconds: 153,
  segments: [
    { start_seconds: 3.7, end_seconds: 60, text: notes },
    {
      start_seconds: 65,
      end_seconds: 152,
      text: "O exemplo final mostra como revisar as conexões e retornar ao vídeo para conferir detalhes antes de aplicar os conceitos apresentados.",
    },
  ],
};
const completed = (value: unknown = analysis) => ({
  status: "completed",
  steps: [
    {
      type: "thought",
      content: [{ type: "text", text: "not source material" }],
    },
    {
      type: "model_output",
      content: [{ type: "text", text: JSON.stringify(value) }],
    },
  ],
});
test.after(() => rmSync(dir, { recursive: true, force: true }));

test("Gemini recebe vídeo como mídia e chave no cabeçalho; retorna análise com origem e tempos", async () => {
  const source = await analyzeYouTubeVideo(
    id,
    undefined,
    config,
    async (url, init) => {
      assert.equal(
        url,
        "https://generativelanguage.googleapis.com/v1beta/interactions",
      );
      assert.equal(new Headers(init?.headers).get("x-goog-api-key"), key);
      assert.equal(init?.redirect, "error");
      const request = JSON.parse(String(init?.body));
      assert.equal(request.model, GEMINI_VIDEO_MODEL);
      assert.equal(request.store, false);
      assert.deepEqual(request.input[0], {
        type: "video",
        uri: `https://www.youtube.com/watch?v=${id}`,
      });
      assert.equal(request.response_format.mime_type, "application/json");
      assert.match(request.system_instruction, /nunca uma transcrição literal/);
      assert.ok(!JSON.stringify(request).includes(key));
      return Response.json(completed());
    },
  );
  assert.equal(source.url, `https://www.youtube.com/watch?v=${id}`);
  assert.equal(source.segments[0].seconds, 3);
  assert.equal(source.segments[1].label, "1:05");
  assert.equal(source.analysis?.provider, "gemini");
  assert.equal(source.analysis?.durationSeconds, 153);
  assert.ok(!JSON.stringify(source).includes(key));
});

test("Gemini recusa vídeo inacessível, tempos inválidos e conteúdo incompleto", async () => {
  assert.throws(
    () => parseVideoAnalysis({ accessible: false }, id, config.model),
    /não conseguiu acessar/,
  );
  for (const bad of [
    { ...analysis, accessible: undefined },
    { ...analysis, segments: [] },
    { ...analysis, duration_seconds: 0 },
    { ...analysis, segments: [{ ...analysis.segments[0], start_seconds: -1 }] },
    { ...analysis, segments: [{ ...analysis.segments[0], end_seconds: 999 }] },
    { ...analysis, segments: [...analysis.segments].reverse() },
    { ...analysis, segments: [{ ...analysis.segments[0], text: "short" }] },
    {
      ...analysis,
      segments: [{ ...analysis.segments[0], text: "a".repeat(2401) }],
    },
  ])
    assert.throws(() => parseVideoAnalysis(bad, id, config.model));
  for (const status of [
    "incomplete",
    "failed",
    "requires_action",
    "in_progress",
    "cancelled",
  ]) {
    await assert.rejects(
      analyzeYouTubeVideo(id, undefined, config, async () =>
        Response.json({ ...completed(), status }),
      ),
    );
  }
  await assert.rejects(
    analyzeYouTubeVideo(id, undefined, config, async () =>
      Response.json({ status: "completed", steps: [] }),
    ),
    /estruturada/,
  );
  await assert.rejects(
    analyzeYouTubeVideo(id, undefined, config, async () =>
      Response.json({ ...completed(), errors: [{ message: key }] }),
    ),
    /não concluiu/,
  );
});

test("erros Gemini distinguem chave, permissões, modelo e cota sem vazar resposta ou repetir cobrança", async () => {
  for (const [status, expected] of [
    [400, /não aceitou/],
    [401, /chave Gemini/],
    [403, /não autorizou/],
    [404, /modelo Gemini/],
    [429, /cota/],
    [503, /mais tarde/],
  ] as const) {
    let calls = 0;
    await assert.rejects(
      analyzeYouTubeVideo(id, undefined, config, async () => {
        calls++;
        return Response.json(
          { error: { message: `sensitive ${key}` } },
          { status },
        );
      }),
      (e) =>
        e instanceof Error &&
        expected.test(e.message) &&
        !e.message.includes(key),
    );
    assert.equal(calls, 1);
  }
  await assert.rejects(
    analyzeYouTubeVideo(id, undefined, config, async () =>
      Response.json(
        { error: { details: [{ reason: "API_KEY_INVALID" }] } },
        { status: 400 },
      ),
    ),
    /chave Gemini/,
  );
  await assert.rejects(
    analyzeYouTubeVideo(
      id,
      undefined,
      config,
      async () => new Response("gateway error", { status: 503 }),
    ),
    /mais tarde/,
  );
  await assert.rejects(
    analyzeYouTubeVideo(id, undefined, config, async () => {
      throw new Error(key);
    }),
    (e) => e instanceof Error && !e.message.includes(key),
  );
});

test("cancelamento alcança o provedor; URL inválida, chave ausente e resposta excessiva são recusadas", async () => {
  let calls = 0;
  const unexpected = async () => {
    calls++;
    return Response.json(completed());
  };
  await assert.rejects(
    analyzeYouTubeVideo("http://localhost", undefined, config, unexpected),
    /vídeo válido/,
  );
  await assert.rejects(
    analyzeYouTubeVideo(id, undefined, { ...config, key: "" }, unexpected),
    /Configure a chave/,
  );
  assert.equal(calls, 0);
  const abort = new AbortController();
  const running = analyzeYouTubeVideo(
    id,
    abort.signal,
    config,
    async (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => reject(init.signal!.reason),
          { once: true },
        );
      }),
  );
  abort.abort();
  await assert.rejects(running, { name: "AbortError" });
  await assert.rejects(
    analyzeYouTubeVideo(
      id,
      undefined,
      config,
      async () => new Response("x".repeat(2_000_001)),
    ),
    /tamanho permitido/,
  );
});

test("configuração cifra chave, preserva segredo ao editar e dá prioridade ao Gemini sobre OAuth", async () => {
  const { setConfig, abrirBanco } = await import("./store");
  setConfig("YOUTUBE_ACCOUNT", JSON.stringify({ revision: "old-oauth" }));
  assert.equal(await youtubeMode(), "oauth");
  await saveGeminiVideo(key, GEMINI_VIDEO_MODEL);
  assert.equal(await youtubeMode(), "gemini");
  const status = await geminiVideoStatus();
  assert.equal(status.configured, true);
  assert.ok(!JSON.stringify(status).includes(key));
  const row = abrirBanco()
    .prepare("SELECT valor FROM config WHERE chave = ?")
    .get("GEMINI_API_KEY") as { valor: string };
  assert.match(row.valor, /^v1:/);
  assert.ok(!row.valor.includes(key));
  await saveGeminiVideo("", "gemini-2.5-flash");
  assert.equal((await geminiVideoConfig()).key, key);
  assert.equal((await geminiVideoConfig()).model, "gemini-2.5-flash");
  await assert.rejects(
    saveGeminiVideo("short", GEMINI_VIDEO_MODEL),
    /formato inválido/,
  );
  await assert.rejects(
    saveGeminiVideo(key, "https://another.example"),
    /modelo Gemini válido/,
  );
  await assert.rejects(setYouTubeMode("bad"), /forma válida/);
  await removeGeminiVideo();
  assert.equal(await youtubeMode(), "gemini");
  assert.equal((await geminiVideoStatus()).configured, false);
  setConfig("YOUTUBE_ACCOUNT", null);
});

test("credenciais e modo definidos pelo ambiente não podem ser alterados pela interface", async () => {
  process.env.GEMINI_API_KEY = key;
  process.env.GEMINI_VIDEO_MODEL = GEMINI_VIDEO_MODEL;
  process.env.YOUTUBE_IMPORT_MODE = "gemini";
  try {
    const status = await geminiVideoStatus();
    assert.equal(status.managed, true);
    assert.equal(status.modelManaged, true);
    assert.equal(status.modeManaged, true);
    await assert.rejects(saveGeminiVideo(key, GEMINI_VIDEO_MODEL), /ambiente/);
    await assert.rejects(removeGeminiVideo(), /ambiente/);
    await assert.rejects(setYouTubeMode("oauth"), /ambiente/);
    await assert.rejects(saveGeminiVideo("", "gemini-2.5-flash"), /ambiente/);
    await saveGeminiVideo("", GEMINI_VIDEO_MODEL);
  } finally {
    delete process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_VIDEO_MODEL;
    delete process.env.YOUTUBE_IMPORT_MODE;
  }
});

test("importação e geração integram análise Gemini, referências e persistência sem chamar YouTube OAuth", async () => {
  const { setConfig } = await import("./store");
  const { youtubeSource } = await import("./sources");
  const { generate } = await import("./generation");
  const { getMap } = await import("./maps");
  await saveGeminiVideo(key, GEMINI_VIDEO_MODEL);
  setConfig(
    "YOUTUBE_ACCOUNT",
    JSON.stringify({ revision: "oauth-still-connected" }),
  );
  setConfig("OPENROUTER_API_KEY", "test-openrouter-key");
  const original = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = async (url, init) => {
    calls.push(String(url));
    if (String(url).includes("generativelanguage.googleapis.com"))
      return Response.json(completed());
    if (String(url).includes("openrouter.ai")) {
      assert.match(String(init?.body), /Não é uma transcrição literal/);
      return Response.json({
        choices: [
          {
            message: {
              content: JSON.stringify({
                title: "Mapa do vídeo",
                summary: "Síntese do conteúdo analisado.",
                root: {
                  label: "Ideias",
                  note: "",
                  refs: [],
                  children: [
                    {
                      label: "Organização",
                      note: "",
                      refs: ["t1", "fake-ref"],
                      children: [],
                    },
                    {
                      label: "Aplicação",
                      note: "",
                      refs: ["t2"],
                      children: [],
                    },
                  ],
                },
              }),
            },
            finish_reason: "stop",
          },
        ],
      });
    }
    throw new Error(`Unexpected provider ${url}`);
  };
  try {
    const phases: string[] = [];
    const source = await youtubeSource(
      `https://youtu.be/${id}?t=20`,
      undefined,
      (phase) => phases.push(phase),
    );
    assert.equal(phases[0], "Analisando o vídeo com Gemini");
    const map = await generate(
      source,
      "brief",
      "",
      new AbortController().signal,
      () => {},
      { provider: "openrouter", model: "test-model" },
    );
    assert.equal(getMap(map.id).source.analysis?.provider, "gemini");
    assert.deepEqual(map.root.children[0].refs, ["t1"]);
    assert.equal(calls.length, 2);
    globalThis.fetch = async () =>
      Response.json({ error: {} }, { status: 429 });
    await assert.rejects(youtubeSource(`https://youtu.be/${id}`), /cota/);
    assert.ok(!JSON.stringify(map).includes(key));
  } finally {
    globalThis.fetch = original;
  }
});
