import { describe, expect, it } from "vitest";
import en from "@/lib/i18n/messages/en.json";
import es from "@/lib/i18n/messages/es.json";
import { messages as appEn } from "@/lib/evals/messages/en";
import { es as appEs } from "@/lib/evals/messages/es";

/**
 * The wording of the public results pages, the anonymous index and the
 * owner's consent (launch L-31). Nothing may read as a certification: no
 * "certified", "compliant", badge, seal or endorsement, in English or
 * Spanish; certification and conformity are only ever named to deny them.
 */
const FORBIDDEN = /\b(certified|compliant|compliance|certificad[oa]s?|homologad[oa]s?|conforme|cumple|cumplimiento|badge|seal|sello|insignia|guarantee[sd]?|garantiza|endorsed|avalad[oa]|approved by|aprobad[oa] por|verified|verificad[oa])\b/i;
const NAMED_ONLY_TO_DENY = /certif|conformi/i;
const NEGATION = /\b(not|never|no|nunca|ni)\b/i;

function strings(tree: unknown, path = ""): Array<[string, string]> {
  if (typeof tree === "string") return [[path, tree]];
  return Object.entries(tree as Record<string, unknown>).flatMap(([key, value]) => strings(value, path ? `${path}.${key}` : key));
}

const publicCopy = [
  ...strings({ publicResults: en.publicResults, sectorIndex: en.sectorIndex }),
  ...strings({ publicResults: es.publicResults, sectorIndex: es.sectorIndex }).map(([path, text]) => [`es:${path}`, text] as [string, string]),
];
const consentCopy = [
  ...Object.entries(appEn).filter(([key]) => /^pr[A-Z]/.test(key)),
  ...Object.entries(appEs).filter(([key]) => /^pr[A-Z]/.test(key)).map(([key, text]) => [`es:${key}`, text ?? ""] as [string, string]),
];

describe("public results wording (launch L-31)", () => {
  it("has every public string in English and Spanish", () => {
    const english = strings({ publicResults: en.publicResults, sectorIndex: en.sectorIndex }).map(([path]) => path);
    const spanish = strings({ publicResults: es.publicResults, sectorIndex: es.sectorIndex }).map(([path]) => path);
    expect(spanish).toEqual(english);
    expect(english.length).toBeGreaterThanOrEqual(80);
  });

  it("has every consent string in English and Spanish", () => {
    const keys = Object.keys(appEn).filter((key) => /^pr[A-Z]/.test(key));
    expect(keys.length).toBeGreaterThan(40);
    for (const key of keys) expect(appEs[key as keyof typeof appEs], key).toBeTruthy();
  });

  it("never says certified, compliant, badge or seal, and names certification only to deny it", () => {
    for (const [path, text] of [...publicCopy, ...consentCopy]) {
      expect(text, path).not.toMatch(FORBIDDEN);
      if (NAMED_ONLY_TO_DENY.test(text)) expect(text, path).toMatch(NEGATION);
    }
  });

  it("states the limits, the consent and the revocation on every surface", () => {
    expect(en.publicResults.limitEvidence).toMatch(/not a certification, an audit or a conformity assessment/);
    expect(es.publicResults.limitEvidence).toMatch(/no una certificación, una auditoría ni una evaluación de la conformidad/);
    expect(en.publicResults.limitConsent).toMatch(/withdraw it at any time/);
    expect(es.publicResults.limitConsent).toMatch(/retirarla en cualquier momento/);
    expect(en.sectorIndex.methodCohort).toContain("{minCohort}");
    expect(en.sectorIndex.methodNames).toMatch(/No company, product, assistant, website or question is named/);
    expect(es.sectorIndex.methodNames).toMatch(/No se nombra ni se describe ninguna empresa/);
    expect(appEn.prConsentLimits).toMatch(/not a certification/);
    expect(appEs.prConsentLimits).toMatch(/no una certificación/);
    expect(appEn.prConsentRevoke).toMatch(/withdrawn at any time/);
    expect(appEs.prConsentRevoke).toMatch(/retirar en cualquier momento/);
    expect(appEn.prIntro).toMatch(/Nothing is published until Caudals has reviewed the page by hand/);
  });

  it("keeps the same placeholders in both languages", () => {
    const slots = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort().join();
    const spanish = new Map(strings({ publicResults: es.publicResults, sectorIndex: es.sectorIndex }));
    for (const [path, text] of strings({ publicResults: en.publicResults, sectorIndex: en.sectorIndex })) expect(slots(spanish.get(path)!), path).toBe(slots(text));
    for (const [key, text] of Object.entries(appEn).filter(([name]) => /^pr[A-Z]/.test(name))) expect(slots(appEs[key as keyof typeof appEs] ?? ""), key).toBe(slots(text));
  });
});
