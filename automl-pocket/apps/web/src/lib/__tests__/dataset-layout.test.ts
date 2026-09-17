import { describe, expect, it } from "vitest";

import type { DatasetParseOptions, LayoutDiagnosis } from "@/db/schema";
import {
  DATASET_NOT_FOUND_MESSAGE,
  LAYOUT_ENQUEUE_FAILED_MESSAGE,
  LAYOUT_INVALID_MESSAGE,
  LAYOUT_NOT_REVIEWABLE_MESSAGE,
  MAX_LAYOUT_SHEETS,
  handleDatasetLayout,
  incompatibleSheetsMessage,
  isLayoutReviewable,
  layoutOptionsSchema,
  layoutReviewedMetadata,
  missingSheetMessage,
  validateAgainstDiagnosis,
  type DatasetLayoutDeps,
  type LayoutDatasetRow,
  type LayoutReviewedEvent,
} from "@/lib/dataset-layout";
import type { SessionUser } from "@/lib/session";

const DATASET_ID = "33333333-3333-4333-8333-333333333333";
const OTHER_ORG_DATASET_ID = "44444444-4444-4444-8444-444444444444";

const USER: SessionUser = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Fernanda",
  email: "fernanda@exemplo.com.br",
  orgId: "22222222-2222-4222-8222-222222222222",
};

/** Diagnóstico de uma planilha com 3 abas: Jan e Fev iguais, Guia diferente. */
const DIAGNOSIS: LayoutDiagnosis = {
  sheets: [
    sheet("Jan", ["data", "produto", "valor"]),
    sheet("Fev", ["data", "produto", "valor"]),
    sheet("Guia", ["descricao", "passo"]),
  ],
  groups: [
    { sheets: ["Jan", "Fev"], fingerprint: ["data", "produto", "valor"] },
    { sheets: ["Guia"], fingerprint: ["descricao", "passo"] },
  ],
  needsReview: true,
  truncated: false,
};

/** Mesmo diagnóstico depois de um profiling que achou estrutura ruim (US-028). */
const DIAGNOSIS_WITH_WARNINGS: LayoutDiagnosis = {
  ...DIAGNOSIS,
  needsReview: false,
  warnings: ["unnamed_columns"],
};

function sheet(name: string, fingerprint: string[]) {
  return {
    name,
    rowCount: 10,
    colCount: fingerprint.length,
    headerRow: 0,
    orientation: "horizontal" as const,
    schemaFingerprint: fingerprint,
    preview: [fingerprint],
  };
}

const VALID_BODY = {
  sheets: ["Jan", "Fev"],
  combine: true,
  headerRow: 0,
  transpose: false,
};

function datasetRow(
  overrides: Partial<LayoutDatasetRow> = {},
): LayoutDatasetRow {
  return {
    id: DATASET_ID,
    status: "needs_review",
    layoutDiagnosis: DIAGNOSIS,
    parseOptions: null,
    ...overrides,
  };
}

/** Deps fake: sessão válida, dataset da org em needs_review, fila ok. */
function makeDeps(
  overrides: Partial<DatasetLayoutDeps> = {},
  row: LayoutDatasetRow | null = datasetRow(),
) {
  const calls = {
    saved: [] as { datasetId: string; options: DatasetParseOptions }[],
    enqueued: [] as string[],
    failed: [] as { datasetId: string; message: string }[],
    lookups: [] as { viewerOrgId: string; datasetId: string }[],
    audits: [] as LayoutReviewedEvent[],
  };
  const deps: DatasetLayoutDeps = {
    getApiUser: async () => ({ ok: true, user: USER }),
    findDataset: async (viewer, datasetId) => {
      calls.lookups.push({ viewerOrgId: viewer.orgId, datasetId });
      return row && row.id === datasetId ? row : null;
    },
    saveOptions: async (datasetId, options) => {
      calls.saved.push({ datasetId, options });
    },
    enqueueParse: async (datasetId) => {
      calls.enqueued.push(datasetId);
    },
    markEnqueueFailed: async (datasetId, message) => {
      calls.failed.push({ datasetId, message });
    },
    audit: async (event) => {
      calls.audits.push(event);
    },
    ...overrides,
  };
  return { deps, calls };
}

function request(body: unknown): Request {
  return new Request(
    `http://localhost:3000/api/datasets/${DATASET_ID}/layout`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    },
  );
}

function post(
  body: unknown,
  deps: DatasetLayoutDeps,
  datasetId: string = DATASET_ID,
) {
  return handleDatasetLayout(request(body), { datasetId }, deps);
}

