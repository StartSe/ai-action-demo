import { createHash, randomUUID } from "node:crypto";
import { FlowError } from "./flow-store";
import { getConfig, setConfig } from "./store";
import { extractKnowledge, splitDocuments } from "./knowledge-loaders";
import { knowledgeJson, KnowledgeServiceError } from "./knowledge-http";
import {
  deleteKnowledgeBaseRecords,
  deleteKnowledgeSource,
  getKnowledgeBase,
  getKnowledgeSourcePrivate,
  indexKnowledgeConfig,
  knowledgeBaseUsages,
  knowledgeDb,
  listKnowledgeChunks,
  listKnowledgeSources,
  replaceKnowledgeChunks,
  saveKnowledgeBaseRecord,
  saveKnowledgeRun,
  saveKnowledgeSourceRecord,
  withKnowledgeLock,
} from "./knowledge-store";
import type {
  Chunk,
  IndexConfig,
  IndexRun,
  KnowledgeHit,
} from "./knowledge-types";

type VectorRecord = { chunk: Chunk; vector: number[]; sourceName: string };
type IndexSnapshot = {
  revision: number;
  config: IndexConfig;
  generation: string;
  dimensions: number;
};
const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const secretKey = (generation: string) => `KNOWLEDGE_VECTOR_${generation}`;
const collection = (baseId: string, generation: string) =>
  `kb_${baseId.replaceAll("-", "")}_${generation.replaceAll("-", "")}`;
const pointId = (id: string) =>
  `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20, 32)}`;
