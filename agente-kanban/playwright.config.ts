import { defineConfig, devices } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const external = process.env.ORBIT_E2E_BASE_URL;
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  use: {
    baseURL: external || "http://127.0.0.1:3211",
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
    viewport: { width: 1440, height: 1024 },
  },
  webServer: external
    ? undefined
    : {
        command: "npm run build && npm start",
        url: "http://127.0.0.1:3211/api/health",
        env: {
          DATA_DIR: mkdtempSync(path.join(tmpdir(), "orbit-browser-")),
          OPENROUTER_API_KEY: "",
          ZAPIER_MCP_URL: "",
          CONTA_DESLIGADA: "0",
          PORT: "3211",
          HOSTNAME: "127.0.0.1",
        },
        reuseExistingServer: false,
        timeout: 120000,
      },
});
