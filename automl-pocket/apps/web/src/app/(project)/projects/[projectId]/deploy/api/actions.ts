"use server";

import {
  publishKeyDeployment,
  regenerateKeyDeployment,
  revokeKeyDeployment,
  rotateKeyDeployment,
  saveKeyDeployment,
  unpublishKeyDeployment,
  type KeyDeploymentInput,
  type RotateKeyResult,
} from "../key-deployment-actions";

export type ApiConfigInput = KeyDeploymentInput;

/**
 * Server actions do deployment de API (US-046) — wrappers da mecânica
 * compartilhada com o MCP em ../key-deployment-actions.ts.
 */

export async function saveApiDeployment(
  projectId: string,
  input: ApiConfigInput,
): Promise<{ error?: string }> {
  return saveKeyDeployment("api", projectId, input);
}

export async function publishApiDeployment(
  projectId: string,
  input: ApiConfigInput,
): Promise<{ error: string } | { apiKey: string; apiKeyPrefix: string }> {
  return publishKeyDeployment("api", projectId, input);
}

/** Compat: regenerar = rotacionar (a chave antiga fica válida por 24 h). */
export async function regenerateApiKey(
  projectId: string,
): Promise<{ error: string } | RotateKeyResult> {
  return regenerateKeyDeployment("api", projectId);
}

/** Nova chave; a atual continua válida por 24 h (US-038). */
export async function rotateApiKey(
  projectId: string,
): Promise<{ error: string } | RotateKeyResult> {
  return rotateKeyDeployment("api", projectId);
}

/** Revoga na hora a chave atual e a anterior; o deployment segue publicado. */
export async function revokeApiKey(
  projectId: string,
): Promise<{ error?: string }> {
  return revokeKeyDeployment("api", projectId);
}

export async function unpublishApiDeployment(
  projectId: string,
): Promise<{ error?: string }> {
  return unpublishKeyDeployment("api", projectId);
}
