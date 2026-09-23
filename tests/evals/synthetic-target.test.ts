import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { POST } from "../../app/api/evals-fixture/chat/route";

describe("secret protected synthetic target", () => {
  const directory = mkdtempSync(join(tmpdir(), "evals-target-test-"));
  const key = join(directory, "token");
  writeFileSync(key, "synthetic-test-token");
  afterEach(() => vi.unstubAllEnvs());
  it("hides the endpoint without its secret and returns a bounded chatbot answer", async () => {
    vi.stubEnv("EVALS_SYNTHETIC_TARGET_TOKEN_FILE", key);
    const body = JSON.stringify({ model: "caudals-synthetic-chatbot",
      messages: [{ role: "user", content: "Calculate the total for a subtotal of EUR 123.45." }],
      max_tokens: 128, stream: false });
    const request = (authorization?: string) => new Request("https://app.caudals.com/api/evals-fixture/chat", {
      method: "POST", headers: { "content-type": "application/json", ...(authorization ? { authorization } : {}) }, body,
    });
    expect((await POST(request())).status).toBe(404);
    const response = await POST(request("Bearer synthetic-test-token"));
    expect(response.status).toBe(200);
    expect((await response.json()).choices[0].message.content).toBe("EUR 135.80");
    rmSync(directory, { recursive: true, force: true });
  });
});
