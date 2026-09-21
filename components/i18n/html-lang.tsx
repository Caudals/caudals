import { localeHtmlLang, type Locale } from "@/lib/i18n/config";
import { HtmlLangSync } from "@/components/i18n/html-lang-sync";

/**
 * Sets `<html lang>` to the language of the page being served.
 *
 * The root layout owns the `<html>` element and is shared with the internal
 * surfaces (`/admin`, `/auth`), so it cannot resolve the locale without
 * reading the request — which would opt every route, including the marketing
 * pages, out of static rendering. Instead the document opens in the default
 * language and the locale subtree corrects the attribute here.
 *
 * Two mechanisms, because the two navigation paths differ:
 *
 *  - the inline script is part of the served HTML and runs while the document
 *    is parsing, so a fresh page load has the right `lang` before it paints;
 *  - `HtmlLangSync` re-applies it after a client-side navigation between
 *    languages, which swaps the page content without re-running that script.
 *
 * Crawlers do not depend on either: the language of each page is declared
 * authoritatively in its metadata — a self-referencing canonical, a full
 * `hreflang` set including `x-default`, and `og:locale`.
 */
export function HtmlLang({ locale }: { locale: Locale }) {
  const lang = localeHtmlLang[locale];

  return (
    <>
      <script
        // `lang` comes from our own closed locale list, never from user input.
        dangerouslySetInnerHTML={{
          __html: `document.documentElement.lang=${JSON.stringify(lang)}`,
        }}
      />
      <HtmlLangSync lang={lang} />
    </>
  );
}
