import { cookies, headers } from "next/headers";
import { resolveInterfaceLocale } from "@/lib/evals/interface-locale";
import { evalsClientMessages, type EvalsClientScope } from "@/lib/evals/messages/client-messages";
import { LOCALE_COOKIE } from "@/lib/evals/messages/locale-cookie";
import { EvalsMessages } from "./messages";

/**
 * Server side of `<EvalsMessages>` for a page or layout: the reader's language
 * (as the evaluation layout resolves it) and the page's scope. Pages outside
 * the signed-in app send their generated key list
 * (`scripts/i18n/evals-client-keys.ts`); the signed-in layout sends `"all"`.
 * Awaited by the page and rendered first, so the messages arrive with the
 * page's own payload, ahead of the components that read them.
 */
export async function evalsPageMessages(scope: "all" | readonly EvalsClientScope[]) {
  const locale = resolveInterfaceLocale((await cookies()).get(LOCALE_COOKIE)?.value, (await headers()).get("accept-language"));
  return <EvalsMessages locale={locale} messages={evalsClientMessages(locale, scope)} />;
}
