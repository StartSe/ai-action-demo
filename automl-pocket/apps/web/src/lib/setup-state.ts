import "server-only";

import { getDb } from "@/db";
import { users } from "@/db/schema";

/**
 * "Já existe conta neste Pocket?" — decisão do primeiro acesso (PRD
 * "primeiro acesso e envs", US-002/US-003). Consulta o banco a CADA chamada,
 * sem cache de módulo: a resposta muda exatamente uma vez na vida da
 * instância (quando `completeSetup` cria a conta) e um cache velho mandaria a
 * pessoa recém-cadastrada de volta para /setup. Só server components, Server
 * Actions e hooks do Better Auth chamam isto — nunca o proxy edge, que não
 * abre SQLite.
 */
export async function hasAccount(): Promise<boolean> {
  const [row] = await getDb().select({ id: users.id }).from(users).limit(1);
  return row !== undefined;
}
