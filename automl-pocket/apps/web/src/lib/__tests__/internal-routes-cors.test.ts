import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AuditEntry } from "@/lib/audit";
import { CROSS_ORIGIN_ACTION, CROSS_ORIGIN_MESSAGE } from "@/lib/internal-api";

// Vários route.ts puxam módulos com `import "server-only"` (llm) —
// neutraliza para o vitest importar os handlers de verdade.
vi.mock("server-only", () => ({}));

// A política grava `authz.cross_origin` via logAudit; capturamos em memória
// para não precisar de banco (e para afirmar o path auditado).
const captured = vi.hoisted(() => ({ entries: [] as AuditEntry[] }));
vi.mock("@/lib/audit", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/audit")>();
  return {
    ...original,
    logAudit: async (entry: AuditEntry) => {
      captured.entries.push(entry);
    },
  };
});

/**
 * Teste anti-CORS (US-019): nenhuma rota interna (fora de /api/v1, /api/mcp
 * e /api/auth) pode ser lida ou disparada por outro site. Varre TODOS os
 * route.ts de src/app, importa os handlers e:
 * - exige `OPTIONS` (preflight) sem nenhum Access-Control-*;
 * - chama cada método (GET/POST/…) com Origin estranho em modo enforce e
 *   espera 403 antes de qualquer sessão/banco, sem Access-Control-Allow-Origin;
 * - garante que /api/v1, /api/mcp e /api/auth NÃO aplicam a política.
 * Rota nova em src/app que não exporte `OPTIONS = optionsNoCors` nem chame
 * `internalApiPolicy` primeiro faz este teste falhar de propósito.
 */

const APP_DIR = path.resolve(__dirname, "../../app");
const APP_ORIGIN = "https://automl.exemplo.com.br";
const EVIL_ORIGIN = "https://malicioso.example";

/** Rotas server-to-server / Better Auth: fora da política por design. */
const EXCLUDED_PREFIXES = ["/api/v1/", "/api/mcp", "/api/auth/"];

/** Rotas internas que este teste PRECISA encontrar (guarda contra renomeações). */
const REQUIRED_INTERNAL_ROUTES = [
  "/api/datasets/upload",
  "/api/datasets/[datasetId]/rows",
  "/api/datasets/[datasetId]/download",
  "/api/datasets/[datasetId]/layout",
  "/app/[slug]/batch",
];

const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

type RouteFile = { routePath: string; file: string };

function listRouteFiles(): RouteFile[] {
  return readdirSync(APP_DIR, { recursive: true, encoding: "utf8" })
    .filter((entry) => entry === "route.ts" || entry.endsWith("/route.ts"))
    .map((entry) => {
      const file = path.join(APP_DIR, entry);
      const routePath = "/" + entry.replace(/\/?route\.ts$/, "");
      return { routePath, file };
    })
    .sort((a, b) => a.routePath.localeCompare(b.routePath));
}

function isExcluded(routePath: string): boolean {
  return EXCLUDED_PREFIXES.some(
    (prefix) =>
      routePath === prefix.replace(/\/$/, "") || routePath.startsWith(prefix),
  );
}

/** Troca [param] por um valor concreto para montar a URL da requisição. */
function concreteUrl(routePath: string): string {
  return (
    APP_ORIGIN +
    routePath.replace(/\[\.\.\.[^\]]+\]/g, "x").replace(/\[[^\]]+\]/g, "x")
  );
}

function crossOriginRequest(routePath: string, method: string): Request {
  return new Request(concreteUrl(routePath), {
    method,
    headers: {
      origin: EVIL_ORIGIN,
      "sec-fetch-site": "cross-site",
      "content-type": "application/json",
    },
    ...(method === "GET" ? {} : { body: "{}" }),
  });
}

const routeContext = {
  params: Promise.resolve({
    datasetId: "33333333-3333-4333-8333-333333333333",
    slug: "demo",
    all: ["sign-in"],
  }),
};

type Handler = (
  request: Request,
  ctx: typeof routeContext,
) => Promise<Response> | Response;

