import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { PASSWORD_MIN_LENGTH } from "@/lib/password-change";
import {
  MIN_ACCEPTED_STRENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_STRENGTH_LABELS,
  passwordCriteria,
  passwordStrength,
} from "@/lib/password-strength";
import { setupSchema } from "@/lib/setup";

const authSource = readFileSync(path.resolve(__dirname, "../auth.ts"), "utf8");
const strengthSource = readFileSync(
  path.resolve(__dirname, "../password-strength.ts"),
  "utf8",
);

describe("passwordStrength", () => {
  it.each([
    ["abcdefgh", "fraca"],
    ["abcdefghijkl", "fraca"],
    ["Abcdefgh1", "media"],
    ["Abcdefgh1!", "forte"],
    ["Abcdefghijkl1", "forte"],
  ] as const)("%s → %s", (password, expected) => {
    expect(passwordStrength(password)).toBe(expected);
  });

  it("senha curta é fraca mesmo com todos os outros critérios", () => {
    // long não, mas mixed_case + digit + symbol = 3 critérios: só o mínimo barra
    expect(passwordStrength("Ab1!")).toBe("fraca");
  });

  it("senha vazia é fraca", () => {
    expect(passwordStrength("")).toBe("fraca");
  });

  it("labels e mínimo aceito", () => {
    expect(PASSWORD_STRENGTH_LABELS).toEqual({
      fraca: "Fraca",
      media: "Média",
      forte: "Forte",
    });
    expect(MIN_ACCEPTED_STRENGTH).toBe("media");
  });
});

describe("passwordCriteria", () => {
  it("devolve os 5 critérios na ordem do formulário com os rótulos pt-BR", () => {
    expect(
      passwordCriteria("").map(({ code, label }) => ({ code, label })),
    ).toEqual([
      {
        code: "min_length",
        label: `Pelo menos ${PASSWORD_MIN_LENGTH} caracteres`,
      },
      { code: "long", label: "12 caracteres ou mais" },
      { code: "mixed_case", label: "Letras maiúsculas e minúsculas" },
      { code: "digit", label: "Pelo menos um número" },
      { code: "symbol", label: "Pelo menos um símbolo, ex.: ! ? # @" },
    ]);
    expect(PASSWORD_MIN_LENGTH).toBe(8);
  });

  const met = (password: string) =>
    Object.fromEntries(passwordCriteria(password).map((c) => [c.code, c.met]));

  it("senha vazia não atende nenhum critério", () => {
    expect(met("")).toEqual({
      min_length: false,
      long: false,
      mixed_case: false,
      digit: false,
      symbol: false,
    });
  });

  it("min_length: 8 caracteres atende, 7 não", () => {
    expect(met("abcdefgh").min_length).toBe(true);
    expect(met("abcdefg").min_length).toBe(false);
  });

  it("long: 12 caracteres atende, 11 não", () => {
    expect(met("abcdefghijkl").long).toBe(true);
    expect(met("abcdefghijk").long).toBe(false);
  });

  it("mixed_case exige maiúscula E minúscula", () => {
    expect(met("abcdefgh").mixed_case).toBe(false);
    expect(met("ABCDEFGH").mixed_case).toBe(false);
    expect(met("Abcdefgh").mixed_case).toBe(true);
    expect(met("ÁrvoreÇ").mixed_case).toBe(true);
  });

  it("digit exige um número", () => {
    expect(met("abcdefgh").digit).toBe(false);
    expect(met("abcdefg1").digit).toBe(true);
  });

  it("symbol exige algo que não seja letra, número ou espaço", () => {
    expect(met("abcdefgh").symbol).toBe(false);
    expect(met("abc defg").symbol).toBe(false);
    expect(met("Ábc123").symbol).toBe(false);
    for (const symbol of ["!", "?", "#", "@", "-", "_", ".", "ç?"]) {
      expect(met(`abc${symbol}`).symbol, symbol).toBe(true);
    }
  });

  it("cada critério é avaliado de forma independente", () => {
    expect(met("Abcdefgh1!")).toEqual({
      min_length: true,
      long: false,
      mixed_case: true,
      digit: true,
      symbol: true,
    });
  });
});

describe("PASSWORD_MAX_LENGTH", () => {
  it("é 72 (limite do bcrypt) e explica o motivo numa linha", () => {
    expect(PASSWORD_MAX_LENGTH).toBe(72);
    expect(strengthSource).toMatch(
      /\/\*\* bcrypt ignora bytes além de 72[^\n]*\*\/\nexport const PASSWORD_MAX_LENGTH = 72;/,
    );
  });

  it("senha com 73 caracteres é rejeitada pelo setupSchema; 72 passa", () => {
    const base = "Abcdefgh1!";
    const ok = base.padEnd(PASSWORD_MAX_LENGTH, "x");
    const tooLong = base.padEnd(PASSWORD_MAX_LENGTH + 1, "x");
    expect(ok).toHaveLength(72);
    expect(tooLong).toHaveLength(73);
    const input = (password: string) => ({
      name: "Ana",
      email: "ana@example.com",
      password,
      confirm: password,
    });
    expect(setupSchema.safeParse(input(ok)).success).toBe(true);
    const result = setupSchema.safeParse(input(tooLong));
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.path)).toEqual([["password"]]);
  });

  it("lib/auth.ts usa a mesma constante em maxPasswordLength", () => {
    expect(authSource).toContain("maxPasswordLength: PASSWORD_MAX_LENGTH");
    expect(authSource).toMatch(
      /import \{[^}]*PASSWORD_MAX_LENGTH[^}]*\} from "@\/lib\/password-strength"/,
    );
  });
});