describe("layoutOptionsSchema", () => {
  it("aceita o shape completo", () => {
    expect(layoutOptionsSchema.safeParse(VALID_BODY).success).toBe(true);
  });

  it.each([
    ["sem sheets", { ...VALID_BODY, sheets: undefined }],
    ["sheets vazio", { ...VALID_BODY, sheets: [] }],
    ["sheets com string vazia", { ...VALID_BODY, sheets: ["Jan", "  "] }],
    [
      "sheets acima do limite",
      {
        ...VALID_BODY,
        sheets: Array.from(
          { length: MAX_LAYOUT_SHEETS + 1 },
          (_, i) => `Aba ${i}`,
        ),
      },
    ],
    ["sheets não é lista", { ...VALID_BODY, sheets: "Jan" }],
    ["combine ausente", { ...VALID_BODY, combine: undefined }],
    ["combine string", { ...VALID_BODY, combine: "true" }],
    ["headerRow negativo", { ...VALID_BODY, headerRow: -1 }],
    ["headerRow fracionário", { ...VALID_BODY, headerRow: 1.5 }],
    ["headerRow string", { ...VALID_BODY, headerRow: "0" }],
    ["transpose ausente", { ...VALID_BODY, transpose: undefined }],
  ])("rejeita %s", (_label, body) => {
    expect(layoutOptionsSchema.safeParse(body).success).toBe(false);
  });
});

describe("isLayoutReviewable", () => {
  it("aceita needs_review com ou sem opções anteriores", () => {
    expect(
      isLayoutReviewable(
        datasetRow({ status: "needs_review", parseOptions: null }),
      ),
    ).toBe(true);
    expect(
      isLayoutReviewable(
        datasetRow({ status: "needs_review", parseOptions: VALID_BODY }),
      ),
    ).toBe(true);
  });

  it("aceita error só quando o parse anterior já rodou com opções", () => {
    expect(
      isLayoutReviewable(
        datasetRow({ status: "error", parseOptions: VALID_BODY }),
      ),
    ).toBe(true);
    expect(
      isLayoutReviewable(datasetRow({ status: "error", parseOptions: null })),
    ).toBe(false);
  });

  it("aceita ready só quando o profiling deixou avisos de estrutura", () => {
    expect(
      isLayoutReviewable(
        datasetRow({
          status: "ready",
          layoutDiagnosis: DIAGNOSIS_WITH_WARNINGS,
        }),
      ),
    ).toBe(true);
    expect(
      isLayoutReviewable(
        datasetRow({
          status: "ready",
          layoutDiagnosis: { ...DIAGNOSIS, warnings: [] },
        }),
      ),
    ).toBe(false);
    expect(
      isLayoutReviewable(
        datasetRow({ status: "ready", layoutDiagnosis: null }),
      ),
    ).toBe(false);
  });

  it("avisos só valem em ready (em profiling/parsing continua inelegível)", () => {
    for (const status of ["uploading", "parsing", "profiling"] as const) {
      expect(
        isLayoutReviewable(
          datasetRow({ status, layoutDiagnosis: DIAGNOSIS_WITH_WARNINGS }),
        ),
      ).toBe(false);
    }
  });

  it.each(["uploading", "parsing", "profiling", "ready"] as const)(
    "rejeita status %s mesmo com opções",
    (status) => {
      expect(
        isLayoutReviewable(datasetRow({ status, parseOptions: VALID_BODY })),
      ).toBe(false);
    },
  );
});

describe("validateAgainstDiagnosis", () => {
  it("sem diagnóstico confia no worker", () => {
    expect(validateAgainstDiagnosis(VALID_BODY, null)).toBeNull();
  });

  it("aceita abas do mesmo grupo com combine", () => {
    expect(validateAgainstDiagnosis(VALID_BODY, DIAGNOSIS)).toBeNull();
  });

  it("aceita abas de grupos diferentes sem combine (só a primeira é lida)", () => {
    expect(
      validateAgainstDiagnosis(
        { ...VALID_BODY, sheets: ["Jan", "Guia"], combine: false },
        DIAGNOSIS,
      ),
    ).toBeNull();
  });

  it("combine com grupos diferentes devolve a mensagem do worker", () => {
    expect(
      validateAgainstDiagnosis(
        { ...VALID_BODY, sheets: ["Jan", "Guia"] },
        DIAGNOSIS,
      ),
    ).toBe(incompatibleSheetsMessage("Jan", "Guia"));
    // A aba incompatível citada é a primeira que difere da primeira escolhida
    expect(
      validateAgainstDiagnosis(
        { ...VALID_BODY, sheets: ["Guia", "Jan", "Fev"] },
        DIAGNOSIS,
      ),
    ).toBe(incompatibleSheetsMessage("Guia", "Jan"));
  });

  it("combine com uma aba só nunca falha", () => {
    expect(
      validateAgainstDiagnosis({ ...VALID_BODY, sheets: ["Guia"] }, DIAGNOSIS),
    ).toBeNull();
  });

  it("aba fora do diagnóstico devolve a mensagem do worker", () => {
    expect(
      validateAgainstDiagnosis(
        { ...VALID_BODY, sheets: ["Jan", "Mar"] },
        DIAGNOSIS,
      ),
    ).toBe(missingSheetMessage("Mar"));
  });

  it("diagnóstico sem abas (json) não valida nomes", () => {
    const empty: LayoutDiagnosis = {
      sheets: [],
      groups: [],
      needsReview: false,
      truncated: false,
    };
    expect(
      validateAgainstDiagnosis({ ...VALID_BODY, sheets: ["qualquer"] }, empty),
    ).toBeNull();
  });
});

