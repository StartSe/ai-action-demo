import { createHash, randomBytes } from "node:crypto";

/**
 * Chave de API dos deployments (US-046): o banco guarda apenas o SHA-256
 * (api_key_hash) e o prefixo de identificação (api_key_prefix) — a chave em
 * claro aparece uma única vez, na resposta do publish/rotate.
 *
 * Formato (US-038): `dos_live_` + 32 bytes aleatórios em base64url (43 chars).
 * O prefixo fixo identifica a chave em logs, scanners de segredos e suporte.
 * Chaves antigas (`ak_` + 30 bytes) seguem válidas: `hashApiKey` não mudou e o
 * lookup é sempre pelo hash.
 */

/** Prefixo fixo das chaves novas. */
const API_KEY_PREFIX = "dos_live_";

/** Chars aleatórios expostos no prefixo identificador das chaves novas. */
const IDENTIFYING_RANDOM_CHARS = 4;

/** Prefixo identificador das chaves antigas (`ak_` + 5 chars). */
const LEGACY_PREFIX_LENGTH = 8;

export type GeneratedApiKey = {
  /** Chave em claro — exibida UMA única vez para a usuária copiar. */
  key: string;
  /** SHA-256 hex da chave; é o que fica em deployments.api_key_hash. */
  hash: string;
  /** Prefixo identificador (`apiKeyPrefix`), para a UI sem revelar a chave. */
  prefix: string;
};

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/**
 * Prefixo identificador de uma chave, seguro para UI e auditoria: nas chaves
 * novas é `dos_live_` + 4 chars aleatórios (o prefixo fixo sozinho não
 * distingue nada); nas antigas, os 8 primeiros chars (`ak_xxxxx`).
 */
export function apiKeyPrefix(key: string): string {
  if (key.startsWith(API_KEY_PREFIX)) {
    return key.slice(0, API_KEY_PREFIX.length + IDENTIFYING_RANDOM_CHARS);
  }
  return key.slice(0, LEGACY_PREFIX_LENGTH);
}

/** Gera uma chave `dos_live_` + 32 bytes aleatórios em base64url (52 chars). */
export function generateApiKey(): GeneratedApiKey {
  const key = `${API_KEY_PREFIX}${randomBytes(32).toString("base64url")}`;
  return { key, hash: hashApiKey(key), prefix: apiKeyPrefix(key) };
}

/**
 * Extrai a chave de um header `Authorization: Bearer <chave>`. Devolve null
 * quando o header está ausente ou não segue o esquema Bearer — o chamador
 * decide se cai para outro local (body/query) ou responde 401.
 */
export function bearerKey(header: string | null | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return match ? match[1] : null;
}
