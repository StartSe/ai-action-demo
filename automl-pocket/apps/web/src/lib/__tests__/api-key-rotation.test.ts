import { describe, expect, it, vi } from "vitest";

// deployment-last-used importa @/db e @/lib/queue só para as implementações
// padrão; os testes injetam store/persist e nunca tocam neles.
vi.mock("@/db", () => ({
  getDb: () => {
    throw new Error("getDb não deve ser chamado nos testes");
  },
}));
vi.mock("@/lib/queue", () => ({
  getRedisConnection: () => {
    throw new Error("Redis não deve ser chamado nos testes");
  },
}));

import {
  REVOKED_KEY_VALUES,
  ROTATION_GRACE_MS,
  hasAnyKey,
  matchApiKeyHash,
  rotateKeyValues,
} from "@/lib/api-key-rotation";
import { apiKeyPrefix, generateApiKey, hashApiKey } from "@/lib/api-keys";
import {
  LAST_USED_THROTTLE_SEC,
  claimLastUsedSlot,
  touchDeploymentLastUsed,
  type LastUsedStore,
} from "@/lib/deployment-last-used";

const NOW = new Date("2026-09-02T12:00:00.000Z");
const at = (offsetMs: number) => new Date(NOW.getTime() + offsetMs);
const HOUR = 60 * 60 * 1000;

/** Deployment recém-publicado: só a chave atual. */
function publishedRow() {
  const current = generateApiKey();
  return {
    current,
    row: {
      apiKeyHash: current.hash,
      apiKeyPrefix: current.prefix,
      previousApiKeyHash: null,
      previousKeyExpiresAt: null,
    },
  };
}

describe("generateApiKey / apiKeyPrefix (US-038)", () => {
  it("gera chave dos_live_ + 32 bytes em base64url, com prefixo identificador", () => {
    const generated = generateApiKey();

    expect(generated.key).toMatch(/^dos_live_[A-Za-z0-9_-]{43}$/);
    expect(generated.hash).toBe(hashApiKey(generated.key));
    // dos_live_ + 4 chars aleatórios: identifica sem revelar a chave
    expect(generated.prefix).toBe(generated.key.slice(0, 13));
    expect(generated.prefix).toMatch(/^dos_live_[A-Za-z0-9_-]{4}$/);
  });

  it("prefixo das chaves antigas continua com 8 chars", () => {
    expect(apiKeyPrefix("ak_abcdefghijklmnop")).toBe("ak_abcde");
    expect(apiKeyPrefix("dos_live_WXYZresto-da-chave")).toBe("dos_live_WXYZ");
  });

  it("hashApiKey continua SHA-256 hex puro da string (chaves ak_ seguem casando)", () => {
    // Valor fixo: mudar o hash invalidaria toda chave já gravada no banco
    expect(hashApiKey("ak_teste")).toBe(
      "b9575e590697a3c1b0e78676820f1925954f05572baff39df61708f38c3416c3",
    );
  });
});

describe("rotateKeyValues + matchApiKeyHash — graça de 24 h", () => {
  it("a chave anterior autentica dentro da graça e a nova sempre", () => {
    const { current, row } = publishedRow();
    const next = generateApiKey();

    const rotated = rotateKeyValues(row, next, NOW);

    expect(rotated.apiKeyHash).toBe(next.hash);
    expect(rotated.apiKeyPrefix).toBe(next.prefix);
    expect(rotated.previousApiKeyHash).toBe(current.hash);
    expect(rotated.previousKeyExpiresAt?.getTime()).toBe(
      NOW.getTime() + ROTATION_GRACE_MS,
    );
    expect(ROTATION_GRACE_MS).toBe(24 * HOUR);

    expect(matchApiKeyHash(rotated, next.hash, at(0))).toBe("current");
    expect(matchApiKeyHash(rotated, current.hash, at(0))).toBe("previous");
    expect(matchApiKeyHash(rotated, current.hash, at(23 * HOUR))).toBe(
      "previous",
    );
    expect(matchApiKeyHash(rotated, next.hash, at(48 * HOUR))).toBe("current");
  });

  it("a chave anterior deixa de valer depois de 24 h (expiração exclusiva)", () => {
    const { current, row } = publishedRow();
    const rotated = rotateKeyValues(row, generateApiKey(), NOW);

    expect(matchApiKeyHash(rotated, current.hash, at(24 * HOUR))).toBeNull();
    expect(matchApiKeyHash(rotated, current.hash, at(25 * HOUR))).toBeNull();
  });

  it("uma chave desconhecida nunca autentica", () => {
    const { row } = publishedRow();
    const rotated = rotateKeyValues(row, generateApiKey(), NOW);

    expect(matchApiKeyHash(rotated, hashApiKey("outra"), at(0))).toBeNull();
  });

  it("rotacionar de novo dentro da graça encerra a chave mais antiga", () => {
    const { current: first, row } = publishedRow();
    const second = generateApiKey();
    const third = generateApiKey();

    const once = rotateKeyValues(row, second, NOW);
    const twice = rotateKeyValues(once, third, at(HOUR));

    expect(matchApiKeyHash(twice, third.hash, at(HOUR))).toBe("current");
    expect(matchApiKeyHash(twice, second.hash, at(HOUR))).toBe("previous");
    expect(matchApiKeyHash(twice, first.hash, at(HOUR))).toBeNull();
    expect(twice.previousKeyExpiresAt?.getTime()).toBe(
      NOW.getTime() + HOUR + ROTATION_GRACE_MS,
    );
  });

  it("rotacionar um deployment revogado só gera a nova (sem chave anterior)", () => {
    const next = generateApiKey();
    const rotated = rotateKeyValues(REVOKED_KEY_VALUES, next, NOW);

    expect(rotated.apiKeyHash).toBe(next.hash);
    expect(rotated.previousApiKeyHash).toBeNull();
    expect(rotated.previousKeyExpiresAt).toBeNull();
  });
});

