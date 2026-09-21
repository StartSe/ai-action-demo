import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sseData, partialJSON } from "./streaming";
import { mapPreview } from "./map-preview";
import { layoutTree } from "./layout";
import { analyzeYouTubeVideo } from "./gemini-video";
import { youtubeId, youtubeThumbnail } from "./youtube-link";
import type { Job } from "./types";
const dir = mkdtempSync(join(tmpdir(), "mapia-progressive-"));
process.env.DATA_DIR = dir;
const { setConfig } = await import("./store");
const { ask } = await import("./ai");
const { startJob, readJob, cancelJob } = await import("./generation");
const { getMap, recoverJobs, saveJob } = await import("./maps");
const { youtubeSource } = await import("./sources");
setConfig("OPENROUTER_API_KEY", "fixture-only");
setConfig("GEMINI_API_KEY", "fixture-only");
test.after(() => rmSync(dir, { recursive: true, force: true }));
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
function sse(events: unknown[], delay = 0) {
  let cancelled = false,
    index = 0;
  return new Response(
    new ReadableStream({
      async pull(controller) {
        if (delay) await sleep(delay);
        if (cancelled) return;
        if (index === events.length) {
          controller.close();
          return;
        }
        const event = events[index++];
        controller.enqueue(
          new TextEncoder().encode(
            `data: ${typeof event === "string" ? event : JSON.stringify(event)}\n\n`,
          ),
        );
      },
      cancel() {
        cancelled = true;
      },
    }),
    { headers: { "content-type": "text/event-stream" } },
  );
}
const child = (label: string) => ({
  label,
  note: "Explicação recebida",
  refs: ["t1", "inventada"],
  children: [],
});
const tree = {
  title: "Mapa de teste",
  summary: "Síntese",
  root: {
    label: "Ideias reais",
    note: "",
    refs: [],
    children: [child("Conceito A"), child("Conceito B"), child("Conceito C")],
  },
};
const json = JSON.stringify(tree);
const analysis = {
  accessible: true,
  title: "Vídeo de teste",
  duration_seconds: 120,
  segments: [
    {
      start_seconds: 0,
      end_seconds: 120,
      text: "O vídeo organiza conceitos e apresenta exemplos práticos para compreender as relações entre as ideias apresentadas.",
    },
  ],
};
function videoEvents() {
  const text = JSON.stringify(analysis);
  return [
    { event_type: "step.start", index: 0, step: { type: "thought" } },
    {
      event_type: "step.delta",
      index: 0,
      delta: { type: "text", text: "PRIVATE_REASONING" },
    },
    { event_type: "step.start", index: 1, step: { type: "model_output" } },
    {
      event_type: "step.delta",
      index: 1,
      delta: { type: "text", text: text.slice(0, 80) },
    },
    {
      event_type: "step.delta",
      index: 1,
      delta: { type: "text", text: text.slice(80) },
    },
    {
      event_type: "interaction.completed",
      interaction: { status: "completed" },
    },
  ];
}
function mapEvents() {
  const atA =
    json.indexOf('"label":"Conceito A"') + '"label":"Conceito A"'.length;
  const atB =
    json.indexOf('"label":"Conceito B"') + '"label":"Conceito B"'.length;
  return [json.slice(0, atA), json.slice(atA, atB), json.slice(atB)]
    .map((content) => ({ choices: [{ delta: { content } }] }))
    .concat([{ choices: [{ delta: {}, finish_reason: "stop" }] }] as never[])
    .concat(["[DONE]"] as never[]);
}
test("SSE decodifica UTF-8 fragmentado, CRLF, comentários e múltiplas linhas; descarta evento incompleto", async () => {
  const bytes = new TextEncoder().encode(
    ": keepalive\r\ndata: olá\r\ndata: mundo\r\n\r\ndata: fim\n\ndata: incompleto",
  );
  const response = new Response(
    new ReadableStream({
      start(c) {
        for (const b of bytes) c.enqueue(new Uint8Array([b]));
        c.close();
      },
    }),
  );
  const output = [];
  for await (const data of sseData(response)) output.push(data);
  assert.deepEqual(output, ["olá\nmundo", "fim"]);
});
test("SSE aborta uma leitura pendente e rejeita resposta excessiva", async () => {
  const abort = new AbortController();
  let cancelled = false;
  const response = new Response(
    new ReadableStream({
      cancel() {
        cancelled = true;
      },
    }),
  );
  const pending = (async () => {
    for await (const data of sseData(response, abort.signal)) void data;
  })();
  abort.abort();
  await assert.rejects(pending, { name: "AbortError" });
  assert.ok(cancelled);
  await assert.rejects(async () => {
    for await (const data of sseData(new Response("x".repeat(2_000_001))))
      void data;
  }, /tamanho permitido/);
});
test("prévia exige labels completos, limita referências e mantém IDs e lados enquanto recebe ramos", () => {
  assert.equal(
    mapPreview('{"root":{"label":"Incompleto', new Set()),
    undefined,
  );
  const a = mapPreview(
    '{"root":{"label":"Raiz \\"x\\" { }", "children":[{"label":"A","refs":["t1","fake"]},{"label":"B',
    new Set(["t1"]),
  )!;
  assert.equal(a.children.length, 1);
  assert.deepEqual(a.children[0].refs, ["t1"]);
  const b = mapPreview(json, new Set(["t1"]))!;
  const small = layoutTree({ ...b, children: b.children.slice(0, 2) });
  const large = layoutTree(b);
  for (const n of small) {
    const next = large.find((x) => x.node.id === n.node.id)!;
    assert.equal(next.side, n.side);
    assert.equal(next.color, n.color);
  }
  assert.equal(
    (partialJSON('{"__proto__":{"polluted":true}}') as Record<string, unknown>)
      .__proto__ !== undefined,
    true,
  );
  assert.equal(({} as Record<string, unknown>).polluted, undefined);
  assert.equal(partialJSON("x".repeat(500001)), null);
  assert.equal(youtubeId("invalid"), null);
  assert.equal(
    youtubeThumbnail("https://youtube.com.evil/watch?v=1QNsdr-Qx_I"),
    undefined,
  );
});
test("OpenRouter transmite texto antes do fim; erros, corte e falta de conclusão nunca viram sucesso", async () => {
  const parts: string[] = [];
  const output = await ask(
    "s",
    "p",
    undefined,
    { provider: "openrouter", model: "fixture" },
    async (_url, init) => {
      assert.equal(JSON.parse(String(init?.body)).stream, true);
      return sse(mapEvents());
    },
    (text) => parts.push(text),
  );
  assert.equal(output, json);
  assert.equal(parts.length, 3);
  assert.ok(parts[0].length < json.length);
  for (const events of [
    mapEvents().slice(0, -1),
    [{ error: { message: "secret" } }],
    [{ choices: [{ finish_reason: "length" }] }],
    ["malformed-json"],
  ]) {
    await assert.rejects(
      ask(
        "s",
        "p",
        undefined,
        { provider: "openrouter", model: "fixture" },
        async () => sse(events),
        () => {},
      ),
      (error) => error instanceof Error && !error.message.includes("secret"),
    );
  }
});
test("Gemini transmite apenas saída pública; exige conclusão e preserva classificação 402", async () => {
  const seen: unknown[] = [];
  const result = await analyzeYouTubeVideo(
    "1QNsdr-Qx_I",
    undefined,
    { key: "fixture", model: "gemini-fixture" },
    async (url, init) => {
      assert.match(String(url), /interactions\?alt=sse$/);
      assert.equal(JSON.parse(String(init?.body)).stream, true);
      return sse(videoEvents(), 210);
    },
    (p) => seen.push(p),
  );
  assert.equal(result.title, analysis.title);
  assert.ok(seen.length >= 2);
  assert.doesNotMatch(JSON.stringify(seen), /PRIVATE_REASONING/);
  await assert.rejects(
    analyzeYouTubeVideo(
      "1QNsdr-Qx_I",
      undefined,
      { key: "fixture", model: "gemini-fixture" },
      async () => sse(videoEvents().slice(0, -1)),
      () => {},
    ),
    /antes de concluir/,
  );
  await assert.rejects(
    analyzeYouTubeVideo(
      "1QNsdr-Qx_I",
      undefined,
      { key: "fixture", model: "gemini-fixture" },
      async () =>
        sse([
          {
            event_type: "error",
            error: { code: "payment_required", message: "secret" },
          },
        ]),
      () => {},
    ),
    /HTTP 402/,
  );
});
async function untilDone(id: string) {
  for (let i = 0; i < 160; i++) {
    const job = readJob(id);
    if (job.status !== "running") return job;
    await sleep(25);
  }
  throw new Error("job timed out");
}
test("job persiste thumbnail e prévias antes do fim; falha e cancelamento preservam contexto sem mapa", async () => {
  const original = globalThis.fetch;
  let mode = "success";
  globalThis.fetch = async (url) =>
    String(url).includes("googleapis")
      ? sse(videoEvents(), 60)
      : sse(mode === "error" ? mapEvents().slice(0, 2) : mapEvents(), 260);
  try {
    for (const current of ["success", "error", "cancel"]) {
      mode = current;
      const job = await startJob(
        (signal, progress) =>
          youtubeSource("https://youtu.be/1QNsdr-Qx_I", signal, progress),
        "brief",
        "",
        {
          kind: "youtube",
          title: "Vídeo",
          url: "https://youtu.be/1QNsdr-Qx_I",
        },
      );
      assert.equal(
        readJob(job.id).preview?.url,
        "https://youtu.be/1QNsdr-Qx_I",
      );
      let partial: Job | undefined;
      for (let i = 0; i < 100; i++) {
        const next = readJob(job.id);
        if (next.preview?.root?.children.length) {
          partial = next;
          break;
        }
        await sleep(25);
      }
      assert.equal(partial?.status, "running");
      assert.ok(partial?.preview?.root?.children.length);
      assert.ok(partial?.sourceSegments);
      if (current === "cancel") cancelJob(job.id);
      const final = await untilDone(job.id);
      if (current === "success") {
        assert.equal(final.status, "done");
        const map = getMap(final.mapId!);
        assert.equal(map.root.children.length, 3);
        assert.deepEqual(map.root.children[0].refs, ["t1"]);
        assert.equal(
          map.root.children[0].id,
          partial?.preview?.root?.children[0].id,
        );
      } else {
        assert.equal(final.status, current === "error" ? "error" : "cancelled");
        assert.equal(final.mapId, undefined);
        assert.ok(final.preview?.root?.children.length);
      }
    }
    const interrupted: Job = {
      id: "restart",
      status: "running",
      phase: "Construindo",
      progress: 75,
      createdAt: new Date().toISOString(),
      preview: {
        kind: "youtube",
        title: "Preservado",
        root: mapPreview(json, new Set(["t1"])),
      },
    };
    saveJob(interrupted);
    recoverJobs();
    assert.equal(readJob("restart").status, "error");
    assert.deepEqual(readJob("restart").preview, interrupted.preview);
  } finally {
    globalThis.fetch = original;
  }
});

test("heartbeat confirma servidor ativo sem inventar progresso do provedor", async () => {
  const job = await startJob(
    (signal) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason), {
          once: true,
        });
      }),
    "brief",
    "",
    { kind: "youtube", title: "Analisando vídeo" },
  );
  const initial = readJob(job.id);
  await sleep(5150);
  const alive = readJob(job.id);
  assert.ok(alive.heartbeatAt! > initial.heartbeatAt!);
  assert.equal(alive.updatedAt, initial.updatedAt);
  assert.equal(alive.progress, initial.progress);
  assert.equal(alive.preview?.root, undefined);
  cancelJob(job.id);
  assert.equal((await untilDone(job.id)).status, "cancelled");
});
