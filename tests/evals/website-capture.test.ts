import { describe, expect, it } from "vitest";
import { approvedWebsiteUrl, captureWebsiteContext } from "../../lib/evals/connectors/website-capture";

describe("website source scope", () => {
  it("accepts HTTPS and rejects unsafe or ambiguous URLs", () => {
    expect(approvedWebsiteUrl("https://example.com/policy").href).toBe("https://example.com/policy");
    for (const url of ["http://example.com", "https://user@example.com", "https://example.com:8443", "https://example.com/?q=1", "https://example.com/#section", "not a URL"]) {
      expect(() => approvedWebsiteUrl(url)).toThrow("website_url_invalid");
    }
  });

  it("captures only same-host public pages within the configured page budget", async () => {
    const start = "https://example.test/help";
    let current = "";
    const checked: string[] = [];
    const page = {
      goto: async (url: string) => { current = url; return { status: () => 200 }; },
      url: () => current,
      evaluate: async () => current.endsWith("/help")
        ? { title: "Help", text: "Returns are available within 30 days.", links: ["https://example.test/policy", "https://outside.test/secret", "https://example.test/skip?q=x"] }
        : { title: "Policy", text: "Refunds are sent to the original payment method.", links: [] },
    };
    const browser = {
      newContext: async () => ({ route: async () => undefined, routeWebSocket: async () => undefined, newPage: async () => page, close: async () => undefined }),
    } as never;
    const result = await captureWebsiteContext({
      browser,
      startUrl: start,
      maxPages: 50,
      destinationCheck: async (url) => { checked.push(url); },
    });
    expect(result.urls).toEqual(["https://example.test/help", "https://example.test/policy"]);
    expect(result.markdown).toContain("Returns are available within 30 days.");
    expect(result.markdown).toContain("Refunds are sent to the original payment method.");
    expect(result.markdown).not.toContain("secret");
    expect(checked).toEqual(result.urls);
  });
});
