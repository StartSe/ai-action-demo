import { describe, expect, it } from "vitest";

import { hitRateLimit, type RateLimitStore } from "@/lib/rate-limit";

/**
 * Fake em memória que reproduz a semântica do script Lua no Redis:
 * INCR + EXPIRE na primeira requisição, TTL decrescente, expiração da janela.
 */
class FakeRedisStore implements RateLimitStore {
  private counters = new Map<string, { count: number; expiresAt: number }>();
  private nowSec = 1_000;

  advance(seconds: number) {
    this.nowSec += seconds;
  }

  async eval(
    _script: string,
    _numKeys: number,
    key: string,
    windowSec: string,
  ): Promise<[number, number]> {
    const window = Number(windowSec);
    const entry = this.counters.get(key);
    if (!entry || entry.expiresAt <= this.nowSec) {
      this.counters.set(key, { count: 1, expiresAt: this.nowSec + window });
      return [1, window];
    }
    entry.count += 1;
    return [entry.count, entry.expiresAt - this.nowSec];
  }
}

class BrokenStore implements RateLimitStore {
  async eval(): Promise<never> {
    throw new Error("Redis indisponível");
  }
}

describe("hitRateLimit", () => {
  it("permite requisições dentro do limite", async () => {
    const store = new FakeRedisStore();
    for (let i = 1; i <= 5; i++) {
      const result = await hitRateLimit("auth:1.2.3.4", {
        limit: 5,
        windowSec: 60,
        store,
      });
      expect(result.limited).toBe(false);
      expect(result.count).toBe(i);
    }
  });

  it("bloqueia acima do limite com retryAfter dentro da janela", async () => {
    const store = new FakeRedisStore();
    for (let i = 0; i < 3; i++) {
      await hitRateLimit("auth:1.2.3.4", { limit: 3, windowSec: 60, store });
    }
    const blocked = await hitRateLimit("auth:1.2.3.4", {
      limit: 3,
      windowSec: 60,
      store,
    });
    expect(blocked.limited).toBe(true);
    expect(blocked.count).toBe(4);
    expect(blocked.retryAfterSec).toBeGreaterThanOrEqual(1);
    expect(blocked.retryAfterSec).toBeLessThanOrEqual(60);
  });

  it("libera novamente depois que a janela expira", async () => {
    const store = new FakeRedisStore();
    for (let i = 0; i < 4; i++) {
      await hitRateLimit("upload:user-1", { limit: 3, windowSec: 60, store });
    }
    store.advance(61);
    const result = await hitRateLimit("upload:user-1", {
      limit: 3,
      windowSec: 60,
      store,
    });
    expect(result.limited).toBe(false);
    expect(result.count).toBe(1);
  });

  it("conta chaves diferentes de forma independente", async () => {
    const store = new FakeRedisStore();
    for (let i = 0; i < 3; i++) {
      await hitRateLimit("auth:1.1.1.1", { limit: 3, windowSec: 60, store });
    }
    const otherIp = await hitRateLimit("auth:2.2.2.2", {
      limit: 3,
      windowSec: 60,
      store,
    });
    expect(otherIp.limited).toBe(false);
    expect(otherIp.count).toBe(1);
  });

  it("fail-open quando o Redis está indisponível", async () => {
    const result = await hitRateLimit("auth:1.2.3.4", {
      limit: 1,
      windowSec: 60,
      store: new BrokenStore(),
    });
    expect(result.limited).toBe(false);
  });
});
