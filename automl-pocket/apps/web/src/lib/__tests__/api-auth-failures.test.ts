import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  AUTH_BRUTEFORCE_ACTION,
  AUTH_FAILED_ACTION,
  apiAuthFailMode,
  attemptedKeyPrefix,
  recordApiAuthFailure,
  resetApiAuthFailWarnings,
} from "@/lib/api-auth-failures";
import type { AuditEntry } from "@/lib/audit";
import type { RateLimitStore } from "@/lib/rate-limit";
import { API_AUTH_FAIL_RATE_LIMIT } from "@/lib/rate-limit-policy";

/** Mesma semântica do fake de rate-limit.test.ts: INCR + janela fixa. */
class FakeRedisStore implements RateLimitStore {
  private counters = new Map<string, { count: number; expiresAt: number }>();
  private nowSec = 1_000;

  advance(seconds: number) {
    this.nowSec += seconds;
  }

  countFor(key: string): number {
    return this.counters.get(`ratelimit:${key}`)?.count ?? 0;
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

function headersFrom(ip: string | null): Headers {
  const headers = new Headers({ "user-agent": "vitest" });
  if (ip) headers.set("x-forwarded-for", ip);
  return headers;
}

function makeAudit() {
  const entries: AuditEntry[] = [];
  const audit = async (entry: AuditEntry) => {
    entries.push(entry);
  };
  return { entries, audit };
}

const IP = "203.0.113.7";

describe("attemptedKeyPrefix", () => {
  it("devolve os 8 primeiros chars da chave, ou null sem chave", () => {
    expect(attemptedKeyPrefix("ak_abcdefghijklmnop")).toBe("ak_abcde");
    // Chaves novas (US-038): prefixo fixo + 4 chars, igual a api_key_prefix
    expect(attemptedKeyPrefix("dos_live_Q1w2e3r4t5y6u7i8o9p0")).toBe(
      "dos_live_Q1w2",
    );
    expect(attemptedKeyPrefix("curta")).toBe("curta");
    expect(attemptedKeyPrefix("  ")).toBeNull();
    expect(attemptedKeyPrefix(null)).toBeNull();
    expect(attemptedKeyPrefix(undefined)).toBeNull();
  });
});

describe("apiAuthFailMode", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    resetApiAuthFailWarnings();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("default é report (env ausente ou vazia)", () => {
    vi.stubEnv("API_AUTH_FAIL_MODE", "");
    expect(apiAuthFailMode()).toBe("report");
  });

  it("aceita report|enforce sem distinguir caixa", () => {
    vi.stubEnv("API_AUTH_FAIL_MODE", "ENFORCE");
    expect(apiAuthFailMode()).toBe("enforce");
    vi.stubEnv("API_AUTH_FAIL_MODE", " report ");
    expect(apiAuthFailMode()).toBe("report");
  });

  it("valor inválido avisa uma única vez e vale report", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubEnv("API_AUTH_FAIL_MODE", "block");
    expect(apiAuthFailMode()).toBe("report");
    expect(apiAuthFailMode()).toBe("report");
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe("recordApiAuthFailure", () => {
  it("grava api.auth_failed com channel, keyPrefix (8 chars) e ip em todo 401", async () => {
    const { entries, audit } = makeAudit();
    const result = await recordApiAuthFailure({
      channel: "api",
      attemptedKey: "ak_chave-tentada-inteira-nunca-gravada",
      headers: headersFrom(IP),
      mode: "report",
      store: new FakeRedisStore(),
      audit,
    });

    expect(result).toBeNull();
    expect(entries).toEqual([
      {
        action: AUTH_FAILED_ACTION,
        ip: IP,
        userAgent: "vitest",
        metadata: { channel: "api", keyPrefix: "ak_chave", ip: IP },
      },
    ]);
    expect(JSON.stringify(entries)).not.toContain("tentada-inteira");
  });

  it("sem chave tentada grava keyPrefix null (canal mcp)", async () => {
    const { entries, audit } = makeAudit();
    await recordApiAuthFailure({
      channel: "mcp",
      attemptedKey: null,
      headers: headersFrom(IP),
      mode: "report",
      store: new FakeRedisStore(),
      audit,
    });

    expect(entries[0]?.metadata).toEqual({
      channel: "mcp",
      keyPrefix: null,
      ip: IP,
    });
  });

  it("sem IP identificável só audita, sem contar nem bloquear", async () => {
    const { entries, audit } = makeAudit();
    const store = new FakeRedisStore();
    for (let i = 0; i < API_AUTH_FAIL_RATE_LIMIT.limit + 5; i++) {
      const result = await recordApiAuthFailure({
        channel: "api",
        attemptedKey: "ak_x",
        headers: headersFrom(null),
        mode: "enforce",
        store,
        audit,
      });
      expect(result).toBeNull();
    }
    expect(entries.every((e) => e.action === AUTH_FAILED_ACTION)).toBe(true);
    expect(entries[0]?.metadata?.ip).toBeNull();
  });

  it("em report a 11ª falha não bloqueia, mas grava api.auth_bruteforce_suspected", async () => {
    const { entries, audit } = makeAudit();
    const store = new FakeRedisStore();
    const attempt = () =>
      recordApiAuthFailure({
        channel: "api",
        attemptedKey: "ak_tentativa",
        headers: headersFrom(IP),
        mode: "report",
        store,
        audit,
      });

    for (let i = 0; i < API_AUTH_FAIL_RATE_LIMIT.limit; i++) {
      expect(await attempt()).toBeNull();
    }
    expect(
      entries.filter((e) => e.action === AUTH_BRUTEFORCE_ACTION),
    ).toHaveLength(0);

    const eleventh = await attempt();
    expect(eleventh).toBeNull();
    expect(store.countFor(`api-auth-fail:${IP}`)).toBe(
      API_AUTH_FAIL_RATE_LIMIT.limit + 1,
    );

    const suspected = entries.filter((e) => e.action === AUTH_BRUTEFORCE_ACTION);
    expect(suspected).toHaveLength(1);
    expect(suspected[0]).toEqual({
      action: AUTH_BRUTEFORCE_ACTION,
      ip: IP,
      userAgent: "vitest",
      metadata: {
        channel: "api",
        keyPrefix: "ak_tenta",
        ip: IP,
        count: API_AUTH_FAIL_RATE_LIMIT.limit + 1,
        limit: API_AUTH_FAIL_RATE_LIMIT.limit,
        windowSec: API_AUTH_FAIL_RATE_LIMIT.windowSec,
        mode: "report",
      },
    });
    // O 401 em si continua auditado normalmente
    expect(
      entries.filter((e) => e.action === AUTH_FAILED_ACTION),
    ).toHaveLength(API_AUTH_FAIL_RATE_LIMIT.limit + 1);
  });

  it("em enforce a 11ª falha responde 429 com Retry-After e mensagem em pt-BR", async () => {
    const { entries, audit } = makeAudit();
    const store = new FakeRedisStore();
    const attempt = () =>
      recordApiAuthFailure({
        channel: "mcp",
        attemptedKey: "ak_tentativa",
        headers: headersFrom(IP),
        mode: "enforce",
        store,
        audit,
      });

    for (let i = 0; i < API_AUTH_FAIL_RATE_LIMIT.limit; i++) {
      expect(await attempt()).toBeNull();
    }
    const blocked = await attempt();
    expect(blocked?.status).toBe(429);
    expect(blocked?.headers.get("Retry-After")).toBe(
      String(API_AUTH_FAIL_RATE_LIMIT.windowSec),
    );
    const body = (await blocked!.json()) as { error: string };
    expect(body.error).toMatch(/tentativas de autenticação/i);
    expect(body.error).toContain(`${API_AUTH_FAIL_RATE_LIMIT.windowSec} segundos`);

    const suspected = entries.filter((e) => e.action === AUTH_BRUTEFORCE_ACTION);
    expect(suspected).toHaveLength(1);
    expect(suspected[0]?.metadata?.mode).toBe("enforce");
  });

  it("o contador é por IP: outro IP começa do zero e a janela expira", async () => {
    const { audit } = makeAudit();
    const store = new FakeRedisStore();
    const attempt = (ip: string) =>
      recordApiAuthFailure({
        channel: "api",
        attemptedKey: "ak_tentativa",
        headers: headersFrom(ip),
        mode: "enforce",
        store,
        audit,
      });

    for (let i = 0; i < API_AUTH_FAIL_RATE_LIMIT.limit; i++) {
      await attempt(IP);
    }
    expect((await attempt(IP))?.status).toBe(429);
    expect(await attempt("198.51.100.9")).toBeNull();

    store.advance(API_AUTH_FAIL_RATE_LIMIT.windowSec + 1);
    expect(await attempt(IP)).toBeNull();
  });

  it("lê API_AUTH_FAIL_MODE do ambiente quando mode não é injetado", async () => {
    vi.stubEnv("API_AUTH_FAIL_MODE", "enforce");
    try {
      const { audit } = makeAudit();
      const store = new FakeRedisStore();
      let last: Response | null = null;
      for (let i = 0; i <= API_AUTH_FAIL_RATE_LIMIT.limit; i++) {
        last = await recordApiAuthFailure({
          channel: "api",
          attemptedKey: "ak_tentativa",
          headers: headersFrom(IP),
          store,
          audit,
        });
      }
      expect(last?.status).toBe(429);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
