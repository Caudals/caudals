import "server-only";

import { headers } from "next/headers";
import { defaultLocale, type Locale } from "./config";
import { PATHNAME_HEADER, splitLocale } from "./routing";

export { PATHNAME_HEADER };

/**
 * Locale for the document shell.
 *
 * The locale lives in the URL, so it is read back from the pathname. Surfaces
 * outside the public tree (`/admin`, `/auth`, the Operator Console) carry no
 * locale prefix and fall back to the default — they are English-only by
 * design and are never translated.
 */
export async function getDocumentLocale(): Promise<Locale> {
  const headerStore = await headers();
  const pathname = headerStore.get(PATHNAME_HEADER);
  if (!pathname) return defaultLocale;
  return splitLocale(pathname).locale ?? defaultLocale;
}
