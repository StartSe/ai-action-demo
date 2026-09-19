import { defineConfig, devices } from "@playwright/test";

// O hook roda em Chromium com a fronteira WebRTC simulada; dispensa o servidor Next.
export default defineConfig({
  testDir: "./tests",
  testMatch: ["livekit-browser.spec.ts", "livekit-cloud-auth.spec.ts"],
  workers: 1,
  use: { ...devices["Desktop Chrome"], trace: "retain-on-failure" },
});
