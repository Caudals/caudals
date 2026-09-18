import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: ".",
  testMatch: "ui.contract.ts",
  workers: 1,
  fullyParallel: false,
  outputDir: "/tmp/evals-ui-test-results",
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:4187", browserName: "chromium" },
  webServer: {
    command: "node e2e/evals/harness-server.mjs",
    cwd: process.cwd(),
    url: "http://127.0.0.1:4187",
    timeout: 60000,
    reuseExistingServer: false,
  },
});
