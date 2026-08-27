import { describe, expect, it } from "vitest";
import { estimateTokenCount, markdownHeaders, prefersMarkdown } from "./negotiation";

describe("prefersMarkdown", () => {
  it("accepts an explicit markdown request", () => {
    expect(prefersMarkdown("text/markdown")).toBe(true);
    expect(prefersMarkdown("text/markdown, text/plain")).toBe(true);
    expect(prefersMarkdown("TEXT/MARKDOWN")).toBe(true);
    expect(prefersMarkdown(" text/markdown ; charset=utf-8 ")).toBe(true);
  });

  it("keeps HTML as the default for browsers", () => {
    // A real Chrome Accept header must never be served markdown.
    expect(
      prefersMarkdown(
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      ),
    ).toBe(false);
    expect(prefersMarkdown("*/*")).toBe(false);
    expect(prefersMarkdown("text/plain")).toBe(false);
    expect(prefersMarkdown(null)).toBe(false);
    expect(prefersMarkdown("")).toBe(false);
  });

  it("honours quality values", () => {
    expect(prefersMarkdown("text/markdown;q=0")).toBe(false);
    // HTML wins ties: the client listed markdown only as an alternative.
    expect(prefersMarkdown("text/html,text/markdown")).toBe(false);
    expect(prefersMarkdown("text/html;q=0.9,text/markdown;q=1.0")).toBe(true);
    expect(prefersMarkdown("text/html;q=0.1,text/markdown;q=0.8")).toBe(true);
  });

  it("does not match markdown-like media types", () => {
    expect(prefersMarkdown("text/markdown-x")).toBe(false);
    expect(prefersMarkdown("application/markdown")).toBe(false);
  });
});

describe("markdownHeaders", () => {
  it("sets the content type, Vary and token count", () => {
    const headers = markdownHeaders("# Title\n\nSome body text.");
    expect(headers["Content-Type"]).toBe("text/markdown; charset=utf-8");
    expect(headers.Vary).toBe("Accept");
    expect(Number(headers["x-markdown-tokens"])).toBeGreaterThan(0);
  });
});

describe("estimateTokenCount", () => {
  it("scales with content length and handles empty input", () => {
    expect(estimateTokenCount("")).toBe(0);
    expect(estimateTokenCount("a".repeat(400))).toBe(100);
  });
});
