import { Client } from "pg";
import { FlowError } from "./flow-store";
export async function withKnowledgePostgres<T>(
  connectionString: string,
  fn: (client: Client) => Promise<T>,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  const client = new Client({
    connectionString,
    connectionTimeoutMillis: 10000,
    query_timeout: 120000,
    statement_timeout: 120000,
  });
  const abort = () => {
    void client.end().catch(() => {});
  };
  signal?.addEventListener("abort", abort, { once: true });
  try {
    await client.connect();
    return await fn(client);
  } catch (error) {
    if (error instanceof FlowError) throw error;
    throw new FlowError(
      "Não foi possível acessar o PostgreSQL. Confira a conexão, as permissões e a extensão pgvector quando usada.",
      502,
    );
  } finally {
    signal?.removeEventListener("abort", abort);
    await client.end().catch(() => {});
  }
}
