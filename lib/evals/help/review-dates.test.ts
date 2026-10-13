/**
 * Docs drift guard (launch L-20): every help article names a date by which its
 * owner checks it against the product again. This suite fails once that date
 * has passed. It is deliberately not part of the image build, so an overdue
 * review never blocks an unrelated deploy; run it with the rest of the suite.
 */
import { describe, expect, it } from "vitest";
import { buildHelpIndex, HELP_LOCALES } from "./source";

describe("help article reviews", () => {
  it("has no article past its review date", () => {
    const today = new Date().toISOString().slice(0, 10);
    const overdue = HELP_LOCALES.flatMap((locale) =>
      buildHelpIndex(locale)
        .articles.filter((article) => article.reviewBy < today)
        .map((article) => `${locale}/${article.slug} (owner: ${article.owner}, due ${article.reviewBy})`),
    );
    expect(overdue, "Check these articles against the product, update them and their dates (both languages), then run scripts/evals/build-help.ts").toEqual([]);
  });
});
