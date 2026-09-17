import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import { mkdirSync } from "node:fs";
import path from "node:path";
import * as schema from "./schema";

// libsql (não better-sqlite3): o driver do better-sqlite3 só aceita
// `db.transaction((tx) => { ... })` SÍNCRONO, e o código tem transações
// assíncronas ((app)/datasets/actions.ts, prepare/actions.ts) que dependem de
// `await` dentro da callback — só um driver assíncrono suporta isso.

function sqlitePath(): string {
  return process.env.SQLITE_PATH ?? "./data/pocket.db";
}

// Client singleton — sobrevive ao hot reload do next dev sem reabrir o arquivo
const globalForDb = globalThis as unknown as {
  dbClient?: Client;
};

function getClient(): Client {
  if (!globalForDb.dbClient) {
    const filePath = sqlitePath();
    mkdirSync(path.dirname(filePath), { recursive: true });
    globalForDb.dbClient = createClient({ url: `file:${filePath}` });
    for (const pragma of [
      "PRAGMA journal_mode = WAL",
      "PRAGMA busy_timeout = 5000",
      "PRAGMA foreign_keys = ON",
      "PRAGMA synchronous = NORMAL",
    ]) {
      void globalForDb.dbClient.execute(pragma);
    }
  }
  return globalForDb.dbClient;
}

let cachedDb: LibSQLDatabase<typeof schema> | undefined;

export function getDb(): LibSQLDatabase<typeof schema> {
  if (!cachedDb) {
    cachedDb = drizzle(getClient(), { schema });
  }
  return cachedDb;
}

export * as dbSchema from "./schema";
