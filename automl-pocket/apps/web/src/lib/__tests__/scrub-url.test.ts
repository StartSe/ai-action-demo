import { describe, expect, it } from "vitest";

import { SENSITIVE_QUERY_PARAMS, scrubUrl } from "../scrub-url";

describe("scrubUrl", () => {
  it("remove ?token= de uma URL absoluta e preserva os outros parâmetros", () => {
    expect(
      scrubUrl("https://app.exemplo.com/api/mcp?token=dos_live_abc&debug=1"),
    ).toBe("https://app.exemplo.com/api/mcp?debug=1");
  });

  it("remove o token quando ele é o único parâmetro (sem deixar '?')", () => {
    expect(scrubUrl("https://app.exemplo.com/api/mcp?token=dos_live_abc")).toBe(
      "https://app.exemplo.com/api/mcp",
    );
  });

  it("remove o token no meio da query", () => {
    expect(scrubUrl("http://x/api/mcp?a=1&token=segredo&b=2")).toBe(
      "http://x/api/mcp?a=1&b=2",
    );
  });

  it("aceita URL relativa e devolve relativa", () => {
    expect(scrubUrl("/api/mcp?token=segredo&x=1#frag")).toBe(
      "/api/mcp?x=1#frag",
    );
  });

  it("aceita instância de URL", () => {
    expect(scrubUrl(new URL("http://x/api/mcp?token=segredo"))).toBe(
      "http://x/api/mcp",
    );
  });

  it("devolve a string original quando não há parâmetro sensível", () => {
    const original = "http://x/api/v1/predict?rows=10&Token=maiusculo";
    expect(scrubUrl(original)).toBe(original);
  });

  it("remove todas as ocorrências repetidas do parâmetro", () => {
    expect(scrubUrl("http://x/api/mcp?token=a&token=b&k=1")).toBe(
      "http://x/api/mcp?k=1",
    );
  });

  it("nunca lança em entrada que o parser rejeita (fallback textual)", () => {
    expect(scrubUrl("http://exemplo:porta-invalida/api/mcp?token=seg&k=1")).toBe(
      "http://exemplo:porta-invalida/api/mcp?k=1",
    );
    expect(scrubUrl("http://exemplo:porta-invalida/api/mcp?token=seg")).toBe(
      "http://exemplo:porta-invalida/api/mcp",
    );
  });

  it("a lista de parâmetros sensíveis contém token", () => {
    expect(SENSITIVE_QUERY_PARAMS).toContain("token");
  });
});
