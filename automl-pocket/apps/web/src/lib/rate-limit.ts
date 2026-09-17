import { NextResponse } from "next/server";

import { getRedisConnection } from "@/lib/queue";

/**
 * Janela fixa por chave: INCR e EXPIRE precisam ser atômicos, senão um crash
 * entre os dois deixa um contador sem TTL bloqueando a chave para sempre.
 * O TTL de segurança no final cobre chaves órfãs criadas antes desta versão.
 */
const RATE_LIMIT_SCRIPT = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('TTL', KEYS[1])
if ttl < 0 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end
return {current, ttl}
`;

/** Subconjunto do ioredis usado pelo limiter — permite store fake nos testes. */
export type RateLimitStore = {
  eval(
    script: string,
    numKeys: number,
    key: string,
    windowSec: string,
  ): Promise<unknown>;
};

export type RateLimitResult = {
  limited: boolean;
  /** Requisições já contadas na janela atual (inclui a atual). */
  count: number;
  /** Segundos até a janela atual expirar. */
  retryAfterSec: number;
};

export type RateLimitOptions = {
  /** Máximo de requisições por janela. */
  limit: number;
  /** Tamanho da janela em segundos. */
  windowSec: number;
  store?: RateLimitStore;
};

/**
 * Registra um hit e informa se a chave estourou o limite. Fail-open: se o
 * Redis estiver indisponível, a requisição passa (o rate limit é defesa de
 * borda, não pode derrubar login/upload junto com a fila).
 */
export async function hitRateLimit(
  key: string,
  { limit, windowSec, store }: RateLimitOptions,
): Promise<RateLimitResult> {
  const redis = store ?? (getRedisConnection() as unknown as RateLimitStore);
  try {
    const result = (await redis.eval(
      RATE_LIMIT_SCRIPT,
      1,
      `ratelimit:${key}`,
      String(windowSec),
    )) as [number, number];
    const [count, ttl] = result;
    return {
      limited: count > limit,
      count,
      retryAfterSec: Math.max(1, ttl),
    };
  } catch (error) {
    console.error("Rate limit indisponível (fail-open):", error);
    return { limited: false, count: 0, retryAfterSec: 0 };
  }
}

/**
 * Aplica rate limit numa rota de API: retorna a resposta 429 pronta (com
 * Retry-After e mensagem em português) ou null para a rota prosseguir.
 */
export async function enforceRateLimit(
  scope: string,
  id: string,
  options: RateLimitOptions,
): Promise<NextResponse | null> {
  const result = await hitRateLimit(`${scope}:${id}`, options);
  if (!result.limited) return null;
  return NextResponse.json(
    {
      error: `Muitas requisições. Tente novamente em ${result.retryAfterSec} segundos.`,
    },
    {
      status: 429,
      headers: { "Retry-After": String(result.retryAfterSec) },
    },
  );
}
