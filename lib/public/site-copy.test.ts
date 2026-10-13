import { describe, expect, it } from "vitest";
import en from "@/lib/i18n/messages/en.json";
import es from "@/lib/i18n/messages/es.json";
import { funnelLinkEvent } from "@/lib/analytics/funnel-links";
import { localizePathname } from "@/lib/i18n/routing";
import { PILOT_REQUEST_PATH, sectorPilotRequestPath } from "@/lib/public/pilot-request";

/**
 * Launch L-30: the public site sells the self-serve path. Step 1 and the FAQ
 * name the free test, the price answer follows D-06 (free test and account,
 * pay as you go in the app, pilots quoted, no numbers), and pilot requests
 * reach the five-field form.
 */
const copy = {
  en: { messages: en, freeTest: /free test/i, account: /account is free/i, payg: /pay as you go with credits in the app/i, quote: /fixed price that we quote/i },
  es: { messages: es, freeTest: /prueba gratuita/i, account: /cuenta también es gratuita/i, payg: /pagas por uso con créditos en la aplicación/i, quote: /precio cerrado que te presupuestamos/i },
} as const;

describe.each(Object.entries(copy))("public site copy (%s)", (_locale, { messages, freeTest, account, payg, quote }) => {
  it("mentions the free test in step 1 and in the access answer", () => {
    expect(messages.steps.how.description).toMatch(freeTest);
    expect(messages.faq.access.a).toMatch(freeTest);
  });

  it("answers the price question without numbers (D-06)", () => {
    const answer = messages.faq.cost.a;
    for (const pattern of [freeTest, account, payg, quote]) expect(answer).toMatch(pattern);
    expect(answer).not.toMatch(/€|\bEUR\b|\$|\d+\s?(euros?|credits?|créditos)/i);
    expect(answer).not.toMatch(/48/);
  });

  it("keeps the contact form for pilots with a way to try it yourself", () => {
    expect(messages.contact.tryYourself).toBeTruthy();
    expect(messages.contact.runFreeTest).toBeTruthy();
    expect(messages.contact.title.toLowerCase()).toMatch(/pilot|piloto/);
    expect(messages.cta.pilotLink.toLowerCase()).toMatch(/pilot|piloto/);
  });

  it("gives the call page a three-line agenda and a confirmation", () => {
    for (const key of ["agenda1", "agenda2", "agenda3", "confirmedTitle", "confirmedWhen", "confirmedInvite"] as const) {
      expect(messages.call[key].length).toBeGreaterThan(5);
    }
    expect(messages.call.confirmedWhen).toContain("{date}");
  });

  it("never claims certification or compliance", () => {
    const text = JSON.stringify([messages.faq, messages.steps.how, messages.contact, messages.call, messages.cta, messages.footer, messages.notFound]);
    expect(text).not.toMatch(/\b(certified|compliant|certificad[oa]s?|conforme con)\b/i);
  });
});

describe("pilot request links", () => {
  it("open the form with the pilot and, from a sector page, the sector chosen", () => {
    expect(PILOT_REQUEST_PATH).toBe("/contact?offer=pilot-evaluation");
    expect(sectorPilotRequestPath("insurance")).toBe("/contact?offer=pilot-evaluation&sector=insurance");
  });

  it("count as pilot requests in both languages", () => {
    for (const locale of ["en", "es"] as const) {
      expect(funnelLinkEvent(localizePathname("/contact", locale))).toBe("pilot_requested");
    }
  });
});
