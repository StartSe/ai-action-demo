import { describe, expect, it } from "vitest";

import {
  PROBLEM_DESCRIPTION_INVALID,
  PROBLEM_DESCRIPTION_MAX_LENGTH,
  PROBLEM_DESCRIPTION_TOO_LONG,
  formatProblemDescriptionCount,
  parseProblemDescription,
} from "@/lib/project-problem";

describe("parseProblemDescription", () => {
  it("apara o texto e devolve o valor", () => {
    expect(parseProblemDescription("  prever churn \n")).toEqual({
      ok: true,
      value: "prever churn",
    });
  });

  it("trata campo opcional ausente, vazio ou só espaços como null", () => {
    expect(parseProblemDescription(undefined)).toEqual({
      ok: true,
      value: null,
    });
    expect(parseProblemDescription(null)).toEqual({ ok: true, value: null });
    expect(parseProblemDescription("")).toEqual({ ok: true, value: null });
    expect(parseProblemDescription("   \n\t ")).toEqual({
      ok: true,
      value: null,
    });
  });

  it("aceita exatamente o limite (após aparar)", () => {
    const text = "a".repeat(PROBLEM_DESCRIPTION_MAX_LENGTH);
    expect(parseProblemDescription(`  ${text}  `)).toEqual({
      ok: true,
      value: text,
    });
  });

  it("recusa texto acima do limite com a mensagem em pt-BR", () => {
    const text = "a".repeat(PROBLEM_DESCRIPTION_MAX_LENGTH + 1);
    expect(parseProblemDescription(text)).toEqual({
      ok: false,
      error: PROBLEM_DESCRIPTION_TOO_LONG,
    });
  });

  it("recusa valores que não são texto", () => {
    expect(parseProblemDescription(42)).toEqual({
      ok: false,
      error: PROBLEM_DESCRIPTION_INVALID,
    });
    expect(parseProblemDescription({ text: "x" })).toEqual({
      ok: false,
      error: PROBLEM_DESCRIPTION_INVALID,
    });
  });
});

describe("formatProblemDescriptionCount", () => {
  it("mostra usado/limite e não passa do limite nem fica negativo", () => {
    expect(formatProblemDescriptionCount(0)).toBe("0/1000");
    expect(formatProblemDescriptionCount(123)).toBe("123/1000");
    expect(formatProblemDescriptionCount(5000)).toBe("1000/1000");
    expect(formatProblemDescriptionCount(-3)).toBe("0/1000");
  });
});
