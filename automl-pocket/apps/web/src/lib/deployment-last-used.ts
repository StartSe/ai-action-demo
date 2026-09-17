import { eq, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { deployments } from "@/db/schema";
import { getRedisConnection } from "@/lib/queue";

/**
 * Último uso da chave de um deployment (US-038): `last_used_at`/`last_used_ip`
 * alimentam a linha "Último uso" da tela do deploy. Chamado pelas rotas
 * `/api/v1/predict` e `/api/mcp` depois de uma predição bem-sucedida.
 *
 * Throttle: no máximo 1 UPDATE por minuto por deployment. A reserva é um
 * `SET NX EX 60` no Redis (`deployment:last-used:<id>`); quem consegue gravar
 * a chave faz o UPDATE, os demais requests do minuto não tocam o banco.
 * Redis fora → grava assim mesmo (fail-open, como o rate limit: o UPDATE é
 * do tamanho do INSERT de auditoria que a rota já faz por request).
 */

export const LAST_USED_THROTTLE_SEC = 60;

/** Subconjunto do ioredis usado pelo throttle — permite store fake nos testes. */
export type LastUsedStore = {
  set(
    key: string,
    value: string,
    mode: "EX",
    ttlSec: number,
    flag: "NX",
  ): Promise<unknown>;
};

export type TouchDeploymentLastUsedDeps = {
  store?: LastUsedStore;
  /** UPDATE de fato (drizzle em produção). */
  persist?(deploymentId: string, ip: string | null, at: Date): Promise<void>;
  now?(): Date;
};

function lastUsedKey(deploymentId: string): string {
  return `deployment:last-used:${deploymentId}`;
}

/**
 * Reserva o slot do minuto para o deployment. true = este request grava;
 * false = outro request já gravou neste minuto. Redis indisponível = true.
 */
export async function claimLastUsedSlot(
  deploymentId: string,
  store?: LastUsedStore,
): Promise<boolean> {
  const redis = store ?? (getRedisConnection() as unknown as LastUsedStore);
  try {
    const result = await redis.set(
      lastUsedKey(deploymentId),
      "1",
      "EX",
      LAST_USED_THROTTLE_SEC,
      "NX",
    );
    return result === "OK";
  } catch (error) {
    console.error("Throttle de último uso indisponível (fail-open):", error);
    return true;
  }
}

async function persistLastUsed(
  deploymentId: string,
  ip: string | null,
  at: Date,
): Promise<void> {
  await getDb()
    .update(deployments)
    .set({
      lastUsedAt: at,
      lastUsedIp: ip,
      // Uso não é edição: preserva updated_at (senão o $onUpdate o tocaria)
      updatedAt: sql`${deployments.updatedAt}`,
    })
    .where(eq(deployments.id, deploymentId));
}

/**
 * Registra o último uso da chave, respeitando o throttle. Nunca lança: uma
 * falha aqui não pode transformar uma predição bem-sucedida em erro.
 * Devolve true quando gravou (útil nos testes).
 */
export async function touchDeploymentLastUsed(
  deploymentId: string,
  ip: string | null,
  deps: TouchDeploymentLastUsedDeps = {},
): Promise<boolean> {
  try {
    const claimed = await claimLastUsedSlot(deploymentId, deps.store);
    if (!claimed) return false;
    const persist = deps.persist ?? persistLastUsed;
    await persist(deploymentId, ip, (deps.now ?? (() => new Date()))());
    return true;
  } catch (error) {
    console.error("Falha ao registrar último uso do deployment:", error);
    return false;
  }
}