describe("REVOKED_KEY_VALUES — revogação bloqueia as duas chaves", () => {
  it("nem a atual nem a anterior autenticam depois de revogar", () => {
    const { current, row } = publishedRow();
    const next = generateApiKey();
    const rotated = rotateKeyValues(row, next, NOW);
    // Sanidade: antes de revogar as duas valem
    expect(matchApiKeyHash(rotated, next.hash, at(0))).toBe("current");
    expect(matchApiKeyHash(rotated, current.hash, at(0))).toBe("previous");

    const revoked = { ...rotated, ...REVOKED_KEY_VALUES };

    expect(matchApiKeyHash(revoked, next.hash, at(0))).toBeNull();
    expect(matchApiKeyHash(revoked, current.hash, at(0))).toBeNull();
    expect(revoked.apiKeyPrefix).toBeNull();
  });

  it("hasAnyKey distingue deployment com chave (atual ou só anterior) de revogado", () => {
    const { row } = publishedRow();
    expect(hasAnyKey(row)).toBe(true);
    expect(
      hasAnyKey({ apiKeyHash: null, previousApiKeyHash: hashApiKey("x") }),
    ).toBe(true);
    expect(hasAnyKey(REVOKED_KEY_VALUES)).toBe(false);
  });
});

/** Fake do SET NX EX do Redis com relógio controlado. */
class FakeLastUsedStore implements LastUsedStore {
  readonly calls: Array<{ key: string; ttlSec: number }> = [];
  private entries = new Map<string, number>();
  private nowSec = 1_000;

  advance(seconds: number) {
    this.nowSec += seconds;
  }

  async set(
    key: string,
    _value: string,
    _mode: "EX",
    ttlSec: number,
  ): Promise<"OK" | null> {
    this.calls.push({ key, ttlSec });
    const expiresAt = this.entries.get(key);
    if (expiresAt !== undefined && expiresAt > this.nowSec) return null;
    this.entries.set(key, this.nowSec + ttlSec);
    return "OK";
  }
}

class BrokenLastUsedStore implements LastUsedStore {
  async set(): Promise<never> {
    throw new Error("Redis indisponível");
  }
}

const DEPLOYMENT_ID = "11111111-1111-4111-8111-111111111111";

describe("touchDeploymentLastUsed — throttle de 1 UPDATE por minuto", () => {
  it("grava no primeiro request e segura os demais até a chave Redis expirar", async () => {
    const store = new FakeLastUsedStore();
    const persisted: Array<{ id: string; ip: string | null; at: Date }> = [];
    const deps = {
      store,
      persist: async (id: string, ip: string | null, at: Date) => {
        persisted.push({ id, ip, at });
      },
      now: () => NOW,
    };

    expect(await touchDeploymentLastUsed(DEPLOYMENT_ID, "203.0.113.7", deps)).toBe(true);
    expect(await touchDeploymentLastUsed(DEPLOYMENT_ID, "203.0.113.8", deps)).toBe(false);
    expect(await touchDeploymentLastUsed(DEPLOYMENT_ID, "203.0.113.9", deps)).toBe(false);
    expect(persisted).toEqual([{ id: DEPLOYMENT_ID, ip: "203.0.113.7", at: NOW }]);

    // Chave com TTL de 60 s e escopo por deployment
    expect(store.calls[0]).toEqual({
      key: `deployment:last-used:${DEPLOYMENT_ID}`,
      ttlSec: LAST_USED_THROTTLE_SEC,
    });
    expect(LAST_USED_THROTTLE_SEC).toBe(60);

    store.advance(59);
    expect(await touchDeploymentLastUsed(DEPLOYMENT_ID, "203.0.113.9", deps)).toBe(false);
    store.advance(1);
    expect(await touchDeploymentLastUsed(DEPLOYMENT_ID, "203.0.113.9", deps)).toBe(true);
    expect(persisted).toHaveLength(2);
    expect(persisted[1].ip).toBe("203.0.113.9");
  });

  it("deployments diferentes não compartilham o slot", async () => {
    const store = new FakeLastUsedStore();
    const other = "22222222-2222-4222-8222-222222222222";

    expect(await claimLastUsedSlot(DEPLOYMENT_ID, store)).toBe(true);
    expect(await claimLastUsedSlot(other, store)).toBe(true);
    expect(await claimLastUsedSlot(DEPLOYMENT_ID, store)).toBe(false);
  });

  it("Redis indisponível: grava assim mesmo (fail-open) sem lançar", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const persisted: string[] = [];

    const result = await touchDeploymentLastUsed(DEPLOYMENT_ID, null, {
      store: new BrokenLastUsedStore(),
      persist: async (id) => {
        persisted.push(id);
      },
    });

    expect(result).toBe(true);
    expect(persisted).toEqual([DEPLOYMENT_ID]);
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("falha no UPDATE não lança (a predição já foi entregue)", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await touchDeploymentLastUsed(DEPLOYMENT_ID, "1.2.3.4", {
      store: new FakeLastUsedStore(),
      persist: async () => {
        throw new Error("banco fora");
      },
    });

    expect(result).toBe(false);
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
