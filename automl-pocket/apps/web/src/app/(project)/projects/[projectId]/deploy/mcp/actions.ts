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

export type McpConfigInput = KeyDeploymentInput;

/**
 * Server actions do deployment MCP (US-047) — mesma mecânica de chave da API
 * (US-046), compartilhada em ../key-deployment-actions.ts.
 */

export async function saveMcpDeployment(
  projectId: string,
  input: McpConfigInput,
): Promise<{ error?: string }> {
  return saveKeyDeployment("mcp", projectId, input);
}

export async function publishMcpDeployment(
  projectId: string,
  input: McpConfigInput,
): Promise<{ error: string } | { apiKey: string; apiKeyPrefix: string }> {
  return publishKeyDeployment("mcp", projectId, input);
}

/** Compat: regenerar = rotacionar (a chave antiga fica válida por 24 h). */
export async function regenerateMcpKey(
  projectId: string,
): Promise<{ error: string } | RotateKeyResult> {
  return regenerateKeyDeployment("mcp", projectId);
}

/** Nova chave; a atual continua válida por 24 h (US-038). */
export async function rotateMcpKey(
  projectId: string,
): Promise<{ error: string } | RotateKeyResult> {
  return rotateKeyDeployment("mcp", projectId);
}

/** Revoga na hora a chave atual e a anterior; o deployment segue publicado. */
export async function revokeMcpKey(
  projectId: string,
): Promise<{ error?: string }> {
  return revokeKeyDeployment("mcp", projectId);
}

export async function unpublishMcpDeployment(
  projectId: string,
): Promise<{ error?: string }> {
  return unpublishKeyDeployment("mcp", projectId);
}
