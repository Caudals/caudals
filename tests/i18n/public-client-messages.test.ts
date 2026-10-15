/**
 * Launch L-24b: the public site sends its client components only the message
 * groups they read (`PUBLIC_SHELL_MESSAGES` in the layout, `ClientMessages`
 * next to each island). These render the public pages with exactly those
 * subsets, as the server does, and fail on any key a client component asked
 * for that the page did not send: it would show as the raw key.
 */
import { createElement, type FunctionComponent, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/en",
  useRouter: () => ({ push() {}, replace() {}, refresh() {}, prefetch() {} }),
  useSearchParams: () => new URLSearchParams(),
}));

import NotFound from "@/app/[locale]/not-found";
import { DemoShell } from "@/components/demo/demo-shell";
import { HomePage } from "@/components/landing/home-page";
import { FrontDoorProvider } from "@/components/public/front-door";
import { SectorPageContent } from "@/components/sectors/sector-page";
import { SectorsHub } from "@/components/sectors/sectors-hub";
import { PUBLIC_SHELL_MESSAGES } from "@/lib/i18n/client-messages";
import { locales, type Locale } from "@/lib/i18n/config";
import { LocaleProvider } from "@/lib/i18n/context";
import en from "@/lib/i18n/messages/en.json";
import { pickMessages, type PartialMessages } from "@/lib/i18n/messages";
import { SECTOR_IDS, sectorPath } from "@/lib/public/sectors";
import { getSectorCopy } from "@/lib/sectors/content";

const Provider = LocaleProvider as FunctionComponent<{ locale: Locale; messages: PartialMessages; children?: ReactNode }>;
const Door = FrontDoorProvider as FunctionComponent<{ value: { demoPublic: boolean; signInUrl: string }; children?: ReactNode }>;

/** Renders a page inside the public layout's providers, with the layout's shell messages only. */
function render(locale: Locale, demoPublic: boolean, page: ReactNode) {
  return renderToStaticMarkup(
    createElement(
      Provider,
      { locale, messages: pickMessages(locale, PUBLIC_SHELL_MESSAGES) },
      createElement(Door, { value: { demoPublic, signInUrl: "https://app.caudals.com/workspace/sign-in" } }, page),
    ),
  );
}

/** A dotted message key left on the page, in text or in an attribute. */
const RAW_KEY = new RegExp(`\\b(?:${Object.keys(en).join("|")})\\.[a-zA-Z]`);

let missing: string[] = [];
beforeEach(() => {
  missing = [];
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    const message = String(args[0]);
    if (message.startsWith("Missing message")) missing.push(message);
  });
});
afterEach(() => vi.restoreAllMocks());

function related(locale: Locale, except?: string) {
  return SECTOR_IDS.filter((id) => id !== except).map((id) => {
    const copy = getSectorCopy(id, locale);
    return { id, name: copy.name, summary: copy.summary, audience: copy.audience, href: sectorPath(id) };
  });
}

describe("public pages send their client components every message they read", () => {
  for (const locale of locales) {
    for (const demoPublic of [true, false]) {
      const label = `${locale}, DEMO_PUBLIC=${demoPublic}`;

      it(`landing (${label})`, () => {
        const html = render(locale, demoPublic, createElement(HomePage, { locale, demoPublic }));
        expect(missing).toEqual([]);
        expect(html).not.toMatch(RAW_KEY);
      });

      it(`demo (${label})`, () => {
        const html = render(locale, demoPublic, createElement(DemoShell, { locale }));
        expect(missing).toEqual([]);
        expect(html).not.toMatch(RAW_KEY);
      });

      it(`sector page and hub (${label})`, () => {
        for (const sectorId of SECTOR_IDS) {
          const html = render(
            locale,
            demoPublic,
            createElement(SectorPageContent, {
              locale,
              demoPublic,
              sectorId,
              copy: getSectorCopy(sectorId, locale),
              related: related(locale, sectorId),
            }),
          );
          expect(html, sectorId).not.toMatch(RAW_KEY);
        }
        const hub = render(locale, demoPublic, createElement(SectorsHub, { locale, demoPublic, sectors: related(locale) }));
        expect(missing).toEqual([]);
        expect(hub).not.toMatch(RAW_KEY);
      });

      it(`404 view, kept ready on every page (${label})`, () => {
        const html = render(locale, demoPublic, createElement(NotFound));
        expect(missing).toEqual([]);
        expect(html).not.toMatch(RAW_KEY);
      });
    }
  }

  it("send one language only", () => {
    const shell = JSON.stringify(pickMessages("es", PUBLIC_SHELL_MESSAGES));
    expect(shell).toContain("Contacto");
    expect(shell).not.toContain('"Contact"');
  });
});
