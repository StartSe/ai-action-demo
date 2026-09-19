import { test as base, expect } from "@playwright/test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const test = base.extend<Record<never, never>, { bancoTemporario: string }>({
  bancoTemporario: [async ({}, executarFixture) => {
    const anterior = process.env.DATA_DIR;
    const pasta = mkdtempSync(join(tmpdir(), "simulador-unit-"));
    process.env.DATA_DIR = pasta;
    try { await executarFixture(pasta); } finally {
      if (anterior === undefined) delete process.env.DATA_DIR;
      else process.env.DATA_DIR = anterior;
      rmSync(pasta, { recursive: true, force: true });
    }
  }, { scope: "worker", auto: true }],
});
export { expect };
