import {
  integer,
  sqliteTable,
  text,
  uniqueIndex,
  type AnySQLiteColumn,
} from "drizzle-orm/sqlite-core";

// Listas de domínio (sem enum nativo no SQLite — validação em TS; o worker
// grava a string diretamente).
export const DATASET_FORMATS = ["csv", "xlsx", "json"] as const;
export type DatasetFormat = (typeof DATASET_FORMATS)[number];

// Ciclo de vida do dataset: uploading → parsing → (needs_review) → profiling
// → ready; "error" é reservado a falhas do parse. "needs_review" (US-023) é a
// pausa para o usuário confirmar abas/cabeçalho/orientação quando o
// diagnóstico de layout do worker pede revisão (LAYOUT_REVIEW_ENABLED).
export const DATASET_STATUSES = [
  "uploading",
  "parsing",
  "needs_review",
  "profiling",
  "ready",
  "error",
] as const;
export type DatasetStatus = (typeof DATASET_STATUSES)[number];

export const COLUMN_TYPES = [
  "number",
  "category",
  "text",
  "date",
  "id",
] as const;
export type ColumnType = (typeof COLUMN_TYPES)[number];

export const DATASET_VERSION_KINDS = [
  "original",
  "clean",
  "type_change",
] as const;
export type DatasetVersionKind = (typeof DATASET_VERSION_KINDS)[number];

export const DEPLOYMENT_TYPES = ["web_app", "api", "mcp"] as const;
export type DeploymentType = (typeof DEPLOYMENT_TYPES)[number];

export const DEPLOYMENT_STATUSES = ["draft", "published"] as const;
export type DeploymentStatus = (typeof DEPLOYMENT_STATUSES)[number];

export const TRAINING_JOB_STATUSES = [
  "queued",
  "running",
  "succeeded",
  "failed",
] as const;
export type TrainingJobStatus = (typeof TRAINING_JOB_STATUSES)[number];

export const PROBLEM_TYPES = [
  "classification",
  "regression",
  "forecasting",
] as const;
export type ProblemType = (typeof PROBLEM_TYPES)[number];

// Colunas comuns a todas as tabelas. Epoch ms (não string ISO): o driver
// libsql grava/lê `integer` como número, e `Date` no TS nos dois lados.
const timestamps = {
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date())
    .$onUpdate(() => new Date()),
};

// PK padrão: uuid gerado em TS (o worker gera com `str(uuid4())` no insert).
function id() {
  return text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());
}

export const organizations = sqliteTable("organizations", {
  id: id(),
  name: text("name").notNull(),
  ...timestamps,
});

export const users = sqliteTable("users", {
  id: id(),
  // Organization pessoal do usuário, criada automaticamente no cadastro (US-004)
  orgId: text("org_id")
    .notNull()
    .references(() => organizations.id),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" })
    .notNull()
    .default(false),
  image: text("image"),
  ...timestamps,
});

// --- Tabelas do Better Auth (US-004) ---------------------------------------
// O hash de senha (bcrypt) fica em accounts.password, na conta com
// provider_id = "credential"; contas Google ficam na mesma tabela.

