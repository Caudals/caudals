import { describe, expect, it } from "vitest";
import {
  checkSnapshotPolicy, madridDay, outreachDrafts, publicUrl, scrubShareLinks, snapshotLimits, snapshotMetrics, snapshotScope,
  snapshotShareExpiry, weakEvidence,
} from "./policy";

describe("prospect snapshot policy (launch L-21)", () => {
  it("allows only the ordinary grounded pack and blocks every adversarial pack", () => {
    expect(checkSnapshotPolicy({ packId: "generic-grounded-qa" })).toEqual({ allowed: true, reasons: [] });
    for (const packId of ["prompt-injection", "jailbreak-suite", "prompt_extraction", "red-team-v2", "adversarial-generic", "system-prompt-leak", "data-exfiltration"]) {
      expect(checkSnapshotPolicy({ packId })).toEqual({ allowed: false, reasons: ["adversarial_pack"] });
    }
    // Fixtures and unknown packs are not on the ordinary list either.
    expect(checkSnapshotPolicy({ packId: "synthetic-accounting" }).reasons).toEqual(["pack_not_allowed"]);
    expect(checkSnapshotPolicy({ packId: "insurance-claims" }).reasons).toEqual(["pack_not_allowed"]);
  });

  it("blocks adversarial or non-ordinary cases inside an allowed pack", () => {
    const ordinary = { task_type: "grounded_qa", tags: ["refunds", "shipping"] };
    expect(checkSnapshotPolicy({ packId: "generic-grounded-qa", cases: [ordinary] }).allowed).toBe(true);
    expect(checkSnapshotPolicy({ packId: "generic-grounded-qa", cases: [ordinary, { task_type: "grounded_qa", tags: ["Prompt injection"] }] }).reasons).toEqual(["adversarial_case"]);
    expect(checkSnapshotPolicy({ packId: "generic-grounded-qa", cases: [{ task_type: "grounded_qa", tags: ["jailbreak"] }] }).reasons).toEqual(["adversarial_case"]);
    expect(checkSnapshotPolicy({ packId: "generic-grounded-qa", cases: [{ task_type: "tool_workflow", tags: [] }] }).reasons).toEqual(["task_type_not_allowed"]);
    expect(checkSnapshotPolicy({ packId: "generic-grounded-qa", cases: [{ task_type: "conversation", tags: [] }] }).reasons).toEqual(["task_type_not_allowed"]);
    // Ordinary words that merely resemble attack names are fine.
    expect(checkSnapshotPolicy({ packId: "generic-grounded-qa", cases: [{ task_type: "grounded_qa", tags: ["injections", "bypass surgery"] }] }).allowed).toBe(true);
  });

  it("accepts only public https pages and drops query and fragment", () => {
    expect(publicUrl("https://Help.Example.com/es/chat?utm=x#widget")).toEqual({ url: "https://help.example.com/es/chat", host: "help.example.com" });
    expect(publicUrl("https://example.com:443/faq")).toEqual({ url: "https://example.com/faq", host: "example.com" });
    for (const raw of ["http://example.com", "https://user:pass@example.com", "https://example.com:8443/", "https://localhost/chat", "https://10.0.0.1/",
      "https://[::1]/", "https://intranet/", "https://printer.local/", "https://app.internal/", "ftp://example.com", "not a url"]) {
      expect(publicUrl(raw)).toBeNull();
    }
  });

  it("clamps limits to what the database accepts", () => {
    expect(snapshotLimits({})).toMatchObject({ dailyCap: 25, maxQuestions: 10, requestsPerMinute: 4, concurrentSessions: 1, runsPerMonth: 3 });
    expect(snapshotLimits({ PROSPECT_SNAPSHOT_DAILY_CAP: "500", PROSPECT_SNAPSHOT_MAX_QUESTIONS: "99" })).toMatchObject({ dailyCap: 200, maxQuestions: 20 });
    expect(snapshotLimits({ PROSPECT_SNAPSHOT_DAILY_CAP: "0", PROSPECT_SNAPSHOT_MAX_QUESTIONS: "x" })).toMatchObject({ dailyCap: 1, maxQuestions: 10 });
    expect(snapshotScope({ packId: "generic-grounded-qa", maxQuestions: 10 })).toMatchObject({ questions: "ordinary", information: "public", adversarial: false, sharing: "private_link", public_naming: false });
  });

  it("counts the cap per Madrid day and expires links after exactly 30 days", () => {
    expect(madridDay(new Date("2026-10-12T21:59:00Z"))).toBe("2026-10-12");
    expect(madridDay(new Date("2026-10-12T22:00:00Z"))).toBe("2026-10-13"); // CEST, UTC+2
    expect(madridDay(new Date("2026-12-31T23:30:00Z"))).toBe("2027-01-01"); // CET, UTC+1
    const now = new Date("2026-10-12T10:00:00Z");
    expect(snapshotShareExpiry(now).getTime() - now.getTime()).toBe(30 * 24 * 3600_000);
  });

  it("fills the §7.5 templates in English and Spanish with an accurate scope line", () => {
    const metrics = snapshotMetrics({ n_scorable: 8, n_pass: 5, n_partial: 2, n_fail: 1 });
    const drafts = outreachDrafts({ company: "Acme Seguros", metrics, finding: "Refund window stated as 14 days instead of 30" });
    expect(drafts.en.linkedin).toContain("Hi {name}, I tested Acme Seguros's assistant with 8 questions");
    expect(drafts.en.linkedin).toContain("5 right, 2 incomplete and 1 wrong");
    expect(drafts.en.linkedin).toContain("{link}");
    expect(drafts.en.linkedin).toContain("ordinary questions on your public chat, using public information only");
    expect(drafts.en.emailSubject).toBe("Acme Seguros: one of your assistant's answers contradicts your own site");
    expect(drafts.en.emailBody).toMatch(/reply "no"/);
    expect(drafts.es.linkedin).toContain("Hola {nombre}: he probado el asistente de Acme Seguros con 8 preguntas");
    expect(drafts.es.linkedin).toContain("5 bien, 2 incompletas y 1 incorrectas");
    expect(drafts.es.emailSubject).toBe("Acme Seguros: una respuesta de vuestro asistente contradice vuestra web");
    expect(drafts.es.emailBody).toContain("responde «no»");
    const linked = outreachDrafts({ company: "Acme", metrics, link: "https://app.caudals.com/share#token=abc" });
    expect(linked.en.linkedin).toContain("https://app.caudals.com/share#token=abc");
    for (const text of [drafts.en, drafts.es].flatMap((draft) => Object.values(draft))) expect(text).not.toMatch(/certif|complian|cumplimiento/i);
  });

  it("flags weak evidence and never stores a link token", () => {
    expect(weakEvidence(null)).toBe(true);
    expect(weakEvidence({ scored: 4, pass: 2, partial: 1, fail: 1 })).toBe(true);
    expect(weakEvidence({ scored: 8, pass: 8, partial: 0, fail: 0 })).toBe(true);
    expect(weakEvidence({ scored: 8, pass: 6, partial: 1, fail: 1 })).toBe(false);
    expect(snapshotMetrics({ n_scorable: 0 })).toBeNull();
    const token = "A".repeat(43);
    expect(scrubShareLinks(`Report: https://app.caudals.com/share#token=${token}. Thanks`)).toBe("Report: {link}. Thanks");
  });
});
