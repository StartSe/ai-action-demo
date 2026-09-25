import { FlowError } from "./flow-store";
import { knowledgeUrl } from "./knowledge-http";
import {
  EMBEDDING_PROVIDERS,
  VECTOR_PROVIDERS,
  SQL_VECTOR_PROVIDERS,
  VECTOR_OPTIONS,
} from "./knowledge-providers";
import type { IndexConfig } from "./knowledge-types";
export function sqlIdentifier(value: string) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/.test(value))
    throw new FlowError(
      "Use nomes de tabela e schema com letras, números e sublinhado (até 63 caracteres).",
    );
  return value;
}
function connection(value: string, protocols: string[]) {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new FlowError("Confira a string de conexão do banco de dados.");
  }
  if (
    !protocols.includes(parsed.protocol) ||
    !parsed.hostname ||
    !parsed.pathname.slice(1)
  )
    throw new FlowError(
      "A string de conexão precisa incluir servidor e banco de dados.",
    );
}
export function validatedIndexConfig(
  input: IndexConfig,
  previous: IndexConfig,
  originalSecrets: Record<string, string>,
) {
  const c = structuredClone(input),
    secrets = { ...originalSecrets };
  if (
    !c?.embeddings ||
    !c.vectorStore ||
    !c.recordManager ||
    !EMBEDDING_PROVIDERS.some((p) => p.id === c.embeddings.provider) ||
    !["local", ...VECTOR_PROVIDERS.map((p) => p.id)].includes(
      c.vectorStore.provider,
    ) ||
    !["none", "sqlite", "postgres"].includes(c.recordManager.provider)
  )
    throw new FlowError("Escolha configurações válidas de indexação.");
  if (
    typeof c.embeddings.model !== "string" ||
    !c.embeddings.model.trim() ||
    c.embeddings.model.length > 100 ||
    /[\r\n/?#]/.test(c.embeddings.model)
  )
    throw new FlowError("Escolha um modelo de embedding válido.");
  c.embeddings.model = c.embeddings.model.trim();
  for (const url of [c.embeddings.url, c.vectorStore.url])
    if (typeof url !== "string" || url.length > 2000)
      throw new FlowError("Confira os endereços dos serviços.");
  knowledgeUrl(c.embeddings.url);
  const remote = !["local", "faiss", ...SQL_VECTOR_PROVIDERS].includes(
    c.vectorStore.provider,
  );
  if (remote) knowledgeUrl(c.vectorStore.url);
  for (const [key, min, max, fallback] of [
    ["batchSize", 1, 100, 32],
    ["timeout", 1000, 600000, 120000],
  ] as const) {
    const value = c.embeddings[key] ?? fallback;
    if (!Number.isInteger(value) || value < min || value > max)
      throw new FlowError(
        `Use ${key === "batchSize" ? "lotes" : "tempo limite"} entre ${min} e ${max}.`,
      );
    c.embeddings[key] = value;
  }
  if (
    c.embeddings.stripNewLines !== undefined &&
    typeof c.embeddings.stripNewLines !== "boolean"
  )
    throw new FlowError("Escolha se deseja remover quebras de linha.");
  if (
    c.embeddings.provider !== previous.embeddings.provider ||
    knowledgeUrl(c.embeddings.url).origin !==
      knowledgeUrl(previous.embeddings.url).origin
  )
    delete secrets.embeddingKey;
  if (
    c.vectorStore.provider !== previous.vectorStore.provider ||
    c.vectorStore.url !== previous.vectorStore.url
  ) {
    delete secrets.vectorKey;
    delete secrets.vectorConnection;
  }
  if (c.recordManager.provider !== previous.recordManager.provider)
    delete secrets.recordConnection;
  for (const [key, value] of [
    ["embeddingKey", c.embeddings.apiKey],
    ["vectorKey", c.vectorStore.apiKey],
    ["vectorConnection", c.vectorStore.connectionString],
    ["recordConnection", c.recordManager.connectionString],
  ] as const) {
    if (
      value !== undefined &&
      (typeof value !== "string" || value.length > 12000)
    )
      throw new FlowError("Credencial inválida.");
    if (value?.trim()) secrets[key] = value.trim();
  }
  if (c.embeddings.provider !== "ollama" && !secrets.embeddingKey)
    throw new FlowError("Informe a chave do serviço de embeddings.");
  if (
    ["pinecone", "supabase"].includes(c.vectorStore.provider) &&
    !secrets.vectorKey
  )
    throw new FlowError("Informe a chave do banco vetorial.");
  if (SQL_VECTOR_PROVIDERS.includes(c.vectorStore.provider)) {
    if (!secrets.vectorConnection)
      throw new FlowError("Informe a conexão do banco vetorial.");
    connection(
      secrets.vectorConnection,
      c.vectorStore.provider === "mongodb"
        ? ["mongodb:", "mongodb+srv:"]
        : c.vectorStore.provider === "singlestore"
          ? ["mysql:"]
          : ["postgres:", "postgresql:"],
    );
  }
  if (c.recordManager.provider === "postgres") {
    if (!secrets.recordConnection)
      throw new FlowError("Informe a conexão do Record Manager.");
    connection(secrets.recordConnection, ["postgres:", "postgresql:"]);
  }
  const options: Record<string, string> = {};
  for (const field of VECTOR_OPTIONS[c.vectorStore.provider] || []) {
    const value = c.vectorStore.options?.[field.key];
    if (
      value !== undefined &&
      (typeof value !== "string" || value.length > 200)
    )
      throw new FlowError("Confira as opções do banco vetorial.");
    if (value?.trim()) options[field.key] = value.trim();
  }
  for (const key of ["schema", "tableName", "queryName"])
    if (options[key]) sqlIdentifier(options[key]);
  const namespace = c.recordManager.namespace || "agentflows";
  if (typeof namespace !== "string" || namespace.length > 100)
    throw new FlowError("Use um namespace de até 100 caracteres.");
  const config: IndexConfig = {
    embeddings: {
      provider: c.embeddings.provider,
      model: c.embeddings.model,
      url: c.embeddings.url.replace(/\/$/, ""),
      configured: !!secrets.embeddingKey,
      batchSize: c.embeddings.batchSize,
      timeout: c.embeddings.timeout,
      stripNewLines: !!c.embeddings.stripNewLines,
    },
    vectorStore: {
      provider: c.vectorStore.provider,
      url: remote ? c.vectorStore.url.replace(/\/$/, "") : "",
      configured: !!secrets.vectorKey,
      connectionConfigured: !!secrets.vectorConnection,
      options,
    },
    recordManager: {
      provider: c.recordManager.provider,
      configured: !!secrets.recordConnection,
      namespace,
      tableName: sqlIdentifier(
        c.recordManager.tableName || "agentflows_records",
      ),
    },
  };
  return { config, secrets };
}
