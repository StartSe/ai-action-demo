import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AuditEntry } from "@/lib/audit";
import {
  appOrigin,
  CROSS_ORIGIN_ACTION,
  CROSS_ORIGIN_MESSAGE,
  detectCrossOrigin,
  internalApiPolicy,
  internalOriginMode,
  optionsNoCors,
  resetInternalOriginWarnings,
} from "@/lib/internal-api";

const APP = "https://automl.exemplo.com.br";
const OTHER = "https://malicioso.example";

function makeRequest(
  headers: Record<string, string> = {},
  init: { method?: string; path?: string } = {},
): Request {
  return new Request(`${APP}${init.path ?? "/api/datasets/upload"}`, {
    method: init.method ?? "POST",
    headers,
  });
}

function makeAudit() {
  const entries: AuditEntry[] = [];
  const audit = async (entry: AuditEntry) => {
    entries.push(entry);
  };
  return { entries, audit };
}

beforeEach(() => {
  vi.unstubAllEnvs();
  resetInternalOriginWarnings();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("internalOriginMode", () => {
  it("default é report quando a env está ausente ou vazia", () => {
    vi.stubEnv("INTERNAL_ORIGIN_MODE", "");
    expect(internalOriginMode()).toBe("report");
  });

  it.each(["off", "report", "enforce", " Enforce "])(
    "aceita %j (case-insensitive, com espaços)",
    (raw) => {
      vi.stubEnv("INTERNAL_ORIGIN_MODE", raw);
      expect(internalOriginMode()).toBe(raw.trim().toLowerCase());
    },
  );

  it("valor inválido avisa uma vez e vale report", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubEnv("INTERNAL_ORIGIN_MODE", "block");
    expect(internalOriginMode()).toBe("report");
    expect(internalOriginMode()).toBe("report");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain("INTERNAL_ORIGIN_MODE");
  });
});

describe("appOrigin", () => {
  it("extrai scheme + host + porta de BETTER_AUTH_URL, ignorando path", () => {
    expect(appOrigin("https://automl.exemplo.com.br/app/")).toBe(
      "https://automl.exemplo.com.br",
    );
    expect(appOrigin("http://localhost:3000")).toBe("http://localhost:3000");
  });

  it("devolve null quando ausente ou inválida", () => {
    expect(appOrigin(undefined)).toBeNull();
    expect(appOrigin("")).toBeNull();
    expect(appOrigin("nao-e-url")).toBeNull();
  });

  it("lê BETTER_AUTH_URL do ambiente por padrão", () => {
    vi.stubEnv("BETTER_AUTH_URL", `${APP}/`);
    expect(appOrigin()).toBe(APP);
  });
});

describe("detectCrossOrigin", () => {
  it("Sec-Fetch-Site: cross-site é cross-origin mesmo sem Origin", () => {
    const result = detectCrossOrigin(
      new Headers({ "sec-fetch-site": "cross-site" }),
      APP,
    );
    expect(result).toEqual({
      crossOrigin: true,
      origin: null,
      via: "sec-fetch-site",
    });
  });

  it.each(["same-origin", "same-site", "none"])(
    "Sec-Fetch-Site: %s sem Origin não é cross-origin",
    (site) => {
      const result = detectCrossOrigin(
        new Headers({ "sec-fetch-site": site }),
        APP,
      );
      expect(result.crossOrigin).toBe(false);
    },
  );

  it("Sec-Fetch-Site same-origin com Origin igual não é cross-origin", () => {
    const result = detectCrossOrigin(
      new Headers({ "sec-fetch-site": "same-origin", origin: APP }),
      APP,
    );
    expect(result.crossOrigin).toBe(false);
  });

  it("Origin igual à origem do app (com barra final) não é cross-origin", () => {
    const result = detectCrossOrigin(new Headers({ origin: `${APP}/` }), APP);
    expect(result.crossOrigin).toBe(false);
  });

  it("Origin diferente é cross-origin via 'origin'", () => {
    const result = detectCrossOrigin(new Headers({ origin: OTHER }), APP);
    expect(result).toEqual({ crossOrigin: true, origin: OTHER, via: "origin" });
  });

  it("Origin diferente com Sec-Fetch-Site same-site ainda é cross-origin", () => {
    const result = detectCrossOrigin(
      new Headers({ "sec-fetch-site": "same-site", origin: OTHER }),
      APP,
    );
    expect(result.crossOrigin).toBe(true);
    expect(result.via).toBe("origin");
  });

  it("Origin 'null' (sandbox/file) conta como cross-origin", () => {
    const result = detectCrossOrigin(new Headers({ origin: "null" }), APP);
    expect(result.crossOrigin).toBe(true);
    expect(result.origin).toBe("null");
  });

  it("Origin ausente (curl, navegação direta) não é cross-origin", () => {
    const result = detectCrossOrigin(new Headers(), APP);
    expect(result).toEqual({ crossOrigin: false, origin: null, via: null });
  });

  it("sem origem esperada (BETTER_AUTH_URL ausente) ignora o Origin", () => {
    const result = detectCrossOrigin(new Headers({ origin: OTHER }), null);
    expect(result.crossOrigin).toBe(false);
  });

  it("sem origem esperada, Sec-Fetch-Site cross-site ainda bloqueia", () => {
    const result = detectCrossOrigin(
      new Headers({ "sec-fetch-site": "cross-site", origin: OTHER }),
      null,
    );
    expect(result.crossOrigin).toBe(true);
  });
});

describe("internalApiPolicy", () => {
  it("off: ignora cross-origin, não audita", async () => {
    const { entries, audit } = makeAudit();
    const denied = await internalApiPolicy(
      makeRequest({ origin: OTHER, "sec-fetch-site": "cross-site" }),
      { mode: "off", expectedOrigin: APP, audit },
    );
    expect(denied).toBeNull();
    expect(entries).toHaveLength(0);
  });

  it("report: cross-origin grava authz.cross_origin com path e origin e devolve null", async () => {
    const { entries, audit } = makeAudit();
    const denied = await internalApiPolicy(
      makeRequest(
        {
          origin: OTHER,
          "x-forwarded-for": "203.0.113.9, 10.0.0.1",
          "user-agent": "Mozilla/5.0",
        },
        { path: "/api/datasets/abc/rows?page=2", method: "GET" },
      ),
      { mode: "report", expectedOrigin: APP, audit, userId: "u1", orgId: "o1" },
    );
    expect(denied).toBeNull();
    expect(entries).toHaveLength(1);
    const entry = entries[0];
    expect(entry.action).toBe(CROSS_ORIGIN_ACTION);
    expect(entry.userId).toBe("u1");
    expect(entry.orgId).toBe("o1");
    expect(entry.ip).toBe("203.0.113.9");
    expect(entry.userAgent).toBe("Mozilla/5.0");
    expect(entry.metadata).toMatchObject({
      path: "/api/datasets/abc/rows",
      origin: OTHER,
      via: "origin",
      mode: "report",
      method: "GET",
    });
  });

  it("report: mesma origem não audita", async () => {
    const { entries, audit } = makeAudit();
    const denied = await internalApiPolicy(
      makeRequest({ origin: APP, "sec-fetch-site": "same-origin" }),
      { mode: "report", expectedOrigin: APP, audit },
    );
    expect(denied).toBeNull();
    expect(entries).toHaveLength(0);
  });

  it("enforce: cross-origin responde 403 em pt-BR, no-store, e audita", async () => {
    const { entries, audit } = makeAudit();
    const denied = await internalApiPolicy(
      makeRequest({ "sec-fetch-site": "cross-site" }),
      { mode: "enforce", expectedOrigin: APP, audit },
    );
    expect(denied).not.toBeNull();
    expect(denied!.status).toBe(403);
    expect(denied!.headers.get("Cache-Control")).toBe("no-store");
    expect(denied!.headers.get("Access-Control-Allow-Origin")).toBeNull();
    await expect(denied!.json()).resolves.toEqual({
      error: CROSS_ORIGIN_MESSAGE,
    });
    expect(entries).toHaveLength(1);
    expect(entries[0].metadata).toMatchObject({
      origin: null,
      via: "sec-fetch-site",
      mode: "enforce",
    });
  });

  it("enforce: mesma origem e Origin ausente passam", async () => {
    const { entries, audit } = makeAudit();
    expect(
      await internalApiPolicy(makeRequest({ origin: APP }), {
        mode: "enforce",
        expectedOrigin: APP,
        audit,
      }),
    ).toBeNull();
    expect(
      await internalApiPolicy(makeRequest(), {
        mode: "enforce",
        expectedOrigin: APP,
        audit,
      }),
    ).toBeNull();
    expect(entries).toHaveLength(0);
  });

  it("lê modo e origem do ambiente quando não injetados", async () => {
    vi.stubEnv("INTERNAL_ORIGIN_MODE", "enforce");
    vi.stubEnv("BETTER_AUTH_URL", APP);
    const { audit } = makeAudit();
    const denied = await internalApiPolicy(makeRequest({ origin: OTHER }), {
      audit,
    });
    expect(denied?.status).toBe(403);
  });

  it("sem BETTER_AUTH_URL, Origin estranho não bloqueia em enforce (só Sec-Fetch-Site)", async () => {
    vi.stubEnv("INTERNAL_ORIGIN_MODE", "enforce");
    vi.stubEnv("BETTER_AUTH_URL", "");
    const { audit } = makeAudit();
    expect(
      await internalApiPolicy(makeRequest({ origin: OTHER }), { audit }),
    ).toBeNull();
    const denied = await internalApiPolicy(
      makeRequest({ "sec-fetch-site": "cross-site" }),
      { audit },
    );
    expect(denied?.status).toBe(403);
  });
});

describe("optionsNoCors", () => {
  it("responde 204 sem corpo e sem nenhum header Access-Control-*", async () => {
    const response = optionsNoCors();
    expect(response.status).toBe(204);
    expect(response.body).toBeNull();
    for (const [name] of response.headers) {
      expect(name.toLowerCase().startsWith("access-control-")).toBe(false);
    }
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
});
