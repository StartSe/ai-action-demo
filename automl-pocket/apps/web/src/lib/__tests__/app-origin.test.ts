import { describe, expect, it } from "vitest";

import { appOrigin, normalizeOrigin, originMatches } from "@/lib/app-origin";

const APP = "https://automl.exemplo.com.br";

describe("appOrigin", () => {
  it("reduz BETTER_AUTH_URL à origem (sem path) e tolera espaços", () => {
    expect(appOrigin(` ${APP}/qualquer/coisa `)).toBe(APP);
    expect(appOrigin("http://localhost:3000")).toBe("http://localhost:3000");
  });

  it("devolve null quando ausente ou inválida", () => {
    expect(appOrigin(undefined)).toBeNull();
    expect(appOrigin("")).toBeNull();
    expect(appOrigin("nao-e-url")).toBeNull();
  });
});

describe("normalizeOrigin / originMatches", () => {
  it("normaliza porta default e ignora path", () => {
    expect(normalizeOrigin(`${APP}:443/x`)).toBe(APP);
    expect(originMatches(`${APP}:443`, APP)).toBe(true);
  });

  it("'null', lixo, esquema ou host diferentes nunca batem", () => {
    expect(normalizeOrigin("null")).toBeNull();
    expect(originMatches("null", APP)).toBe(false);
    expect(originMatches("lixo", APP)).toBe(false);
    expect(originMatches("http://automl.exemplo.com.br", APP)).toBe(false);
    expect(originMatches("https://evil.automl.exemplo.com.br", APP)).toBe(false);
  });

  it("sem origem esperada nada bate", () => {
    expect(originMatches(APP, null)).toBe(false);
  });
});
