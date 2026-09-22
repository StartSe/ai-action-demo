import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { countNodes, type GenerationPatch, type Source } from "./types";
import { layoutTree } from "./layout";

const dir = mkdtempSync(join(tmpdir(), "mapia-depth-"));
process.env.DATA_DIR = dir;
const { generate, startJob, readJob, cancelJob } = await import("./generation");
const { setConfig } = await import("./store");
const { getMap, listMaps } = await import("./maps");
setConfig("OPENROUTER_API_KEY", "fixture-only");
test.after(() => rmSync(dir, { recursive: true, force: true }));

const node = (label: string, children: unknown[] = [], refs = ["s1"]) => ({
  label,
  note: "Explicação de validação.",
  refs,
  children,
});
// Synthetic excerpts based on the comparison: not a transcript or a live-provider evaluation.
const source: Source = {
  kind: "text",
  title: "Demonstração Atlas",
  characters: 500,
  segments: [
    {
      id: "s1",
      label: "Demonstração 3D",
      text: "O apresentador desenha um foguete por voz, exporta o modelo para Blender e produz um arquivo STL para impressão 3D. No jogo, usa setas para mover e espaço para impulso entre asteroides.",
    },
    {
      id: "s2",
      label: "Documentos",
      text: "Uma apresentação tem imagens redimensionadas e cores de fundo ajustadas. Um contrato recebe uma alteração na cláusula de limitação de responsabilidade para favorecer uma das partes.",
    },
  ],
};
const plan = {
  title: "Atlas: criação e documentos",
  summary: "Demonstrações e resultados.",
  root: node("Atlas", [
    node("Criação visual e 3D"),
    node("Documentos profissionais", [], ["s2"]),
  ]),
};
const expanded = [
  {
    root: node("Criação visual e 3D", [
      node("Criar foguete por voz", [
        node("Exportar modelo para Blender"),
        node("Gerar STL para impressão 3D"),
      ]),
      node("Jogo entre asteroides", [
        node("Mover com setas e impulsionar com espaço"),
      ]),
    ]),
  },
  {
    root: node(
      "Documentos profissionais",
      [
        node(
          "Ajustar apresentação",
          [node("Redimensionar imagens e trocar cores de fundo", [], ["s2"])],
          ["s2"],
        ),
        node(
          "Revisar contrato",
          [
            node(
              "Alterar cláusula de limitação de responsabilidade",
              [],
              ["s2"],
            ),
          ],
          ["s2"],
        ),
      ],
      ["s2"],
    ),
  },
];
function response(value: unknown, streaming: boolean) {
  const text = JSON.stringify(value);
  return streaming
    ? new Response(
        [
          ...text
            .match(/[\s\S]{1,180}/g)!
            .map(
              (content) =>
                `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`,
            ),
          `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] })}\n\n`,
          "data: [DONE]\n\n",
        ].join(""),
        { headers: { "content-type": "text/event-stream" } },
      )
    : Response.json({
        choices: [{ finish_reason: "stop", message: { content: text } }],
      });
}
const config = { provider: "openrouter", model: "fixture/model" } as const;

test("aprofundado planeja e expande com fonte integral; fatos aparecem nos labels, referências e IDs persistem", async () => {
  const previous = globalThis.fetch;
  let calls = 0;
  const patches: GenerationPatch[] = [];
  // Cross the old summarization threshold. Details at the end must reach EVERY expansion.
  const longSource = {
    ...source,
    segments: [
      ...source.segments,
      {
        id: "s3",
        label: "Final",
        text:
          "Contexto da apresentação. ".repeat(700) + "DETALHE_FINAL_PRESERVADO",
      },
    ],
  };
  globalThis.fetch = (async (_url, init) => {
    const body = JSON.parse(init!.body as string);
    assert.match(body.messages[1].content, /DETALHE_FINAL_PRESERVADO/);
    assert.match(body.messages[1].content, /cláusula de limitação/);
    assert.match(body.messages[1].content, /Blender/);
    assert.match(body.messages[1].content, /Foco desejado: demonstrações/);
    return response([plan, ...expanded][calls++], body.stream);
  }) as typeof fetch;
  try {
    const map = await generate(
      longSource,
      "deep",
      "demonstrações",
      new AbortController().signal,
      (_phase, _value, patch) => {
        if (patch) patches.push(structuredClone(patch));
      },
      config,
      true,
    );
    assert.equal(
      calls,
      3,
      "one plan and one expansion per branch, no lossy summaries",
    );
    const labels = layoutTree(map.root).map((n) => n.node.label);
    for (const fact of [
      "Blender",
      "STL",
      "setas",
      "cores de fundo",
      "limitação de responsabilidade",
    ])
      assert.ok(
        labels.some((label) => label.includes(fact)),
        fact,
      );
    assert.equal(countNodes(map.root), 12);
    assert.equal(
      getMap(map.id).root.children[1].children[1].children[0].refs[0],
      "s2",
    );
    const first = patches.find((p) => p.completedBranches === 1)!;
    assert.equal(first.preview!.root!.children[0].id, map.root.children[0].id);
    assert.deepEqual(first.preview!.root!.children[0], map.root.children[0]);
    assert.ok(
      patches.some((p) => p.totalBranches === 2 && p.completedBranches === 2),
    );
    assert.equal(map.root.label, "Atlas");
  } finally {
    globalThis.fetch = previous;
  }
});

