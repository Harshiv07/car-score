import { defineConfig } from "@playwright/test";

/**
 * E2E UI tests. `npm run test:e2e -w client` (or from the repo root:
 * `npm run test:e2e`). Playwright boots both the API (:4000, isolated data
 * dir so the suite is deterministic and never touches your dev DB) and the
 * Vite client (:3000), reusing them when already running.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  fullyParallel: true,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3000",
    headless: true,
    viewport: { width: 1280, height: 900 },
  },
  webServer: [
    {
      command: "cd .. && npm run dev:server",
      port: 4000,
      reuseExistingServer: true,
      timeout: 60_000,
      env: { ...process.env, PORT: "4000", CARSCORE_DATA_DIR: "./.e2e-data" },
    },
    {
      command: "npm run dev",
      port: 3000,
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
});
