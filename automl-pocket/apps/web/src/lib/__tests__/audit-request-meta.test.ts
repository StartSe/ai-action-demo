import { describe, expect, it, vi } from "vitest";

// audit.ts importa @/db (pg) — só requestMeta/requestLogContext são testados
vi.mock("@/db", () => ({ getDb: () => ({}) }));

import { requestLogContext, requestMeta } from "@/lib/audit";

describe("requestMeta", () => {
  it("lê IP (x-forwarded-for) e user-agent de Headers", () => {
    const headers = new Headers({
      "x-forwarded-for": "10.0.0.1, 10.0.0.2",
      "user-agent": "curl/8",
    });
    expect(requestMeta(headers)).toEqual({ ip: "10.0.0.1", userAgent: "curl/8" });
  });

  it("aceita o Request direto e cai para x-real-ip", () => {
    const request = new Request("http://x/api/mcp", {
      headers: { "x-real-ip": "10.9.9.9" },
    });
    expect(requestMeta(request)).toEqual({ ip: "10.9.9.9", userAgent: null });
  });

  it("null/undefined viram campos nulos", () => {
    expect(requestMeta(null)).toEqual({ ip: null, userAgent: null });
    expect(requestMeta(undefined)).toEqual({ ip: null, userAgent: null });
  });
});

describe("requestLogContext", () => {
  it("remove o ?token= da URL antes de expor para log", () => {
    const request = new Request(
      "http://localhost:3000/api/mcp?token=dos_live_segredo&x=1",
      { method: "POST", headers: { "x-forwarded-for": "1.2.3.4" } },
    );
    const context = requestLogContext(request);
    expect(context).toEqual({
      method: "POST",
      url: "http://localhost:3000/api/mcp?x=1",
      ip: "1.2.3.4",
    });
    expect(JSON.stringify(context)).not.toContain("segredo");
  });

  it("URL sem token passa intacta", () => {
    const request = new Request("http://localhost:3000/api/v1/predict", {
      method: "POST",
    });
    expect(requestLogContext(request).url).toBe(
      "http://localhost:3000/api/v1/predict",
    );
  });
});
