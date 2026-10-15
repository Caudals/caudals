import { LOCALE_COOKIE as APP_LOCALE_COOKIE } from "@/lib/evals/messages/locale-cookie";
import { defaultLocale, isLocale, LOCALE_COOKIE, type Locale } from "@/lib/i18n/config";
import { matchAcceptLanguage } from "@/lib/i18n/negotiate";
import { splitLocale } from "@/lib/i18n/routing";

type RequestLike = {
  /** The path the proxy saw (`x-caudals-pathname`), when it ran. */
  pathname: string | null | undefined;
  cookie: (name: string) => string | undefined;
  acceptLanguage: string | null | undefined;
};

/**
 * Language of the 404 for a URL that matches no page (`app/global-not-found.tsx`,
 * launch L-24c), which gets no route params. A public path carries its locale
 * (`/es/lo-que-sea`); an app path (`/workspace/nada`) uses the reader's app
 * language, then the site's, then the browser's.
 */
export function notFoundLocale({ pathname, cookie, acceptLanguage }: RequestLike): Locale {
  const fromPath = pathname ? splitLocale(pathname).locale : null;
  if (fromPath) return fromPath;
  for (const name of [APP_LOCALE_COOKIE, LOCALE_COOKIE]) {
    const value = cookie(name);
    if (isLocale(value)) return value;
  }
  return matchAcceptLanguage(acceptLanguage) ?? defaultLocale;
}
