import { afterEach, describe, expect, it, vi } from "vitest";

import { layoutReviewEnabled } from "@/lib/layout-review";

describe("layoutReviewEnabled", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("é false por padrão (env ausente ou vazia)", () => {
    vi.stubEnv("LAYOUT_REVIEW_ENABLED", "");
    expect(layoutReviewEnabled()).toBe(false);
  });

  it.each(["true", "TRUE", " 1 ", "yes", "on"])("liga com %j", (raw) => {
    vi.stubEnv("LAYOUT_REVIEW_ENABLED", raw);
    expect(layoutReviewEnabled()).toBe(true);
  });

  it.each(["false", "0", "no", "off", "enforce", "sim"])(
    "fica desligado com %j",
    (raw) => {
      vi.stubEnv("LAYOUT_REVIEW_ENABLED", raw);
      expect(layoutReviewEnabled()).toBe(false);
    },
  );
});
