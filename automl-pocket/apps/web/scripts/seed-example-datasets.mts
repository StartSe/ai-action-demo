// Backfill manual dos datasets de exemplo: percorre todas as organizações e
// provisiona as 3 bases de apps/web/seed-assets/ via backfillExampleDatasets —
// mesmo pipeline do signup, então organizações que já têm os exemplos são
// puladas (idempotente: rodar duas vezes não duplica nada).
//
// Em produção o backfill roda sozinho no boot do servidor (src/instrumentation.ts);
// este script existe para execução avulsa em dev/staging.
//
// Uso: npm run seed:examples (em apps/web), com SQLITE_PATH, REDIS_URL e
// UPLOAD_DIR apontando para o ambiente alvo (sem SQLITE_PATH o app abre
// ./data/pocket.db). Roda com tsx, que resolve o alias @/ do tsconfig — por
// isso o script pode reusar o código do app.

import { backfillExampleDatasets } from "@/lib/example-datasets";

async function main() {
  const totals = await backfillExampleDatasets();

  console.log(`[seed-examples] Organizações processadas: ${totals.orgs}`);
  console.log(
    `[seed-examples] Datasets criados: ${totals.created}, pulados: ${totals.skipped}, falhas: ${totals.failed}`,
  );

  // O cliente libsql e a conexão do BullMQ/ioredis mantêm o event loop vivo;
  // todos os awaits já concluíram, então encerrar aqui é seguro
  process.exit(totals.failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error("[seed-examples] Erro no backfill:", error);
  process.exit(1);
});
