import type { GeneratedApiKey } from "@/lib/api-keys";

/**
 * Regras puras da rotação e revogação da chave de um deployment (US-038),
 * sem banco nem Redis — `deployments.ts` e `key-deployment-actions.ts` só
 * aplicam o resultado. Testes em `__tests__/api-key-rotation.test.ts`.
 *
 * - Rotacionar: a chave atual vira `previous_api_key_hash` com validade de
 *   24 h (`ROTATION_GRACE_MS`); a nova entra em `api_key_hash`. Só UMA chave
 *   anterior é guardada: rotacionar de novo dentro da graça encerra a mais
 *   antiga na hora.
 * - Revogar: zera a atual E a anterior; o deployment continua publicado, mas
 *   nenhuma chave autentica até uma nova rotação.
 * - Autenticar: o hash apresentado casa com a atual, ou com a anterior
 *   enquanto `previous_key_expires_at` está no futuro.
 */

/** Graça da chave anterior após a rotação: 24 h. */
export const ROTATION_GRACE_MS = 24 * 60 * 60 * 1000;

/** Colunas de chave de um deployment que a autenticação consulta. */
export type DeploymentKeyColumns = {
  apiKeyHash: string | null;
  apiKeyPrefix: string | null;
  previousApiKeyHash: string | null;
  previousKeyExpiresAt: Date | null;
};

/** Qual chave autenticou a requisição. */
export type ApiKeyMatch = "current" | "previous";

/**
 * Decide se `keyHash` autentica o deployment: "current" para a chave vigente,
 * "previous" para a anterior ainda dentro da graça, null para nenhuma (inclui
 * deployment revogado, com os dois hashes nulos).
 */
export function matchApiKeyHash(
  row: Pick<
    DeploymentKeyColumns,
    "apiKeyHash" | "previousApiKeyHash" | "previousKeyExpiresAt"
  >,
  keyHash: string,
  now: Date = new Date(),
): ApiKeyMatch | null {
  if (row.apiKeyHash !== null && row.apiKeyHash === keyHash) return "current";
  if (
    row.previousApiKeyHash !== null &&
    row.previousApiKeyHash === keyHash &&
    row.previousKeyExpiresAt !== null &&
    row.previousKeyExpiresAt.getTime() > now.getTime()
  ) {
    return "previous";
  }
  return null;
}

/**
 * Valores a gravar ao rotacionar: a chave nova entra como atual e a atual
 * (se existir — um deployment revogado não tem o que manter) vira anterior
 * com expiração em `now + ROTATION_GRACE_MS`.
 */
export function rotateKeyValues(
  current: Pick<DeploymentKeyColumns, "apiKeyHash">,
  generated: GeneratedApiKey,
  now: Date = new Date(),
): DeploymentKeyColumns {
  const hadKey = current.apiKeyHash !== null;
  return {
    apiKeyHash: generated.hash,
    apiKeyPrefix: generated.prefix,
    previousApiKeyHash: hadKey ? current.apiKeyHash : null,
    previousKeyExpiresAt: hadKey
      ? new Date(now.getTime() + ROTATION_GRACE_MS)
      : null,
  };
}

/** Valores a gravar ao revogar (ou despublicar): nenhuma chave autentica. */
export const REVOKED_KEY_VALUES: DeploymentKeyColumns = {
  apiKeyHash: null,
  apiKeyPrefix: null,
  previousApiKeyHash: null,
  previousKeyExpiresAt: null,
};

/** Um deployment sem chave atual nem anterior não tem o que revogar. */
export function hasAnyKey(
  row: Pick<DeploymentKeyColumns, "apiKeyHash" | "previousApiKeyHash">,
): boolean {
  return row.apiKeyHash !== null || row.previousApiKeyHash !== null;
}
