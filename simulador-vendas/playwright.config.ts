import { defineConfig, devices } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  use: { baseURL: "http://localhost:3217", trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev -- --port 3217",
    url: "http://localhost:3217/api/health",
    reuseExistingServer: false,
    env: { DATA_DIR: mkdtempSync(join(tmpdir(), "simulador-voz-tests-")), CONTA_DESLIGADA: "1", ELEVENLABS_AGENT_ID: "agente-antigo-ignorado" },
  },
});
