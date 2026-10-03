import { describe, expect, it } from "vitest";
import { websiteAppNavigation } from "../../lib/evals/contracts/website-navigation";
import { assertWebsiteRecipeOrigin } from "../../lib/evals/contracts/browser";
import { targetConfigSchema } from "../../lib/evals/contracts/connectors";

describe("website to app navigation", () => {
  it("allows the Maite app after entering its public site, in either direction", () => {
    expect(websiteAppNavigation("https://www.maite.ai/", "https://app.maite.ai/chat")).toBe(true);
    expect(websiteAppNavigation("https://maite.ai/", "https://app.maite.ai/chat")).toBe(true);
    expect(websiteAppNavigation("https://app.maite.ai/", "https://www.maite.ai/chat")).toBe(true);
    expect(() => assertWebsiteRecipeOrigin("https://app.maite.ai/chat", "https://www.maite.ai/")).not.toThrow();
  });
  it("keeps other systems, hosted tenants, credentials and SSO origins outside the saved login", () => {
    for (const destination of ["https://login.maite.ai/", "https://maite.ai.evil.test/", "https://accounts.google.com/", "http://app.maite.ai/", "https://user:password@app.maite.ai/", "https://app.maite.ai:8443/"]) {
      expect(websiteAppNavigation("https://www.maite.ai/", destination)).toBe(false);
    }
    expect(websiteAppNavigation("https://alice.github.io/", "https://bob.github.io/")).toBe(false);
  });
  it("rejects a login navigation outside the target even if provided directly in a config", () => {
    const config = { schema_version: "1.0", target_revision_id: "target", kind: "website", endpoint: "https://www.maite.ai/", recipe_revision_id: null, login_session_id: null,
      limits: { max_turns: 1, max_output_tokens: 500, max_tool_calls: 0, timeout_ms: 60000, repetitions: 1 }, requests_per_minute: 1, concurrent_sessions: 1, reset: "fresh_session" };
    expect(targetConfigSchema.safeParse({ ...config, login_start_url: "https://app.maite.ai/" }).success).toBe(true);
    expect(targetConfigSchema.safeParse({ ...config, login_start_url: "https://accounts.google.com/" }).success).toBe(false);
  });
});
