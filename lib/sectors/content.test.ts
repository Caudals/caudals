import { describe, expect, it } from "vitest";
import en from "@/content/sectors/en.json";
import es from "@/content/sectors/es.json";
import { EXPERT_ROLE_ICONS } from "@/components/sectors/expert-icons";
import { SECTOR_IDS } from "@/lib/public/sectors";

const DATASET_KINDS = ["exams", "qa", "docs", "reasoning", "preferences"];
const CAUSES = ["invented", "outdated", "wrongSource", "gap", "outOfScope"];

describe.each([
  ["en", en],
  ["es", es],
] as const)("sector content (%s)", (_locale, content) => {
  it("covers every sector and nothing else", () => {
    expect(Object.keys(content).sort()).toEqual([...SECTOR_IDS].sort());
  });

  it.each(SECTOR_IDS)("%s is complete", (id) => {
    const copy = content[id];
    // One word is marked for the serif italic, as on the landing.
    expect(copy.headline).toMatch(/\*[^*]+\*/);
    expect(copy.metaDescription.length).toBeLessThanOrEqual(200);
    expect(Object.keys(copy.failures.examples).sort()).toEqual([...CAUSES].sort());
    expect(copy.faq.length).toBeGreaterThanOrEqual(4);
    for (const role of copy.experts.roles) {
      expect(Object.keys(EXPERT_ROLE_ICONS)).toContain(role.icon);
    }
    for (const dataset of copy.experts.datasets) {
      expect(DATASET_KINDS).toContain(dataset.kind);
    }
  });

  it("never claims certification, audit or compliance", () => {
    const text = JSON.stringify(content).toLowerCase();
    // "It gives you evidence, not a certificate" is the only permitted mention.
    for (const [match] of text.matchAll(/.{0,4}certific[a-z]*/g)) {
      expect(match).toMatch(/^.*(a certificate|un certificado)$/);
    }
    for (const phrase of ["compliant", "auditor", "auditoría", "certify"]) {
      expect(text).not.toContain(phrase);
    }
  });
});
