import type { MessageKey } from "./en";

/**
 * The evaluation app's message lookup, without the catalogues (launch L-24c).
 *
 * Client components import `t`, `tv` and `getLocale` from here, never from
 * `./en`, which holds the English catalogue and imports the Spanish one: that
 * put both languages (464 KB, ~147 KB compressed) in one chunk on every app
 * page, sign-up included. The browser now gets one language and only the keys
 * its page reads: the server picks them (`./client-messages.ts`, generated
 * key lists in `./client-keys.ts`) and `<EvalsMessages>` registers them
 * while the page renders, before any component below it reads one.
 *
 * On the server, in tests and in the workers, importing `./en` registers both
 * full catalogues here, so `t(key, "es")` keeps working everywhere it did.
 *
 * Because the browser's messages arrive while the page renders, `t` must not
 * run when a module loads: build label tables in a function (or inside the
 * component). `tests/i18n/evals-client-messages.test.ts` fails on a call at
 * module scope in client code.
 */

export type Locale = "en" | "es";
export const LOCALES: readonly Locale[] = ["en", "es"];
export { LOCALE_COOKIE } from "./locale-cookie";

type Catalogue = Partial<Record<MessageKey, string>>;
type Store = { en: Catalogue; es: Catalogue };

/** Shared through `globalThis`: the server renders client modules in a different module graph from the layouts that register the catalogues. */
const STORE_KEY = "__CAUDALS_EVALS_MESSAGES__";
function store(): Store {
  const scope = globalThis as unknown as Record<string, Store | undefined>;
  return (scope[STORE_KEY] ??= { en: {}, es: {} });
}

/**
 * The interface language is chosen per person (cookie, else the browser's
 * Accept-Language; see interface-locale.ts) and fixed for the page
 * load: the evaluation layout puts it on window.__CAUDALS_LOCALE before any
 * bundle runs, and switching language reloads the page. Server code renders
 * English unless it passes a locale explicitly.
 */
function detectLocale(): Locale {
  if (typeof window === "undefined") return "en";
  const value = (window as unknown as { __CAUDALS_LOCALE?: string }).__CAUDALS_LOCALE;
  return value === "es" ? "es" : "en";
}
let active: Locale = detectLocale();
export function getLocale(): Locale {
  return active;
}
/** For server-side rendering in a given language (exports) and for tests. */
export function setLocale(locale: Locale) {
  active = locale;
}

/** Both full catalogues (server, tests, workers): called by `./en` when it loads. */
export function registerCatalogues(en: Catalogue, es: Catalogue) {
  const current = store();
  current.en = en;
  current.es = es;
}

/** Adds the messages a page sent, in its language (browser; `<EvalsMessages>`). */
export function registerMessages(locale: Locale, messages: Catalogue) {
  const current = store();
  current[locale] = { ...current[locale], ...messages };
}

/** Clears the registered messages (tests only). */
export function resetMessagesForTests(next: Partial<Store> = {}) {
  const current = store();
  current.en = next.en ?? {};
  current.es = next.es ?? {};
}

const reported = new Set<string>();
function missing(key: MessageKey, locale: Locale): string {
  if (process.env.NODE_ENV !== "production" && !reported.has(`${locale}:${key}`)) {
    reported.add(`${locale}:${key}`);
    console.error(
      `Missing evals message "${key}": the page did not send it. Regenerate the key lists with \`npm run i18n:evals-client-keys\` or send it with <EvalsMessages> (lib/evals/messages/runtime.ts).`,
    );
  }
  return key;
}

export function t(key: MessageKey, locale: Locale = active): string {
  const { en, es } = store();
  return (locale === "es" && es[key]) || en[key] || missing(key, locale);
}
/** A message with {name} placeholders filled in. */
export function tv(key: MessageKey, values: Record<string, string | number>, locale: Locale = active): string {
  return t(key, locale).replace(/\{(\w+)\}/g, (match, name: string) => (name in values ? String(values[name]) : match));
}
export type { MessageKey };