function assertNoCors(response: Response, label: string) {
  for (const header of response.headers.keys()) {
    expect(
      header.toLowerCase().startsWith("access-control-"),
      `${label} respondeu ${header}`,
    ).toBe(false);
  }
  expect(response.headers.get("access-control-allow-origin")).toBeNull();
}

const allRoutes = listRouteFiles();
const internalRoutes = allRoutes.filter((r) => !isExcluded(r.routePath));
const excludedRoutes = allRoutes.filter((r) => isExcluded(r.routePath));

describe("rotas internas negam cross-origin (anti-CORS)", () => {
  const env = { ...process.env };

  beforeEach(() => {
    process.env.INTERNAL_ORIGIN_MODE = "enforce";
    process.env.BETTER_AUTH_URL = APP_ORIGIN;
    captured.entries.length = 0;
  });

  afterEach(() => {
    process.env = { ...env };
  });

  it("encontra todas as rotas internas conhecidas", () => {
    const found = internalRoutes.map((r) => r.routePath);
    for (const required of REQUIRED_INTERNAL_ROUTES) {
      expect(found, `rota ${required} não encontrada em src/app`).toContain(
        required,
      );
    }
    // /api/v1, /api/mcp e /api/auth existem e ficaram de fora
    expect(excludedRoutes.map((r) => r.routePath)).toEqual(
      expect.arrayContaining([
        "/api/v1/predict",
        "/api/mcp",
        "/api/auth/[...all]",
      ]),
    );
  });

  it("nenhum route.ts emite Access-Control-Allow-*", () => {
    for (const { routePath, file } of allRoutes) {
      const source = readFileSync(file, "utf8");
      expect(source, `${routePath} contém Access-Control-Allow`).not.toMatch(
        /Access-Control-Allow/i,
      );
    }
  });

  for (const { routePath, file } of internalRoutes) {
    describe(routePath, () => {
      it("exporta OPTIONS que responde 204 sem Access-Control-*", async () => {
        const mod = (await import(file)) as Record<string, unknown>;
        expect(typeof mod.OPTIONS, `${routePath} não exporta OPTIONS`).toBe(
          "function",
        );
        const response = await (mod.OPTIONS as Handler)(
          crossOriginRequest(routePath, "OPTIONS"),
          routeContext,
        );
        expect(response.status).toBe(204);
        assertNoCors(response, `${routePath} OPTIONS`);
        expect(response.headers.get("Cache-Control")).toBe("no-store");
      });

      it("responde 403 a Origin estranho em enforce, sem CORS e sem tocar a sessão", async () => {
        const mod = (await import(file)) as Record<string, unknown>;
        const methods = HTTP_METHODS.filter(
          (m) => typeof mod[m] === "function",
        );
        expect(
          methods.length,
          `${routePath} não exporta GET/POST/…`,
        ).toBeGreaterThan(0);

        for (const method of methods) {
          captured.entries.length = 0;
          const response = await (mod[method] as Handler)(
            crossOriginRequest(routePath, method),
            routeContext,
          );
          expect(response.status, `${routePath} ${method}`).toBe(403);
          assertNoCors(response, `${routePath} ${method}`);
          expect(response.headers.get("Cache-Control")).toContain("no-store");
          await expect(response.json()).resolves.toEqual({
            error: CROSS_ORIGIN_MESSAGE,
          });

          const event = captured.entries.find(
            (e) => e.action === CROSS_ORIGIN_ACTION,
          );
          expect(event, `${routePath} ${method} não auditou`).toBeDefined();
          expect(event?.metadata).toMatchObject({
            path: new URL(concreteUrl(routePath)).pathname,
            origin: EVIL_ORIGIN,
            mode: "enforce",
            method,
          });
        }
      });
    });
  }

  for (const { routePath, file } of excludedRoutes) {
    it(`${routePath} fica fora da política (server-to-server / Better Auth)`, () => {
      const source = readFileSync(file, "utf8");
      expect(source).not.toContain("internalApiPolicy");
      expect(source).not.toContain("optionsNoCors");
    });
  }
});