function snapshot(baseId: string): IndexSnapshot | undefined {
  const row = knowledgeDb()
    .prepare("SELECT body FROM knowledge_indexes WHERE base_id=?")
    .get(baseId) as { body: string } | undefined;
  return row ? JSON.parse(row.body) : undefined;
}
function vectorHash(config: IndexConfig, chunk: Chunk) {
  return hash([
    config.embeddings.provider,
    config.embeddings.url,
    config.embeddings.model,
    chunk.pageContent,
  ]);
}
export function validateVectors(value: unknown, count: number): number[][] {
  if (
    !Array.isArray(value) ||
    value.length !== count ||
    !value.length ||
    value.some(
      (v) =>
        !Array.isArray(v) ||
        !v.length ||
        v.length > 65536 ||
        v.length !== value[0].length ||
        v.some((n: unknown) => typeof n !== "number" || !Number.isFinite(n)) ||
        v.every((n: number) => n === 0),
    )
  )
    throw new FlowError(
      "O serviço retornou embeddings inválidos ou incompletos.",
      502,
    );
  return value;
}
export async function embedKnowledge(
  config: IndexConfig["embeddings"],
  texts: string[],
  signal?: AbortSignal,
) {
  if (!texts.length) return [];
  if (config.provider === "openai") {
    if (!config.apiKey)
      throw new FlowError("Configure a chave do serviço de embeddings.");
    const response = await knowledgeJson<{
      data: { index: number; embedding: number[] }[];
    }>(`${config.url}/embeddings`, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.apiKey}` },
      body: { model: config.model, input: texts, encoding_format: "float" },
      infrastructure: true,
      signal,
    });
    if (
      !Array.isArray(response.data) ||
      response.data.length !== texts.length ||
      new Set(response.data.map((v) => v.index)).size !== texts.length ||
      response.data.some(
        (v) =>
          !Number.isInteger(v.index) || v.index < 0 || v.index >= texts.length,
      )
    )
      throw new FlowError(
        "O serviço de embeddings retornou posições inválidas.",
        502,
      );
    return validateVectors(
      response.data.sort((a, b) => a.index - b.index).map((d) => d.embedding),
      texts.length,
    );
  }
  const response = await knowledgeJson<{ embeddings: number[][] }>(
    `${config.url}/api/embed`,
    {
      method: "POST",
      headers: config.apiKey
        ? { Authorization: `Bearer ${config.apiKey}` }
        : {},
      body: { model: config.model, input: texts, truncate: false },
      infrastructure: true,
      signal,
    },
  );
  return validateVectors(response.embeddings, texts.length);
}
async function qdrant(
  config: IndexConfig["vectorStore"],
  path: string,
  method: string,
  body?: unknown,
  signal?: AbortSignal,
) {
  return knowledgeJson<{
    result?: { points?: { id: string; score: number }[] };
  }>(`${config.url}${path}`, {
    method,
    body,
    headers: config.apiKey ? { "api-key": config.apiKey } : {},
    signal,
    infrastructure: true,
  });
}
export async function processKnowledgeSource(baseId: string, sourceId: string) {
  return withKnowledgeLock(baseId, async (token) => {
    const { source, config, files } = getKnowledgeSourcePrivate(
      baseId,
      sourceId,
    );
    source.status = "processing";
    source.error = undefined;
    saveKnowledgeSourceRecord(source);
    try {
      const result = await extractKnowledge(
        source.loader,
        config,
        files,
        AbortSignal.timeout(600000),
      );
      const chunks = await splitDocuments(
        result.documents,
        source.id,
        source.splitter,
        source.metadata,
      );
      return {
        source: replaceKnowledgeChunks(baseId, sourceId, chunks, token),
        warnings: result.warnings,
        documents: result.documents.length,
        chunks: chunks.length,
      };
    } catch (error) {
      source.status = "failed";
      source.error =
        error instanceof FlowError
          ? error.message
          : "A extração falhou. Confira a fonte e tente novamente.";
      saveKnowledgeSourceRecord(source);
      throw new FlowError(
        source.error,
        error instanceof FlowError ? error.status : 502,
      );
    }
  });
}
async function cleanGeneration(baseId: string, generation: string) {
  const configText = getConfig(secretKey(generation));
  if (configText) {
    const config = JSON.parse(configText) as IndexConfig["vectorStore"];
    if (config.provider === "qdrant") {
      try {
        await qdrant(
          config,
          `/collections/${collection(baseId, generation)}`,
          "DELETE",
          undefined,
          AbortSignal.timeout(30000),
        );
      } catch (error) {
        if (
          !(error instanceof KnowledgeServiceError) ||
          error.upstreamStatus !== 404
        )
          throw error;
      }
    }
  }
  knowledgeDb()
    .prepare("DELETE FROM knowledge_vectors WHERE base_id=? AND generation=?")
    .run(baseId, generation);
  knowledgeDb()
    .prepare("DELETE FROM knowledge_cleanup WHERE id=? AND base_id=?")
    .run(generation, baseId);
  setConfig(secretKey(generation), null);
}
export async function cleanupKnowledge(baseId: string) {
  const active = snapshot(baseId)?.generation;
  const rows = knowledgeDb()
    .prepare("SELECT id FROM knowledge_cleanup WHERE base_id=?")
    .all(baseId) as { id: string }[];
  const failed: string[] = [];
  let attempted = 0;
  for (const row of rows)
    if (row.id !== active) {
      if (attempted++ >= 5) {
        failed.push(row.id);
        continue;
      }
      try {
        await cleanGeneration(baseId, row.id);
      } catch {
        failed.push(row.id);
      }
    }
  return { pending: failed.length };
}
export async function indexKnowledge(baseId: string) {
  return withKnowledgeLock(baseId, async () => {
    const base = getKnowledgeBase(baseId);
    const sources = listKnowledgeSources(baseId);
    const chunks = listKnowledgeChunks(baseId);
    if (!chunks.length || sources.some((s) => s.status !== "processed"))
      throw new FlowError("Extraia e revise todas as fontes antes de indexar.");
    const config = indexKnowledgeConfig(baseId);
    const previous = snapshot(baseId);
    const run: IndexRun = {
      id: randomUUID(),
      baseId,
      status: "running",
      startedAt: new Date().toISOString(),
      total: chunks.length,
      embedded: 0,
      reused: 0,
    };
    const generation = run.id;
    const signal = AbortSignal.timeout(600000);
    base.status = "indexing";
    base.error = undefined;
    saveKnowledgeBaseRecord(base);
    saveKnowledgeRun(run);
    const d = knowledgeDb();
    // Every staged generation is also a durable cleanup task, including abandoned jobs.
    d.prepare("INSERT INTO knowledge_cleanup VALUES(?,?,?)").run(
      generation,
      baseId,
      "{}",
    );
    try {
      const existing = new Map<string, number[]>();
      if (config.recordManager.provider === "sqlite" && previous) {
        for (const row of d
          .prepare(
            "SELECT hash,body FROM knowledge_vectors WHERE base_id=? AND generation=?",
          )
          .all(baseId, previous.generation) as { hash: string; body: string }[])
          existing.set(row.hash, (JSON.parse(row.body) as VectorRecord).vector);
      }
      const records: { hash: string; record: VectorRecord }[] = [];
      const pending = new Map<string, Chunk[]>();
      for (const chunk of chunks) {
        const key = vectorHash(config, chunk);
        const vector = existing.get(key);
        if (vector) {
          records.push({
            hash: key,
            record: {
              chunk,
              vector,
              sourceName: sources.find((s) => s.id === chunk.sourceId)!.name,
            },
          });
          run.reused++;
        } else {
          const group = pending.get(key) || [];
          group.push(chunk);
          pending.set(key, group);
        }
      }
      const entries = [...pending];
      for (let offset = 0; offset < entries.length; offset += 32) {
        const batch = entries.slice(offset, offset + 32);
        const vectors = await embedKnowledge(
          config.embeddings,
          batch.map(([, group]) => group[0].pageContent),
          signal,
        );
        for (let i = 0; i < batch.length; i++) {
          const [key, group] = batch[i];
          for (const chunk of group)
            records.push({
              hash: key,
              record: {
                chunk,
                vector: vectors[i],
                sourceName: sources.find((s) => s.id === chunk.sourceId)!.name,
              },
            });
          run.embedded++;
          run.reused += group.length - 1;
        }
        saveKnowledgeRun(run);
      }
      const dimensions = records[0].record.vector.length;
      if (records.some(({ record }) => record.vector.length !== dimensions))
        throw new FlowError(
          "O modelo retornou dimensões diferentes. Use outro modelo ou desative o reaproveitamento para reindexar.",
        );
      if (config.vectorStore.provider === "qdrant") {
        setConfig(secretKey(generation), JSON.stringify(config.vectorStore));
        await qdrant(
          config.vectorStore,
          `/collections/${collection(baseId, generation)}`,
          "PUT",
          { vectors: { size: dimensions, distance: "Cosine" } },
          signal,
        );
        for (let offset = 0; offset < records.length; offset += 64)
          await qdrant(
            config.vectorStore,
            `/collections/${collection(baseId, generation)}/points?wait=true`,
            "PUT",
            {
              points: records
                .slice(offset, offset + 64)
                .map(({ record }) => ({
                  id: pointId(record.chunk.id),
                  vector: record.vector,
                  payload: {
                    baseId,
                    sourceId: record.chunk.sourceId,
                    chunkId: record.chunk.id,
                  },
                })),
            },
            signal,
          );
      }
      signal.throwIfAborted();
      d.exec("BEGIN IMMEDIATE");
      try {
        const insert = d.prepare(
          "INSERT INTO knowledge_vectors VALUES(?,?,?,?,?)",
        );
        for (const record of records)
          insert.run(
            baseId,
            generation,
            record.record.chunk.id,
            record.hash,
            JSON.stringify(record.record),
          );
        const next: IndexSnapshot = {
          generation,
          revision: base.revision,
          config: base.config,
          dimensions,
        };
        d.prepare(
          "INSERT INTO knowledge_indexes VALUES(?,?,?) ON CONFLICT(base_id) DO UPDATE SET generation=excluded.generation,body=excluded.body",
        ).run(baseId, generation, JSON.stringify(next));
        base.status = "ready";
        base.indexedChunks = chunks.length;
        base.indexedRevision = base.revision;
        base.indexedAt = new Date().toISOString();
        base.updatedAt = base.indexedAt;
        run.status = "completed";
        run.finishedAt = base.indexedAt;
        saveKnowledgeBaseRecord(base);
        saveKnowledgeRun(run);
        d.exec("COMMIT");
      } catch (error) {
        d.exec("ROLLBACK");
        throw error;
      }
    } catch (error) {
      base.status = "failed";
      base.error =
        error instanceof FlowError
          ? error.message
          : "Não foi possível concluir a indexação. Confira os serviços e tente novamente.";
      run.status = "failed";
      run.error = base.error;
      run.finishedAt = new Date().toISOString();
      saveKnowledgeBaseRecord(base);
      saveKnowledgeRun(run);
      throw new FlowError(base.error, 502);
    } finally {
      // Failures are retained durably for retry, never reported as a successful cleanup.
      await cleanupKnowledge(baseId);
    }
    return { base: getKnowledgeBase(baseId), run };
  });
}
export function cosineSimilarity(a: number[], b: number[]) {
  if (a.length !== b.length)
    throw new FlowError("As dimensões do modelo mudaram. Reindexe a base.");
  let dot = 0,
    aa = 0,
    bb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    aa += a[i] ** 2;
    bb += b[i] ** 2;
  }
  return aa && bb ? dot / Math.sqrt(aa * bb) : 0;
}
export async function queryKnowledge(
  baseId: string,
  query: string,
  topK = 4,
  minScore = 0,
  signal?: AbortSignal,
): Promise<KnowledgeHit[]> {
  const base = getKnowledgeBase(baseId);
  const current = snapshot(baseId);
  if (base.status !== "ready" || !current || current.revision !== base.revision)
    throw new FlowError(
      `A base “${base.name}” precisa ser indexada antes de ser consultada.`,
    );
  if (
    typeof query !== "string" ||
    !query.trim() ||
    query.length > 20000 ||
    !Number.isInteger(topK) ||
    topK < 1 ||
    topK > 20 ||
    !Number.isFinite(minScore) ||
    minScore < -1 ||
    minScore > 1
  )
    throw new FlowError(
      "Informe uma consulta de até 20.000 caracteres, 1 a 20 resultados e pontuação entre -1 e 1.",
    );
  const config = indexKnowledgeConfig(baseId);
  const [vector] = await embedKnowledge(config.embeddings, [query], signal);
  if (vector.length !== current.dimensions)
    throw new FlowError("As dimensões do modelo mudaram. Reindexe a base.");
  let selected: { record: VectorRecord; score: number }[];
  if (config.vectorStore.provider === "qdrant") {
    const result = await qdrant(
      config.vectorStore,
      `/collections/${collection(baseId, current.generation)}/points/query`,
      "POST",
      {
        query: vector,
        limit: topK,
        score_threshold: minScore,
        with_payload: false,
        with_vector: false,
      },
      signal,
    );
    const records = new Map(
      (
        knowledgeDb()
          .prepare(
            "SELECT body FROM knowledge_vectors WHERE base_id=? AND generation=?",
          )
          .all(baseId, current.generation) as { body: string }[]
      ).map((r) => {
        const v = JSON.parse(r.body) as VectorRecord;
        return [pointId(v.chunk.id), v];
      }),
    );
    if (!Array.isArray(result.result?.points))
      throw new FlowError(
        "O Vector Store retornou uma resposta inválida.",
        502,
      );
    selected = result.result.points.flatMap((p) => {
      const record = records.get(String(p.id));
      return record && Number.isFinite(p.score) && p.score >= minScore
        ? [{ record, score: p.score }]
        : [];
    });
  } else
    selected = (
      knowledgeDb()
        .prepare(
          "SELECT body FROM knowledge_vectors WHERE base_id=? AND generation=?",
        )
        .all(baseId, current.generation) as { body: string }[]
    )
      .map((row) => {
        const record = JSON.parse(row.body) as VectorRecord;
        return { record, score: cosineSimilarity(vector, record.vector) };
      })
      .filter((r) => r.score >= minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  // A concurrent edit/index must not turn an old result into the current truth.
  if (
    getKnowledgeBase(baseId).revision !== base.revision ||
    snapshot(baseId)?.generation !== current.generation
  )
    throw new FlowError(
      "A base foi atualizada durante a consulta. Tente novamente.",
      409,
    );
  return selected.map(({ record, score }) => ({
    ...record.chunk,
    baseId,
    baseName: base.name,
    sourceName: record.sourceName,
    score,
  }));
}
export async function deleteKnowledgeBase(baseId: string) {
  return withKnowledgeLock(baseId, async (token) => {
    if (knowledgeBaseUsages(baseId).length)
      throw new FlowError(
        "Esta base está vinculada a um agente. Remova o vínculo nos fluxos antes de excluir.",
        409,
      );
    const base = getKnowledgeBase(baseId);
    base.status = base.chunks ? "dirty" : "empty";
    saveKnowledgeBaseRecord(base);
    const rows = knowledgeDb()
      .prepare("SELECT id FROM knowledge_cleanup WHERE base_id=?")
      .all(baseId) as { id: string }[];
    for (const row of rows) await cleanGeneration(baseId, row.id);
    deleteKnowledgeBaseRecords(baseId, token);
    return { ok: true };
  });
}
export async function removeKnowledgeSource(baseId: string, sourceId: string) {
  return withKnowledgeLock(baseId, async (token) => {
    getKnowledgeSourcePrivate(baseId, sourceId);
    const rows = knowledgeDb()
      .prepare(
        "SELECT generation,chunk_id FROM knowledge_vectors WHERE base_id=? AND json_extract(body,'$.chunk.sourceId')=?",
      )
      .all(baseId, sourceId) as { generation: string; chunk_id: string }[];
    for (const generation of new Set(rows.map((r) => r.generation))) {
      const text = getConfig(secretKey(generation));
      if (!text) continue;
      const config = JSON.parse(text) as IndexConfig["vectorStore"];
      if (config.provider === "qdrant")
        await qdrant(
          config,
          `/collections/${collection(baseId, generation)}/points/delete?wait=true`,
          "POST",
          {
            points: rows
              .filter((r) => r.generation === generation)
              .map((r) => pointId(r.chunk_id)),
          },
        );
    }
    deleteKnowledgeSource(baseId, sourceId, token);
    return { ok: true };
  });
}
