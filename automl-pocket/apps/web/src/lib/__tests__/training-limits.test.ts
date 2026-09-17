import { afterEach, describe, expect, it, vi } from "vitest";

import { trainingMaxRows, trainingRowLimitError } from "@/lib/training-limits";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("trainingMaxRows", () => {
  it("sem a env não há limite", () => {
    vi.stubEnv("TRAINING_MAX_ROWS", undefined);
    expect(trainingMaxRows()).toBeNull();
  });

  it("env vazia ou só espaços não há limite", () => {
    vi.stubEnv("TRAINING_MAX_ROWS", "");
    expect(trainingMaxRows()).toBeNull();
    vi.stubEnv("TRAINING_MAX_ROWS", "   ");
    expect(trainingMaxRows()).toBeNull();
  });

  it("lê o teto inteiro positivo da env", () => {
    vi.stubEnv("TRAINING_MAX_ROWS", "50000");
    expect(trainingMaxRows()).toBe(50000);
  });

  it("valor inválido (não numérico, zero, negativo, fracionário) vira sem limite", () => {
    for (const raw of ["abc", "0", "-10", "10.5", "NaN", "Infinity"]) {
      vi.stubEnv("TRAINING_MAX_ROWS", raw);
      expect(trainingMaxRows()).toBeNull();
    }
  });
});

describe("trainingRowLimitError", () => {
  it("sem limite (env ausente) qualquer tamanho passa", () => {
    vi.stubEnv("TRAINING_MAX_ROWS", undefined);
    expect(trainingRowLimitError(10_000_000)).toBeNull();
  });

  it("abaixo do teto passa", () => {
    expect(trainingRowLimitError(999, 1000)).toBeNull();
  });

  it("igual ao teto passa", () => {
    expect(trainingRowLimitError(1000, 1000)).toBeNull();
  });

  it("acima do teto bloqueia com mensagem em português citando os números", () => {
    const error = trainingRowLimitError(150_000, 50_000);
    expect(error).not.toBeNull();
    expect(error).toContain("150.000");
    expect(error).toContain("50.000");
    expect(error).toContain("limite para treinamento");
  });

  it("row_count desconhecido (null) não bloqueia", () => {
    expect(trainingRowLimitError(null, 1000)).toBeNull();
  });

  it("usa a env como default do teto", () => {
    vi.stubEnv("TRAINING_MAX_ROWS", "100");
    expect(trainingRowLimitError(101)).not.toBeNull();
    expect(trainingRowLimitError(100)).toBeNull();
  });
});
