import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "browser-fixture.contract.ts",
  workers: 1,
  fullyParallel: false,
  outputDir: "/tmp/evals-browser-fixture-results",
  reporter: "list",
  use: { browserName: "chromium" },
});
