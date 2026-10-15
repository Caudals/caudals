import { createElement, type FunctionComponent, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, describe, expect, it } from "vitest";
import { DemoDisclosure } from "@/components/demo/disclosure";
import { AiDisclosureEvidence } from "@/components/evals/ai-disclosure-evidence";
import { LocaleProvider } from "@/lib/i18n/context";
import { getMessages, type PartialMessages } from "@/lib/i18n/messages";
import enPublic from "@/lib/i18n/messages/en.json";
import esPublic from "@/lib/i18n/messages/es.json";
import { messages as enApp, setLocale } from "@/lib/evals/messages/en";
import { es as esApp } from "@/lib/evals/messages/es";
import {
  DISCLOSURE_REASONS,
  disclosureTurn,
  OPENING_MESSAGE,
  PERSON_QUESTION,
  type DisclosureResult,
  type DisclosureStatus,
} from "@/lib/evals/scoring/disclosure";

/**
 * The AI-disclosure copy (launch L-29): evidence for the owner's own
 * assessment, never a legal determination. The rendered demo and product
 * report sections, in English and Spanish, for every status and reason, never
 * say "compliant", "compliance verdict" or "certified" (or their Spanish
 * equivalents), and always carry the evidence sentence.
 */
const FORBIDDEN = /complian|certif|conformity|conforme|conformidad|cumplimiento|cumple con|homologad|aprobad[oa] por/i;
const EVIDENCE_LINE = {
  en: "Evidence for your own assessment, not a legal determination.",
  es: "Evidencia para tu propia valoración, no una determinación legal.",
};

function result(status: DisclosureStatus, reason: DisclosureResult["reason"], language: "en" | "es"): DisclosureResult {
  return {
    version: 1, status, reason, method: reason === "judge" ? "judge" : "pattern", language, checked_at: "2026-10-12T10:00:00.000Z", scored: false,
    evidence: status === "unclear" ? null : { turn: "person_answer", quote: language === "es" ? "Soy el asistente virtual." : "I'm the virtual assistant." },
    transcript: [
      disclosureTurn("greeting", language === "es" ? "¡Hola! ¿En qué te ayudo?" : "Hi! How can I help?"),
      disclosureTurn("opening", OPENING_MESSAGE[language]),
      disclosureTurn("first_reply", language === "es" ? "Puedo ayudarte con tu póliza." : "I can help with your policy."),
      disclosureTurn("person_question", PERSON_QUESTION[language]),
      disclosureTurn("person_answer", "", reason === "not_captured" ? "no_reply" : null),
    ],
  };
}

const COMBINATIONS: Array<[DisclosureStatus, DisclosureResult["reason"]]> = [
  ["disclosed", "self_identified"], ["disclosed", "denied_being_human"], ["disclosed", "judge"],
  ["not_disclosed", "claimed_human"], ["not_disclosed", "judge"],
  ["unclear", "conflicting"], ["unclear", "no_signal"], ["unclear", "not_captured"], ["unclear", "judge"],
];

const Provider = LocaleProvider as FunctionComponent<{ locale: "en" | "es"; messages: PartialMessages; children?: ReactNode }>;
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/\s+/g, " ");

describe("AI-disclosure copy, rendered in both languages", () => {
  afterAll(() => setLocale("en"));

  for (const language of ["en", "es"] as const) {
    it(`never claims compliance or certification on the demo report (${language})`, () => {
      for (const [status, reason] of COMBINATIONS) {
        const html = renderToStaticMarkup(createElement(Provider, { locale: language, messages: getMessages(language) }, createElement(DemoDisclosure, { result: result(status, reason, language) })));
        const copy = text(html);
        expect(copy, `${status}/${reason}`).not.toMatch(FORBIDDEN);
        expect(copy).toContain(EVIDENCE_LINE[language]);
        expect(copy).not.toMatch(/\b(?:demo|disclosure|report)\.[a-z]/);
      }
    });

    it(`never claims compliance or certification on the product report (${language})`, () => {
      setLocale(language);
      for (const [status, reason] of COMBINATIONS) {
        const copy = text(renderToStaticMarkup(createElement(AiDisclosureEvidence, { result: result(status, reason, language) })));
        expect(copy, `${status}/${reason}`).not.toMatch(FORBIDDEN);
        expect(copy).toContain(EVIDENCE_LINE[language]);
        expect(copy).not.toMatch(/aiDisclosure[A-Z]/);
      }
    });
  }

  it("has every string in English and Spanish, and none of them claims compliance", () => {
    const publicEn = (enPublic as { demo: { disclosure: Record<string, unknown> } }).demo.disclosure;
    const publicEs = (esPublic as { demo: { disclosure: Record<string, unknown> } }).demo.disclosure;
    expect(JSON.stringify(publicEn)).not.toMatch(FORBIDDEN);
    expect(JSON.stringify(publicEs)).not.toMatch(FORBIDDEN);
    expect(Object.keys(publicEs)).toEqual(Object.keys(publicEn));
    const keys = Object.keys(enApp).filter((key) => key.startsWith("aiDisclosure"));
    expect(keys.length).toBeGreaterThan(20);
    for (const key of keys) {
      const english = enApp[key as keyof typeof enApp];
      const spanish = esApp[key as keyof typeof esApp];
      expect(spanish, key).toBeTruthy();
      expect(spanish).not.toBe(english);
      expect(`${english} ${spanish}`).not.toMatch(FORBIDDEN);
    }
    // Every stored reason has a sentence.
    for (const reason of DISCLOSURE_REASONS) if (reason !== "judge") expect(Object.keys((publicEn as { reason: Record<string, string> }).reason)).toContain(reason);
  });
});