test("fonte curta pode gerar poucos detalhes, sem cota mínima artificial de tópicos", async () => {
  const previous = globalThis.fetch;
  const results = [
    plan,
    { root: node("A", [node("Um fato específico")]) },
    { root: node("B", [], ["s2"]) },
  ];
  globalThis.fetch = (async () =>
    response(results.shift(), false)) as typeof fetch;
  try {
    const map = await generate(
      source,
      "deep",
      "",
      new AbortController().signal,
      () => {},
      config,
    );
    assert.equal(countNodes(map.root), 4);
  } finally {
    globalThis.fetch = previous;
  }
});

test("detalhes sem referências, árvores excessivas e ausência de aprofundamento não são salvos", async () => {
  const previous = globalThis.fetch;
  try {
    for (const invalid of [
      { root: node("A", [node("Fato inventado", [], ["fake"])]) },
      {
        root: node(
          "A",
          Array.from({ length: 26 }, (_, i) => node(`Fato ${i}`)),
        ),
      },
      { root: node("A", [node("B", [node("C", [node("D", [node("E")])])])]) },
      { root: node("A") },
      null,
    ]) {
      const before = listMaps().length;
      let calls = 0;
      globalThis.fetch = (async () =>
        response(calls++ === 0 ? plan : invalid, false)) as typeof fetch;
      await assert.rejects(() =>
        generate(
          source,
          "deep",
          "",
          new AbortController().signal,
          () => {},
          config,
        ),
      );
      assert.equal(listMaps().length, before);
    }
  } finally {
    globalThis.fetch = previous;
  }
});

test("cancelamento e erro no segundo ramo preservam prévia e não salvam o plano como mapa", async () => {
  const previous = globalThis.fetch;
  try {
    for (const failure of ["cancel", "provider"] as const) {
      const before = listMaps().length;
      let calls = 0;
      let reached!: () => void;
      const secondBranch = new Promise<void>((r) => {
        reached = r;
      });
      globalThis.fetch = (async (_url, init) => {
        if (calls++ < 2)
          return response(calls === 1 ? plan : expanded[0], true);
        reached();
        if (failure === "provider") return new Response("", { status: 402 });
        return new Promise<Response>((_resolve, reject) => {
          init!.signal!.addEventListener(
            "abort",
            () => reject(init!.signal!.reason),
            { once: true },
          );
        });
      }) as typeof fetch;
      const job = await startJob(async () => source, "deep", "");
      await secondBranch;
      if (failure === "cancel") cancelJob(job.id);
      for (let i = 0; i < 50 && readJob(job.id).status === "running"; i++)
        await new Promise((r) => setTimeout(r, 10));
      const final = readJob(job.id);
      assert.equal(final.status, failure === "cancel" ? "cancelled" : "error");
      assert.equal(final.completedBranches, 1);
      assert.equal(final.mapId, undefined);
      assert.equal(listMaps().length, before);
      assert.ok(final.preview!.root!.children[0].children.length);
    }
  } finally {
    globalThis.fetch = previous;
  }
});

test("sete ramos cabem no orçamento de 120 tópicos sem perder o último detalhe", async () => {
  const previous = globalThis.fetch;
  const fullPlan = {
    ...plan,
    root: node(
      "Centro",
      Array.from({ length: 7 }, (_, i) => node(`Tema ${i}`)),
    ),
  };
  const results = [
    fullPlan,
    ...fullPlan.root.children.map((_, i) => ({
      root: node(
        `Tema ${i}`,
        Array.from({ length: 16 }, (_, j) => node(`Fato ${i}-${j}`)),
      ),
    })),
  ];
  globalThis.fetch = (async () =>
    response(results.shift(), false)) as typeof fetch;
  try {
    const map = await generate(
      source,
      "deep",
      "",
      new AbortController().signal,
      () => {},
      config,
    );
    assert.equal(countNodes(map.root), 120);
    assert.equal(
      getMap(map.id).root.children[6].children[15].label,
      "Fato 6-15",
    );
    assert.equal(results.length, 0);
  } finally {
    globalThis.fetch = previous;
  }
});
