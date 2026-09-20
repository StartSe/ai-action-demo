import { defineConfig } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const dataDir = mkdtempSync(join(tmpdir(), "bussola-e2e-"));
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: "list",
  use: {
    baseURL: "http://localhost:3118",
    viewport: { width: 1440, height: 1000 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm run start -- --port 3118",
    url: "http://localhost:3118/api/health",
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      DATA_DIR: dataDir,
      CONTA_DESLIGADA: "",
      OPENROUTER_API_KEY: "",
      NOVA_SENHA_ADMIN: "",
    },
  },
});
