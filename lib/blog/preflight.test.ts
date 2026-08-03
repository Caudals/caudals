import { describe, expect, it } from "vitest";
import { preflightBlogSource } from "@/lib/blog/preflight";

const valid = `---
title: "Evidence before volume"
excerpt: "A practical editorial note."
publishedAt: "2026-08-03"
author: "The Caudals Team"
authorRole: "Dataset operations"
category: "Dataset operations"
categoryKey: "dataset-operations"
tags: ["Evidence"]
featured: false
coverVariant: "signal"
---

## Start with a claim

Use the source, then write the conclusion.
`;

describe("blog preflight", () => {
  it("accepts the publisher contract", () => {
    expect(preflightBlogSource(valid, { slug: "evidence-before-volume", locale: "en" }).valid).toBe(true);
  });

  it("blocks executable MDX, private-route promotion, and empty image alt text", () => {
    const result = preflightBlogSource(`${valid}\n<script />\n[Buy](/buyer)\n![](https://example.com/x.png)`, { slug: "evidence-before-volume", locale: "en" });
    expect(result.valid).toBe(false);
    expect(result.issues.map((entry) => entry.code)).toEqual(expect.arrayContaining(["mdx.element", "link.private_route", "image.alt"]));
  });

  it("rejects raw HTML but permits HTML examples inside fenced code", () => {
    expect(preflightBlogSource(`${valid}\n<div>Bypass</div>`, { slug: "evidence-before-volume", locale: "en" }).valid).toBe(false);
    expect(preflightBlogSource(`${valid}\n\`\`\`html\n<div>Example</div>\n\`\`\``, { slug: "evidence-before-volume", locale: "en" }).valid).toBe(true);
  });
});