export const sessions = sqliteTable("sessions", {
  id: id(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  ...timestamps,
});

export const accounts = sqliteTable(
  "accounts",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // Emissor da conta: "credential" para email/senha, URL do OIDC para Google
    issuer: text("issuer").notNull(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: integer("access_token_expires_at", {
      mode: "timestamp_ms",
    }),
    refreshTokenExpiresAt: integer("refresh_token_expires_at", {
      mode: "timestamp_ms",
    }),
    scope: text("scope"),
    password: text("password"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("accounts_issuer_account_id_idx").on(
      table.issuer,
      table.accountId,
    ),
  ],
);

export const verifications = sqliteTable("verifications", {
  id: id(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  ...timestamps,
});

export const projects = sqliteTable("projects", {
  id: id(),
  orgId: text("org_id")
    .notNull()
    .references(() => organizations.id),
  createdBy: text("created_by").references(() => users.id),
  name: text("name").notNull(),
  datasetId: text("dataset_id").references((): AnySQLiteColumn => datasets.id),
  archivedAt: integer("archived_at", { mode: "timestamp_ms" }),
  // Problema de negócio em texto livre (US-029, até PROBLEM_DESCRIPTION_MAX_LENGTH
  // chars — validado em lib/project-problem.ts)
  problemDescription: text("problem_description"),
  ...timestamps,
});

export const datasets = sqliteTable("datasets", {
  id: id(),
  orgId: text("org_id")
    .notNull()
    .references(() => organizations.id),
  createdBy: text("created_by").references(() => users.id),
  fileName: text("file_name").notNull(),
  format: text("format", { enum: DATASET_FORMATS }).notNull(),
  rowCount: integer("row_count"),
  columnCount: integer("column_count"),
  status: text("status", { enum: DATASET_STATUSES })
    .notNull()
    .default("uploading"),
  filePath: text("file_path").notNull(),
  parquetPath: text("parquet_path"),
  // Bytes no volume atribuídos ao dataset: arquivo original + parquets
  // (original e versões), base da quota de armazenamento (US-007/US-008);
  // linhas antigas com null contam como 0 (sem backfill)
  sizeBytes: integer("size_bytes"),
  // Amostra das primeiras linhas para preview (US-009 grava até 500 linhas)
  sample: text("sample", { mode: "json" }),
  // Versão ativa das transformações do Prepare; nulo = original (sem backfill)
  currentVersionId: text("current_version_id").references(
    (): AnySQLiteColumn => datasetVersions.id,
  ),
  errorMessage: text("error_message"),
  // Falha recuperável da última transformação (B10a): o dataset segue ready e
  // o Prepare mostra a mensagem em banner; limpo ao enfileirar nova transformação
  lastTransformError: text("last_transform_error"),
  // Diagnóstico determinístico de layout do worker (diagnose_layout): abas,
  // linha do cabeçalho, orientação e grupos por schema. Gravado sempre pelo
  // dataset:parse; null em datasets anteriores à US-023
  layoutDiagnosis: text("layout_diagnosis", {
    mode: "json",
  }).$type<LayoutDiagnosis>(),
  // Escolhas do usuário na tela "Revisar planilha", aplicadas pelo parse;
  // null = parse automático (comportamento anterior)
  parseOptions: text("parse_options", {
    mode: "json",
  }).$type<DatasetParseOptions>(),
  // Dataset de exemplo provisionado pela plataforma (seed-assets); não conta
  // na quota de armazenamento do usuário
  isExample: integer("is_example", { mode: "boolean" })
    .notNull()
    .default(false),
  ...timestamps,
});

// Shape produzido por apps/worker/jobs/layout.py (diagnose_layout) — manter
// os dois lados em sincronia ao mudar campos.
export type LayoutDiagnosisSheet = {
  name: string;
  /** Linhas com dados na amostra do worker (não é o total do arquivo). */
  rowCount: number;
  colCount: number;
  /** Índice 0-based da linha física do cabeçalho. */
  headerRow: number;
  orientation: "horizontal" | "transposed";
  /** Nomes de coluna normalizados e ordenados (base dos grupos). */
  schemaFingerprint: string[];
  preview: string[][];
};

// Avisos de estrutura ruim gravados pelo dataset:profile
// (apps/worker/jobs/dataset_profile.py::layout_warnings) — manter em sincronia.
export const LAYOUT_WARNINGS = [
  "unnamed_columns",
  "mostly_empty_columns",
] as const;
export type LayoutWarning = (typeof LAYOUT_WARNINGS)[number];

export type LayoutDiagnosis = {
  sheets: LayoutDiagnosisSheet[];
  /** Abas agrupadas por fingerprint igual (só abas do mesmo grupo combinam). */
  groups: { sheets: string[]; fingerprint: string[] }[];
  needsReview: boolean;
  /** Mais abas com dados do que o limite do diagnóstico. */
  truncated: boolean;
  /**
   * Preenchido depois do profiling (US-028): ≥ 30% das colunas sem nome
   * ("Unnamed…") ou quase vazias. Ausente em diagnósticos anteriores ao
   * profiling; vazio quando a estrutura está boa. Não muda o status.
   */
  warnings?: LayoutWarning[];
};

// Opções que o parse do worker aplica (parsing.read_dataset_file).
export type DatasetParseOptions = {
  sheets: string[];
  combine: boolean;
  headerRow: number;
  transpose: boolean;
};

// Versões imutáveis do dataset criadas por transformações do Prepare (US-035).
// Cada versão aponta para um novo parquet; a anterior nunca é sobrescrita.
export const datasetVersions = sqliteTable("dataset_versions", {
  id: id(),
  orgId: text("org_id")
    .notNull()
    .references(() => organizations.id),
  datasetId: text("dataset_id")
    .notNull()
    .references(() => datasets.id, { onDelete: "cascade" }),
  // Versão anterior no histórico linear; nulo = filha da original implícita
  parentVersionId: text("parent_version_id").references(
    (): AnySQLiteColumn => datasetVersions.id,
  ),
  kind: text("kind", { enum: DATASET_VERSION_KINDS }).notNull(),
  // Texto do chip no cabeçalho do Prepare (ex.: "Limpeza de dados")
  label: text("label").notNull(),
  // Parâmetros da transformação (operações do clean ou { column, newType, convertedNulls })
  params: text("params", { mode: "json" }),
  parquetPath: text("parquet_path").notNull(),
  rowCount: integer("row_count"),
  columnCount: integer("column_count"),
  // Snapshot de dataset_columns ({ name, type, position, stats, correlations }[])
  // usado só para restaurar a grade no desfazer
  columnsSnapshot: text("columns_snapshot", { mode: "json" }),
  ...timestamps,
});

export const datasetColumns = sqliteTable("dataset_columns", {
  id: id(),
  orgId: text("org_id")
    .notNull()
    .references(() => organizations.id),
  datasetId: text("dataset_id")
    .notNull()
    .references(() => datasets.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  type: text("type", { enum: COLUMN_TYPES }).notNull(),
  // Posição original da coluna no arquivo, para preservar a ordem na grade
  position: integer("position").notNull().default(0),
  stats: text("stats", { mode: "json" }),
  correlations: text("correlations", { mode: "json" }),
  ...timestamps,
});

export const trainingJobs = sqliteTable("training_jobs", {
  id: id(),
  orgId: text("org_id")
    .notNull()
    .references(() => organizations.id),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  datasetId: text("dataset_id")
    .notNull()
    .references(() => datasets.id),
  status: text("status", { enum: TRAINING_JOB_STATUSES })
    .notNull()
    .default("queued"),
  progress: integer("progress").notNull().default(0),
  progressStep: text("progress_step"),
  // { target, ignoredColumns, mode, timeColumn?, problemType }
  config: text("config", { mode: "json" }).notNull(),
  // Estado por candidato durante o treino (US-019):
  // { metricName, items: [{ algorithm, label, status, metric }] }
  candidates: text("candidates", { mode: "json" }),
  errorMessage: text("error_message"),
  ...timestamps,
});

// Snapshot gravado por deleteDataset ANTES de apagar os training_jobs do
// dataset: config do job na íntegra + campos de deploy derivados das
// dataset_columns. Torna o modelo autossuficiente após a exclusão do dataset.
// deployFields espelha DeploymentFormField (components/deployment-form.tsx) —
// o schema não importa de componentes para não acoplar o drizzle-kit à UI.
export type ModelTrainingSnapshot = {
  config: Record<string, unknown>;
  deployFields: {
    name: string;
    type: "number" | "category" | "text" | "date" | "id";
    categories: string[];
  }[];
};

export const models = sqliteTable("models", {
  id: id(),
  orgId: text("org_id")
    .notNull()
    .references(() => organizations.id),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  trainingJobId: text("training_job_id").references(() => trainingJobs.id),
  problemType: text("problem_type", { enum: PROBLEM_TYPES }).notNull(),
  // Alvo e colunas ignoradas do treino que gerou o modelo (US-003).
  // target nulo = modelo antigo sem job rastreável ("sem alvo conhecido" na UI).
  target: text("target"),
  ignoredColumns: text("ignored_columns", { mode: "json" }),
  winningAlgorithm: text("winning_algorithm"),
  metrics: text("metrics", { mode: "json" }),
  insights: text("insights", { mode: "json" }),
  // Nulo até o dataset de treino ser excluído; linhas antigas cujo dataset já
  // foi excluído antes desta coluna ficam null (sem backfill)
  trainingSnapshot: text("training_snapshot", {
    mode: "json",
  }).$type<ModelTrainingSnapshot>(),
  artifactPath: text("artifact_path"),
  // Tamanho do artefato .joblib no volume, base da quota de armazenamento
  // (US-007/US-008); linhas antigas com null contam como 0 (sem backfill)
  sizeBytes: integer("size_bytes"),
  ...timestamps,
});

// Endpoints de implantação do modelo (US-041): um por tipo por projeto.
// O deployment sempre usa o modelo mais recente do projeto; model_id registra
// o modelo vigente na configuração.
export const deployments = sqliteTable(
  "deployments",
  {
    id: id(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    modelId: text("model_id")
      .notNull()
      .references(() => models.id, { onDelete: "cascade" }),
    type: text("type", { enum: DEPLOYMENT_TYPES }).notNull(),
    status: text("status", { enum: DEPLOYMENT_STATUSES })
      .notNull()
      .default("draft"),
    title: text("title").notNull(),
    description: text("description"),
    // Colunas do modelo selecionadas para o formulário/schema (string[])
    fields: text("fields", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .default([]),
    // Slug secreto da URL pública do Web App; nulo quando despublicado
    publicSlug: text("public_slug").unique(),
    // Chave de API: só o SHA-256 fica no banco; prefixo p/ identificação na UI.
    // Publicado com api_key_hash nulo = chave revogada (US-038): o endpoint
    // recusa tudo até a usuária rotacionar (gerar) uma chave nova.
    apiKeyHash: text("api_key_hash"),
    apiKeyPrefix: text("api_key_prefix"),
    // Rotação com graça (US-038): a chave anterior continua válida até
    // previous_key_expires_at (24 h); depois só o hash atual autentica.
    previousApiKeyHash: text("previous_api_key_hash"),
    previousKeyExpiresAt: integer("previous_key_expires_at", {
      mode: "timestamp_ms",
    }),
    // Último uso bem-sucedido da chave (throttle de 1 UPDATE/min via Redis)
    lastUsedAt: integer("last_used_at", { mode: "timestamp_ms" }),
    lastUsedIp: text("last_used_ip"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("deployments_project_type_idx").on(table.projectId, table.type),
  ],
);

export const auditLogs = sqliteTable("audit_logs", {
  id: id(),
  // Nulo apenas em eventos sem org conhecida (ex.: falha de login de email inexistente)
  orgId: text("org_id").references(() => organizations.id),
  // SET NULL: excluir usuário anonimiza o histórico em vez de bloquear/apagar
  userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  resourceType: text("resource_type"),
  resourceId: text("resource_id"),
  ip: text("ip"),
  userAgent: text("user_agent"),
  metadata: text("metadata", { mode: "json" }),
  ...timestamps,
});
