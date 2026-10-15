import type { ReactNode } from "react";
import { CookieConsentBanner } from "@/components/legal/cookie-consent-banner";
import { FrontDoorProvider } from "@/components/public/front-door";
import { LinkOriginProvider } from "@/components/i18n/locale-link";
import { PublicDocument } from "@/components/document/public-document";
import { LATE_FONTS_SRC } from "@/components/document/late-fonts";
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
 * layouts so each keeps its preloads. On the app host the 404 passes the
 * public origin, so every public link on it (the cookie notice's included)
 * leaves for the public site.
 */
export function PublicRoot({
  locale,
  fontClassName,
  linkOrigin = "",
  children,
}: {
  locale: Locale;
  fontClassName: string;
  /** The public site's origin when this page is served on the app host (the 404), so its links and the cookie notice's leave for it. */
  linkOrigin?: string;
  children: ReactNode;
}) {
  return (
    <PublicDocument lang={localeHtmlLang[locale]}>
      <LocaleProvider locale={locale} messages={pickMessages(locale, PUBLIC_SHELL_MESSAGES)}>
        <FrontDoorProvider value={frontDoor()}>
          {/* Hoisted into the head; sets `data-fonts` after the first paint, so Newsreader and Geist Mono load then (late-fonts.ts). */}
          <script async src={LATE_FONTS_SRC} />
          {/* `contents` keeps the wrapper out of layout; it carries the font variables and makes Geist the default for every public page. `mk-font-gate` holds Newsreader and Geist Mono back until the first paint (globals.css). */}
          <div className={`${fontClassName} font-mk-sans mk-font-gate contents`}>
            <LinkOriginProvider origin={linkOrigin}>
              {children}
              <CookieConsentBanner />
            </LinkOriginProvider>
          </div>
        </FrontDoorProvider>
      </LocaleProvider>
    </PublicDocument>
  );
}
