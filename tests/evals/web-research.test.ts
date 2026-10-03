import { describe, expect, it } from "vitest";
import { parseDiscovery } from "../../lib/evals/repositories/web-discovery";
import { answerJudgeSystemPrompt } from "../../lib/evals/scoring/answer-judge";
import { invocationSchema } from "../../lib/evals/providers/contracts";

const output = (pages: unknown, citations: Array<{ url: string; title?: string }> = []) => ({ text: JSON.stringify({ pages }), complete: true, citations });

describe("web source discovery", () => {
  it("keeps public https pages, puts the company's own site first and skips known, social, review and app-store pages", () => {
    const parsed = parseDiscovery(output([
      { url: "https://partner.example.org/fees", title: "Fees", why: "Partner fee table" },
      { url: "https://www.example.com/help/refunds?utm=1#top", title: "Refunds", why: "Refund policy" },
      { url: "http://example.com/insecure", title: "Old" },
      { url: "https://www.linkedin.com/company/example" },
      { url: "https://www.trustpilot.com/review/example.com" },
      { url: "https://play.google.com/store/apps/details" },
      { url: "https://example.com/terms" },
    ], [{ url: "https://example.com/pricing", title: "Pricing" }]), "chat.example.com", ["https://example.com/terms"]);
    expect(parsed?.map((item) => [item.url, item.same_site])).toEqual([
      ["https://www.example.com/help/refunds", true],
      ["https://example.com/pricing", true],
      ["https://partner.example.org/fees", false],
    ]);
  });
  it("reports nothing usable instead of guessing", () => {
    expect(parseDiscovery({ text: "I could not search.", complete: true }, null, [])).toBeNull();
  });
});

describe("web research in the engine", () => {
  it("tells the judge to use the web only for details the excerpts do not cover", () => {
    expect(answerJudgeSystemPrompt()).not.toContain("confirmed_claims");
    const web = answerJudgeSystemPrompt({ web: true });
    expect(web).toContain("confirmed_claims");
    expect(web).toContain("stay the ground truth");
  });
  it("never lets a target call search the web", () => {
    const base = { providerRevisionId: crypto.randomUUID(), priceRevisionId: crypto.randomUUID(), workspaceBudgetId: crypto.randomUUID(), runBudgetId: crypto.randomUUID(), dataClass: "synthetic", region: "external_api", routing: "approved_providers", approvedProviderIds: [], messages: [{ role: "user", content: "x" }], maxOutputTokens: 100, webSearch: { maxResults: 5 } };
    expect(invocationSchema.safeParse({ ...base, role: "judge" }).success).toBe(true);
    expect(invocationSchema.safeParse({ ...base, role: "target" }).success).toBe(false);
  });
});
