import "server-only";
import type { Locale } from "@/lib/evals/messages/en";
import type { HelpIndex } from "./articles";
import en from "./generated/en.json";
import es from "./generated/es.json";

/** The help articles in one language, for server-rendered help pages (launch L-20). */
export function helpIndexFor(locale: Locale): HelpIndex {
  return (locale === "es" ? es : en) as unknown as HelpIndex;
}
