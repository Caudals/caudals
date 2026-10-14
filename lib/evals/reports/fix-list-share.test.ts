/**
 * "Send to my vendor" (launch P-54): a fix-list link carries the fix list and
 * its evidence only. The projection keeps the answers behind the fixes and an
 * allowlist of their fields; the vendor's page rebuilds exactly the owner's
 * fixes from it, in either language.
 */
import { describe, expect, it } from "vitest";
import { reportFixtures } from "@/scripts/evals/report-fixtures";
import { buildFixes, fixesCsv, fixesMarkdown, isFailing } from "./fixes";
import { isFixListShare, projectFixList } from "./fix-list-share";
import { vendorReferralLinks } from "./referral";
import { FIX_LIST_SCOPE, shareExportKinds, shareScope } from "./share-sections";
import { projectSharedReport } from "./shares";

const fixtures = reportFixtures();
const EVIDENCE_FIELDS = new Set(["assessment_id", "case_revision_id", "title", "topic", "severity", "outcome", "input", "output", "rationale", "label", "expected", "failure_category", "likely_cause", "key_facts", "contradictions", "unsupported_claims", "source_excerpts"]);

describe("fix-list projection", () => {
  for (const fixture of fixtures) {
    const report = fixture.report;
    const shared = projectFixList(report);

    it(`${fixture.name}: carries the fix list's answers and nothing else of the report`, () => {
      expect(Object.keys(shared).sort()).toEqual(["created_at", "report_revision_id", "results", "review_status", "scope", "system"]);
      expect(shared.scope).toBe(FIX_LIST_SCOPE);
      expect(shared.system).toEqual({ name: report.system.name });
      expect(shared.review_status).toBe(report.scope.review_status);
      const members = new Set(buildFixes(report.results).flatMap((fix) => fix.assessment_ids));
      expect(shared.results.map((item) => item.assessment_id)).toEqual(report.results.filter((item) => members.has(item.assessment_id)).map((item) => item.assessment_id));
      for (const item of shared.results) {
        expect(isFailing(item)).toBe(true);
        for (const key of Object.keys(item)) expect(EVIDENCE_FIELDS.has(key)).toBe(true);
        for (const excerpt of item.source_excerpts ?? []) expect(Object.keys(excerpt).sort()).toEqual(["excerpt", "title"]);
      }
      // No metric, finding, methodology or takeaway text reaches the link.
      const text = JSON.stringify(shared);
      for (const finding of report.findings) expect(text).not.toContain(JSON.stringify(finding.observation).slice(1, -1));
      for (const limitation of report.methodology.limitations) expect(text).not.toContain(JSON.stringify(limitation).slice(1, -1));
      expect(text).not.toContain("strict_pass_rate");
      expect(text).not.toContain(report.content_hash);
      expect(text).not.toContain(report.run_id);
      expect(isFixListShare(shared)).toBe(true);
    });

    for (const locale of ["en", "es"] as const) {
      it(`${fixture.name} (${locale}): the vendor's page rebuilds exactly the owner's fixes`, () => {
        expect(buildFixes(shared.results, locale)).toEqual(buildFixes(report.results, locale));
        const fixes = buildFixes(report.results, locale);
        expect(fixesCsv(shared.results, fixes)).toBe(fixesCsv(report.results, fixes));
        expect(fixesMarkdown({ system: shared.system, results: shared.results }, fixes, locale, "x")).toBe(fixesMarkdown({ system: report.system, results: report.results }, fixes, locale, "x"));
      });
    }
  }

  it("leaves out failed answers whose fix is not in the top five", () => {
    const fixture = fixtures.find((item) => buildFixes(item.report.results, "en", 100).length > 5);
    expect(fixture, "a fixture with more than five fixes").toBeTruthy();
    const report = fixture!.report;
    const shared = projectFixList(report);
    const outside = report.results.filter(isFailing).filter((item) => !shared.results.some((kept) => kept.assessment_id === item.assessment_id));
    expect(outside.length).toBeGreaterThan(0);
    const text = JSON.stringify(shared);
    for (const item of outside) expect(text).not.toContain(`"${item.assessment_id}"`);
    // Passing answers never travel either.
    for (const item of report.results.filter((result) => result.outcome === "pass")) expect(text).not.toContain(`"${item.assessment_id}"`);
  });

  it("an answer's internal references stay behind", () => {
    const report = fixtures.find((item) => projectFixList(item.report).results.length > 0)!.report;
    const shared = projectFixList(report);
    const text = JSON.stringify(shared);
    for (const item of report.results.filter((result) => shared.results.some((kept) => kept.assessment_id === result.assessment_id))) {
      expect(text).not.toContain(`"${item.observation_id}"`);
      for (const ref of item.source_refs) if (ref.source_revision_id) expect(text).not.toContain(`"${ref.source_revision_id}"`);
    }
    for (const key of ["observation_id", "source_refs", "review_status\":\"", "graded_by", "web_sources", "offered_actions", "confidence", "source_revision_id", "anchor", "confirmed_claims", "language"]) {
      expect(JSON.stringify(shared.results)).not.toContain(`"${key}`);
    }
  });

  it("a report without failed answers has nothing to send", () => {
    const report = fixtures[0].report;
    const passing = { ...report, results: report.results.filter((item) => item.outcome === "pass") };
    expect(projectFixList(passing).results).toEqual([]);
  });
});

describe("fix-list scope", () => {
  it("is the one recorded field, never combined with report sections", () => {
    expect(shareScope(["fix_list"])).toBe("fix_list");
    expect(shareScope(["fix_list", "results"])).toBe("report");
    expect(shareScope(["system", "metrics"])).toBe("report");
    expect(shareScope([])).toBe("report");
  });

  it("offers no server download, and the report projection shows none of its sections", () => {
    expect(shareExportKinds(["fix_list"])).toEqual([]);
    expect(shareExportKinds(["fix_list", "results"])).toEqual([]);
    expect(shareExportKinds(["system"])).toEqual(["pdf", "docx"]);
    expect(shareExportKinds(["results"])).toEqual(["pdf", "docx", "csv", "cef"]);
    // An older app reading a fix-list grant as report sections would show identity fields only.
    const report = fixtures[0].report as unknown as Record<string, unknown>;
    expect(Object.keys(projectSharedReport(report, ["fix_list"])).sort()).toEqual(["content_hash", "created_at", "report_revision_id", "run_id", "schema_version"]);
  });

  it("the vendor's invitation carries the referral to the free test and the partner enquiry", () => {
    expect(vendorReferralLinks("https://caudals.com", "en", "sr-0123456789ab")).toEqual({
      demo: "https://caudals.com/en/demo?utm_source=vendor_fix_list&utm_medium=referral&utm_campaign=partner_programme&ref=sr-0123456789ab",
      partner: "https://caudals.com/en/contact?offer=not-sure&utm_source=vendor_fix_list&utm_medium=referral&utm_campaign=partner_programme&ref=sr-0123456789ab",
    });
    expect(vendorReferralLinks("https://caudals.com", "es", null)).toEqual({
      demo: "https://caudals.com/es/demo?utm_source=vendor_fix_list&utm_medium=referral&utm_campaign=partner_programme",
      partner: "https://caudals.com/es/contacto?offer=not-sure&utm_source=vendor_fix_list&utm_medium=referral&utm_campaign=partner_programme",
    });
  });
});
