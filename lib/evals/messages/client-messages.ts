import "server-only";
import { messages, type Locale, type MessageKey } from "./en";
import { es } from "./es";
import { EVALS_CLIENT_KEYS, type EvalsClientScope } from "./client-keys";

export type { EvalsClientScope };
type ClientMessages = Partial<Record<MessageKey, string>>;

const ALL_KEYS = Object.keys(messages) as MessageKey[];
const cache = new Map<string, ClientMessages>();

/**
 * The messages a page sends to the browser, in one language (launch L-24c):
 * every key for the signed-in app (`"all"`), or the generated lists of the
 * pages a person opens without an account (`./client-keys.ts`). Spanish falls
 * back to English per key, as `t` does. Rendered by `<EvalsMessages>`, they
 * travel in the page's RSC payload; the catalogues stay on the server.
 */
export function evalsClientMessages(locale: Locale, scope: "all" | readonly EvalsClientScope[]): ClientMessages {
  const id = `${locale}:${scope === "all" ? scope : scope.join(",")}`;
  let picked = cache.get(id);
  if (!picked) {
    const keys: readonly MessageKey[] = scope === "all" ? ALL_KEYS : scope.flatMap((name) => EVALS_CLIENT_KEYS[name]);
    picked = {};
    for (const key of keys) picked[key] = (locale === "es" && es[key]) || messages[key];
    cache.set(id, picked);
  }
  return picked;
}
