import type { ReactNode } from "react";
import { CookieConsentBanner } from "@/components/legal/cookie-consent-banner";
import { FrontDoorProvider } from "@/components/public/front-door";
import { PublicDocument } from "@/components/document/public-document";
import { localeHtmlLang, type Locale } from "@/lib/i18n/config";
import { PUBLIC_SHELL_MESSAGES } from "@/lib/i18n/client-messages";
import { LocaleProvider } from "@/lib/i18n/context";
import { pickMessages } from "@/lib/i18n/messages";
import { frontDoor } from "@/lib/public/front-door";

/**
 * The public site's document and providers: `<html lang>`, the shell's
 * messages in one language (L-24b), the server-read front door (`DEMO_PUBLIC`,
 * L-04) and the cookie notice. Shared by the locale layout and the 404 page
 * for URLs that match no route (`app/global-not-found.tsx`, L-24c), which
 * pass their own font variables: next/font declarations stay in the root
 * layouts so each keeps its preloads.
 */
export function PublicRoot({ locale, fontClassName, children }: { locale: Locale; fontClassName: string; children: ReactNode }) {
  return (
    <PublicDocument lang={localeHtmlLang[locale]}>
      <LocaleProvider locale={locale} messages={pickMessages(locale, PUBLIC_SHELL_MESSAGES)}>
        <FrontDoorProvider value={frontDoor()}>
          {/* `contents` keeps the wrapper out of layout; it carries the font variables and makes Geist the default for every public page. */}
          <div className={`${fontClassName} font-mk-sans contents`}>
            {children}
            <CookieConsentBanner />
          </div>
        </FrontDoorProvider>
      </LocaleProvider>
    </PublicDocument>
  );
}
