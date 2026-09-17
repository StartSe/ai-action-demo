import { describe, expect, it } from "vitest";

import {
  CACHE_CONTROL_NO_STORE,
  CACHE_CONTROL_NO_STORE_STREAM,
  NO_STORE_HEADERS,
  withDeprecation,
  withNoSniff,
  withNoStore,
  withPublicApiHeaders,
} from "../http-headers";

describe("withNoStore", () => {
  it("adiciona Cache-Control: no-store em resposta sem o cabeçalho", () => {
    const response = withNoStore(Response.json({ ok: true }));
    expect(response.headers.get("Cache-Control")).toBe(CACHE_CONTROL_NO_STORE);
  });

  it("substitui um Cache-Control que permitiria cache", () => {
    const response = withNoStore(
      new Response("x", { headers: { "Cache-Control": "public, max-age=60" } }),
    );
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("preserva a variante de streaming (no-store, no-transform)", () => {
    const response = withNoStore(
      new Response("x", {
        headers: { "Cache-Control": CACHE_CONTROL_NO_STORE_STREAM },
      }),
    );
    expect(response.headers.get("Cache-Control")).toBe(
      CACHE_CONTROL_NO_STORE_STREAM,
    );
  });

  it("devolve a mesma instância, com status e corpo intactos", async () => {
    const original = Response.json({ error: "x" }, { status: 429 });
    const response = withNoStore(original);
    expect(response).toBe(original);
    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ error: "x" });
  });

  it("NO_STORE_HEADERS espalha o mesmo valor", () => {
    expect(NO_STORE_HEADERS["Cache-Control"]).toBe(CACHE_CONTROL_NO_STORE);
  });
});

describe("withDeprecation", () => {
  it("adiciona Deprecation: true sem mexer no status/corpo", async () => {
    const response = withDeprecation(
      Response.json({ predictions: [] }, { status: 200 }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Deprecation")).toBe("true");
    expect(await response.json()).toEqual({ predictions: [] });
  });

  it("preserva um Link já existente (não mexe em Link)", () => {
    const response = withDeprecation(
      new Response("x", { headers: { Link: '</outro>; rel="next"' } }),
    );
    expect(response.headers.get("Link")).toBe('</outro>; rel="next"');
  });

  it("compõe com withNoStore", () => {
    const response = withNoStore(withDeprecation(Response.json({})));
    expect(response.headers.get("Cache-Control")).toBe(CACHE_CONTROL_NO_STORE);
    expect(response.headers.get("Deprecation")).toBe("true");
  });
});

describe("withNoSniff / withPublicApiHeaders", () => {
  it("withNoSniff define X-Content-Type-Options: nosniff sem tocar no resto", async () => {
    const response = withNoSniff(Response.json({ ok: true }, { status: 413 }));
    expect(response.status).toBe(413);
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("Cache-Control")).toBeNull();
    expect(await response.json()).toEqual({ ok: true });
  });

  it("withPublicApiHeaders aplica no-store + nosniff e é idempotente", () => {
    const response = withPublicApiHeaders(
      withPublicApiHeaders(Response.json({})),
    );
    expect(response.headers.get("Cache-Control")).toBe(CACHE_CONTROL_NO_STORE);
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("withPublicApiHeaders preserva um Cache-Control que já tem no-store", () => {
    const response = withPublicApiHeaders(
      new Response("x", {
        headers: { "Cache-Control": "no-store, no-transform" },
      }),
    );
    expect(response.headers.get("Cache-Control")).toBe(
      "no-store, no-transform",
    );
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });
});
