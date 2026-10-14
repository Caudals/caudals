/**
 * The EN/ES literal rule (launch L-23, spec P-45): what it reports in the
 * evaluation app, the demo and the email templates, and what it lets through
 * (catalogue calls, brand names, units, identifiers, codes, code samples).
 */
import { RuleTester } from "eslint";
import tsParser from "@typescript-eslint/parser";
import { describe, expect, it } from "vitest";
import plugin, { ALLOWED_TERMS, hasProse, termsPattern } from "@/scripts/lint/no-ui-literals.mjs";

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const tester = new RuleTester({
  languageOptions: { parser: tsParser, parserOptions: { ecmaFeatures: { jsx: true } } },
});

const literal = { messageId: "literal" };

tester.run("caudals/no-ui-literals", plugin.rules["no-ui-literals"], {
  valid: [
    // Catalogue calls.
    `const a = <button>{t("open")}</button>;`,
    `const a = <Field label={t("name")} placeholder={tv("days", { n: 30 })} />;`,
    `const tabs = [{ value: "open", label: t("xwTabOpen") }];`,
    `const STATUS = { draft: { tone: "neutral", label: phrase("Draft") } };`,
    `setError(t("couldNotSave"));`,
    // Language-neutral text.
    `const a = <span>Caudals</span>;`,
    `const a = <span>{count} · {total}</span>;`,
    `const a = <Field placeholder="https://hooks.example.com/caudals" />;`,
    `const a = <Field label="RPM" />;`,
    `const a = <Field placeholder="gpt, claude, llama…" />;`,
    `const a = <option value="csv">CSV</option>;`,
    `const a = <span>{n} min</span>;`,
    `const a = <p>{t("contentHash")} <code>sha256 of the bundle</code></p>;`,
    `const a = <kbd>Ctrl K</kbd>;`,
    // Codes and states are not sentences.
    `setError("consent");`,
    `setNoticeFilter("all");`,
    `const filter = { label: "evals_runtime" };`,
    // Attributes that are not shown.
    `const a = <div className="p-root p-readout" data-view="audience" role="dialog" />;`,
    `const a = <Panel help="run" />;`,
    `const a = <a href="/workspace/settings">{t("settings")}</a>;`,
  ],
  invalid: [
    { code: `const a = <button>Open</button>;`, errors: [literal] },
    { code: `const a = <p>Release creates a frozen artifact.</p>;`, errors: [literal] },
    { code: `const a = <span>{busy ? "Saving…" : "Save"}</span>;`, errors: [literal, literal] },
    { code: `const a = <Field label="Project ID" />;`, errors: [literal] },
    { code: "const a = <input aria-label={`Select ${item}`} />;", errors: [literal] },
    { code: `const a = <div aria-roledescription="slides" />;`, errors: [literal] },
    { code: `const a = <EmptyState title="No improvement batches" />;`, errors: [literal] },
    { code: `const a = <StatusBadge fallback="Not reviewed" />;`, errors: [literal] },
    { code: `const a = <DataTable headers={["Batch", "Tasks"]} />;`, errors: [literal, literal] },
    { code: `const tabs = [{ value: "all", label: "All" }];`, errors: [literal] },
    { code: `setError("The batch could not be loaded.");`, errors: [literal] },
    { code: `const a = <Field placeholder="ECB reference rate" />;`, errors: [literal] },
    { code: `const a = <span>Hola mundo</span>;`, errors: [literal] },
  ],
});

describe("language-neutral text", () => {
  const pattern = termsPattern(ALLOWED_TERMS);
  it("lets names, units and identifiers through and stops words", () => {
    for (const text of ["Caudals", "DGX Spark", "{n} min", "API · CSV · JSON", "lib/evals/messages/en.ts", "hello@caudals.com", "TEST-CAU-0001", "p95 · 500 ms"]) {
      expect(hasProse(text, pattern), text).toBe(false);
    }
    for (const text of ["Open", "Held-out", "OpenAI-compatible HTTPS", "API key", "of", "Pipeline de CI", "Provider price page, 2026-09"]) {
      expect(hasProse(text, pattern), text).toBe(true);
    }
  });
});
