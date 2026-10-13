import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: ".",
  testMatch: ["ui.contract.ts", "example.contract.ts", "report-v2.contract.ts", "dpa.contract.ts", "help.contract.ts", "readout.contract.ts"],
  workers: 1,
  fullyParallel: false,
  // The first page the harness serves also compiles its stylesheet; the
  // default 30 s was spent on that warm-up and failed the first test alone.
  timeout: 60_000,
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
