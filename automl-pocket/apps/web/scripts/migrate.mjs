// Aplica as migrations do Drizzle no deploy, antes de iniciar o servidor.
//
// Instância única (Pocket): sem advisory lock — não há réplicas concorrentes
// disputando o mesmo arquivo SQLite.
//
// Só @libsql/client, NADA de drizzle-orm: este script roda com `node` puro
// dentro do runner do Dockerfile, cujo node_modules é o de .next/standalone —
// o Next embute drizzle-orm nos chunks das rotas em vez de mantê-lo como
// pacote, então `import "drizzle-orm/libsql/migrator"` falha em produção com
// ERR_MODULE_NOT_FOUND (só @libsql/client sobrevive, por ter binário nativo).
// A lógica abaixo replica o migrator oficial (drizzle-orm/libsql/migrator):
// mesma tabela de controle `__drizzle_migrations` (id/hash/created_at), mesmo
// critério "aplica o que tem `when` maior que o último created_at", mesmo
// hash sha256 do arquivo e mesmo split em `--> statement-breakpoint` — um
// banco migrado por `drizzle-kit migrate` em dev e um migrado por este script
// ficam idênticos e intercambiáveis.

import { createClient } from "@libsql/client";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MIGRATIONS_TABLE = "__drizzle_migrations";
const STATEMENT_BREAKPOINT = "--> statement-breakpoint";

const migrationsFolder = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "drizzle",
);

function readMigrationFiles(folder) {
  const journalPath = path.join(folder, "meta", "_journal.json");
  const journal = JSON.parse(readFileSync(journalPath, "utf8"));
  return journal.entries.map((entry) => {
    const query = readFileSync(path.join(folder, `${entry.tag}.sql`), "utf8");
    return {
      tag: entry.tag,
      folderMillis: entry.when,
      hash: createHash("sha256").update(query).digest("hex"),
      statements: query.split(STATEMENT_BREAKPOINT),
    };
  });
}

async function main() {
  const sqlitePath = process.env.SQLITE_PATH ?? "./data/pocket.db";
  mkdirSync(path.dirname(sqlitePath), { recursive: true });

  const client = createClient({ url: `file:${sqlitePath}` });
  try {
    await client.execute(
      `CREATE TABLE IF NOT EXISTS "${MIGRATIONS_TABLE}" (
        id SERIAL PRIMARY KEY,
        hash text NOT NULL,
        created_at numeric
      )`,
    );
    const last = await client.execute(
      `SELECT id, hash, created_at FROM "${MIGRATIONS_TABLE}" ORDER BY created_at DESC LIMIT 1`,
    );
    const lastCreatedAt = last.rows[0]
      ? Number(last.rows[0].created_at)
      : undefined;

    const pending = readMigrationFiles(migrationsFolder).filter(
      (migration) =>
        lastCreatedAt === undefined || lastCreatedAt < migration.folderMillis,
    );

    if (pending.length === 0) {
      console.log("[migrate] Nenhuma migration pendente");
      return;
    }

    const batch = [];
    for (const migration of pending) {
      for (const statement of migration.statements) {
        if (statement.trim()) batch.push(statement);
      }
      batch.push({
        sql: `INSERT INTO "${MIGRATIONS_TABLE}" ("hash", "created_at") VALUES (?, ?)`,
        args: [migration.hash, migration.folderMillis],
      });
    }
    // Uma transação para tudo: ou o deploy migra inteiro ou não migra nada
    await client.batch(batch, "write");
    console.log(
      `[migrate] Migrations aplicadas: ${pending.map((m) => m.tag).join(", ")}`,
    );
  } finally {
    client.close();
  }
}

main().catch((error) => {
  console.error("[migrate] Erro ao aplicar migrations:", error);
  process.exit(1);
});