describe("handleDatasetLayout", () => {
  it("grava opções, reenfileira o parse e responde 202", async () => {
    const { deps, calls } = makeDeps();
    const response = await post(VALID_BODY, deps);

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({
      datasetId: DATASET_ID,
      status: "parsing",
    });
    expect(calls.saved).toEqual([
      { datasetId: DATASET_ID, options: VALID_BODY },
    ]);
    expect(calls.enqueued).toEqual([DATASET_ID]);
    expect(calls.failed).toEqual([]);
    // A busca é sempre com a org da sessão, nunca com um orgId do body
    expect(calls.lookups).toEqual([
      { viewerOrgId: USER.orgId, datasetId: DATASET_ID },
    ]);
  });

  it("grava as opções ANTES de enfileirar (o worker lê a linha ao pegar o job)", async () => {
    const order: string[] = [];
    const { deps } = makeDeps({
      saveOptions: async () => {
        order.push("save");
      },
      enqueueParse: async () => {
        order.push("enqueue");
      },
    });
    await post(VALID_BODY, deps);
    expect(order).toEqual(["save", "enqueue"]);
  });

  it("normaliza abas repetidas e espaços nos nomes", async () => {
    const { deps, calls } = makeDeps();
    const response = await post(
      { ...VALID_BODY, sheets: [" Jan", "Jan", "Fev "] },
      deps,
    );
    expect(response.status).toBe(202);
    expect(calls.saved[0]?.options.sheets).toEqual(["Jan", "Fev"]);
  });

  it("aceita dataset em error depois de um parse com opções (nova tentativa)", async () => {
    const { deps, calls } = makeDeps(
      {},
      datasetRow({
        status: "error",
        parseOptions: { ...VALID_BODY, headerRow: 3 },
      }),
    );
    const response = await post(VALID_BODY, deps);
    expect(response.status).toBe(202);
    expect(calls.saved[0]?.options).toEqual(VALID_BODY);
  });

  it("grava dataset.layout_reviewed com a metadata resumida das escolhas", async () => {
    const { deps, calls } = makeDeps();
    const response = await post(
      { sheets: ["Jan", "Fev"], combine: true, headerRow: 2, transpose: true },
      deps,
    );
    expect(response.status).toBe(202);
    expect(calls.audits).toEqual([
      {
        userId: USER.id,
        orgId: USER.orgId,
        datasetId: DATASET_ID,
        metadata: {
          needsReview: true,
          sheets: 2,
          combined: true,
          headerRow: 2,
          transposed: true,
        },
      },
    ]);
    // Nunca nomes de aba nem conteúdo: só contagens e booleanos
    expect(JSON.stringify(calls.audits[0].metadata)).not.toContain("Jan");
  });

  it("audita depois de gravar e enfileirar", async () => {
    const order: string[] = [];
    const { deps } = makeDeps({
      saveOptions: async () => {
        order.push("save");
      },
      enqueueParse: async () => {
        order.push("enqueue");
      },
      audit: async () => {
        order.push("audit");
      },
    });
    await post(VALID_BODY, deps);
    expect(order).toEqual(["save", "enqueue", "audit"]);
  });

  it("dataset ready com avisos do profiling aceita a revisão (banner da US-028)", async () => {
    const { deps, calls } = makeDeps(
      {},
      datasetRow({ status: "ready", layoutDiagnosis: DIAGNOSIS_WITH_WARNINGS }),
    );
    const response = await post(VALID_BODY, deps);
    expect(response.status).toBe(202);
    expect(calls.saved).toHaveLength(1);
    expect(calls.enqueued).toEqual([DATASET_ID]);
    expect(calls.audits[0]?.metadata.needsReview).toBe(false);
  });

  it("sem diagnóstico a metadata leva needsReview null", () => {
    expect(layoutReviewedMetadata(VALID_BODY, null)).toEqual({
      needsReview: null,
      sheets: 2,
      combined: true,
      headerRow: 0,
      transposed: false,
    });
  });

  it("responde 401/403 da sessão sem tocar no dataset", async () => {
    const denied = new Response(JSON.stringify({ error: "Não autenticado." }), {
      status: 401,
    });
    const { deps, calls } = makeDeps({
      getApiUser: async () => ({ ok: false, response: denied }),
    });
    const response = await post(VALID_BODY, deps);
    expect(response.status).toBe(401);
    expect(calls.lookups).toEqual([]);
    expect(calls.saved).toEqual([]);
  });

  it("id que não é UUID responde 404 sem consultar o banco", async () => {
    const { deps, calls } = makeDeps();
    const response = await post(VALID_BODY, deps, "nao-e-uuid");
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: DATASET_NOT_FOUND_MESSAGE,
    });
    expect(calls.lookups).toEqual([]);
  });

  it("dataset de outra org (ou inexistente) responde 404", async () => {
    const { deps, calls } = makeDeps();
    const response = await post(VALID_BODY, deps, OTHER_ORG_DATASET_ID);
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: DATASET_NOT_FOUND_MESSAGE,
    });
    expect(calls.saved).toEqual([]);
    expect(calls.enqueued).toEqual([]);
  });

  it("corpo que não é JSON responde 400", async () => {
    const { deps, calls } = makeDeps();
    const response = await post("{nao-json", deps);
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: LAYOUT_INVALID_MESSAGE,
    });
    expect(calls.lookups).toEqual([]);
  });

  it("corpo fora do schema responde 400 antes de buscar o dataset", async () => {
    const { deps, calls } = makeDeps();
    const response = await post({ ...VALID_BODY, sheets: [] }, deps);
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: LAYOUT_INVALID_MESSAGE,
    });
    expect(calls.lookups).toEqual([]);
    expect(calls.saved).toEqual([]);
  });

  it.each([
    ["ready", null],
    ["parsing", null],
    ["profiling", VALID_BODY],
    ["error sem opções (parse automático)", null],
  ] as const)(
    "dataset em %s responde 409 sem gravar",
    async (label, parseOptions) => {
      const status = label.split(" ")[0] as LayoutDatasetRow["status"];
      const { deps, calls } = makeDeps(
        {},
        datasetRow({ status, parseOptions }),
      );
      const response = await post(VALID_BODY, deps);
      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toEqual({
        error: LAYOUT_NOT_REVIEWABLE_MESSAGE,
      });
      expect(calls.saved).toEqual([]);
      expect(calls.enqueued).toEqual([]);
      expect(calls.audits).toEqual([]);
    },
  );

  it("combine com abas de grupos diferentes responde 400 com a mensagem do worker", async () => {
    const { deps, calls } = makeDeps();
    const response = await post(
      { ...VALID_BODY, sheets: ["Jan", "Guia"] },
      deps,
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error:
        "As abas Jan e Guia têm colunas diferentes e não podem ser combinadas.",
    });
    expect(calls.saved).toEqual([]);
    expect(calls.enqueued).toEqual([]);
  });

  it("aba que não existe no diagnóstico responde 400 com a mensagem do worker", async () => {
    const { deps, calls } = makeDeps();
    const response = await post({ ...VALID_BODY, sheets: ["Mar"] }, deps);
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "A aba 'Mar' não existe na planilha ou está vazia.",
    });
    expect(calls.saved).toEqual([]);
  });

  it("sem diagnóstico gravado deixa o worker validar", async () => {
    const { deps, calls } = makeDeps({}, datasetRow({ layoutDiagnosis: null }));
    const response = await post(
      { ...VALID_BODY, sheets: ["Qualquer", "Outra"] },
      deps,
    );
    expect(response.status).toBe(202);
    expect(calls.enqueued).toEqual([DATASET_ID]);
  });

  it("falha na fila marca o dataset em error e responde 500", async () => {
    const { deps, calls } = makeDeps({
      enqueueParse: async () => {
        throw new Error("redis fora");
      },
    });
    const response = await post(VALID_BODY, deps);
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: LAYOUT_ENQUEUE_FAILED_MESSAGE,
    });
    // As opções ficaram gravadas: o dataset segue elegível a nova tentativa
    expect(calls.saved).toHaveLength(1);
    expect(calls.audits).toEqual([]);
    expect(calls.failed).toEqual([
      { datasetId: DATASET_ID, message: LAYOUT_ENQUEUE_FAILED_MESSAGE },
    ]);
  });
});
