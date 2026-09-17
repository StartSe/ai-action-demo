import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_TRAINING_CONCURRENCY,
  resetTrainingConcurrencyWarning,
  trainingConcurrency,
} from "@/lib/queue";

describe("trainingConcurrency", () => {
  beforeEach(() => {
    resetTrainingConcurrencyWarning();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("default igual ao do worker (training_concurrency em apps/worker/main.py)", () => {
    vi.stubEnv("TRAINING_CONCURRENCY", "");
    expect(DEFAULT_TRAINING_CONCURRENCY).toBe(2);
    expect(trainingConcurrency()).toBe(2);
  });

  it("lê TRAINING_CONCURRENCY", () => {
    vi.stubEnv("TRAINING_CONCURRENCY", " 8 ");
    expect(trainingConcurrency()).toBe(8);
  });

  it("valor inválido cai no default e avisa uma vez", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubEnv("TRAINING_CONCURRENCY", "0");
    expect(trainingConcurrency()).toBe(2);
    vi.stubEnv("TRAINING_CONCURRENCY", "muitos");
    expect(trainingConcurrency()).toBe(2);
    vi.stubEnv("TRAINING_CONCURRENCY", "2.5");
    expect(trainingConcurrency()).toBe(2);
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
