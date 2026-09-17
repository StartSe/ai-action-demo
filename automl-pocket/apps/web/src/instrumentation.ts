// Roda uma vez por boot do servidor Next (runtime Node). Rede de segurança do
// primeiro acesso (/setup, lib/setup-complete.ts): se o seed do dataset de
// exemplo não completou quando a conta foi criada (ex.: Redis indisponível ou
// timeout na Server Action), este backfill tenta de novo aqui. Idempotente por
// nome de arquivo; fire-and-forget para não atrasar o boot.
//
// Sem advisory lock (Pocket é instância única — nunca há uma réplica
// concorrente disputando o mesmo arquivo SQLite; o advisory lock da versão
// multi-réplica existia só por causa disso).

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // Kill-switch operacional; o backfill roda por padrão
  if (process.env.SEED_EXAMPLES_ON_BOOT === "0") return;

  void runBackfill().catch((error) => {
    console.error("[seed-examples] Backfill no boot falhou:", error);
  });
}

async function runBackfill() {
  // Import dinâmico: instrumentation também é avaliado no bundle edge do
  // proxy, onde código Node (fs, libsql) não pode entrar no grafo estático
  const { backfillExampleDatasets } = await import("@/lib/example-datasets");

  const totals = await backfillExampleDatasets();
  if (totals.created > 0 || totals.failed > 0) {
    console.log(
      `[seed-examples] Boot: orgs=${totals.orgs} criados=${totals.created} ` +
        `pulados=${totals.skipped} falhas=${totals.failed}`,
    );
  }
}
