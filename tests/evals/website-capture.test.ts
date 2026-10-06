import { describe, expect, it, vi } from "vitest";
import type { Route } from "playwright";
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
    expect([...new Set(checked)]).toEqual(result.urls);
  });

  it("follows initial redirects and samples only links on the final site", async () => {
    const fixture = redirectedSite();
    const result = await captureWebsiteContext({ ...fixture.options, maxPages: 2 });
    expect(result.urls).toEqual(["https://www.final.test/help", "https://www.final.test/policy"]);
    expect(result.markdown).toContain("Source URL: https://www.final.test/help");
    expect(result.markdown).toContain("Refunds take five days.");
    expect(fixture.visited).toEqual(["https://original.test/help", "https://www.final.test/policy"]);
    expect(fixture.checked).toContain("https://www.final.test/help");
    expect(fixture.close).toHaveBeenCalledOnce();
  });

  it("keeps query parameters on the resolved URL and removes its fragment", async () => {
    const fixture = redirectedSite("https://www.final.test/help?lang=es#faq");
    const result = await captureWebsiteContext({ ...fixture.options, maxPages: 1 });
    expect(result.urls).toEqual(["https://www.final.test/help?lang=es"]);
    expect(result.markdown).toContain("Source URL: https://www.final.test/help?lang=es");
    expect(fixture.visited).toHaveLength(1);
  });

  it.each(["http://final.test/help", "https://user:password@final.test/help", "https://final.test:8443/help"])("rejects an unsafe redirect destination %s", async (finalUrl) => {
    const fixture = redirectedSite(finalUrl);
    await expect(captureWebsiteContext(fixture.options)).rejects.toThrow("website_url_invalid");
    expect(fixture.close).toHaveBeenCalledOnce();
  });

  it("rejects a redirect to a destination denied by the public egress checker", async () => {
    const fixture = redirectedSite("https://private.test/help");
    await expect(captureWebsiteContext({ ...fixture.options, destinationCheck: async (url) => {
      if (new URL(url).hostname === "private.test") throw new Error("destination_denied");
    } })).rejects.toThrow("destination_denied");
    expect(fixture.close).toHaveBeenCalledOnce();
  });

  it("does not change crawl sites when a later page redirects elsewhere", async () => {
    const fixture = redirectedSite("https://www.final.test/help", "https://outside.test/policy");
    const result = await captureWebsiteContext(fixture.options);
    expect(result.urls).toEqual(["https://www.final.test/help"]);
    expect(result.markdown).not.toContain("Refunds take five days.");
  });

  it("does not duplicate a page reached through another redirect", async () => {
    const fixture = redirectedSite("https://www.final.test/help", "https://www.final.test/help");
    const result = await captureWebsiteContext(fixture.options);
    expect(result.urls).toHaveLength(1);
    expect(result.markdown.match(/Source URL:/g)).toHaveLength(1);
  });
});

function redirectedSite(finalUrl = "https://www.final.test/help", childUrl = "https://www.final.test/policy") {
  let current = "";
  let handler: (route: Route) => Promise<void> = async () => undefined;
  const visited: string[] = [];
  const checked: string[] = [];
  const close = vi.fn(async () => undefined);
  const page = {
    goto: async (url: string) => {
      visited.push(url);
      let aborted = false;
      await handler({
        request: () => ({ url: () => url, isNavigationRequest: () => true, resourceType: () => "document" }),
        abort: async () => { aborted = true; },
        continue: async () => undefined,
      } as unknown as Route);
      if (aborted) throw new Error("blockedbyclient");
      // HTTP redirect hops may bypass Playwright routing; the production proxy
      // validates their connections and capture validates the final URL too.
      current = url === "https://original.test/help" ? finalUrl : childUrl;
      return { status: () => 200 };
    },
    url: () => current,
    evaluate: async () => visited.length === 1
      ? { title: "Help", text: "Returns are available within 30 days.", links: ["https://www.final.test/policy", "https://original.test/policy", "https://outside.test/secret"] }
      : { title: "Policy", text: "Refunds take five days.", links: [] },
  };
  const browser = { newContext: async () => ({
    route: async (_pattern: string, callback: typeof handler) => { handler = callback; },
    routeWebSocket: async () => undefined,
    newPage: async () => page,
    close,
  }) } as never;
  return { visited, checked, close, options: {
    browser,
    startUrl: "https://original.test/help",
    maxPages: 3,
    destinationCheck: async (url: string) => { checked.push(url); },
  } };
}
