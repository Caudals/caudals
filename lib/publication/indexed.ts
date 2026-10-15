import "server-only";

import type { PublicResultPage } from "./contracts";
import { publicResultsIndexed } from "./flags";
import { listPublicResultPages } from "./store";

/**
 * The public results pages the sitemap and llms.txt list (launch L-31, gap
 * G3): none unless the pages are on and the founder chose to index them
 * (PUBLIC_RESULTS_INDEXED); then every live page, that is published, not
 * taken down and with its owner's consent standing (migration 114). A
 * database failure lists none rather than failing the sitemap or llms.txt.
 */
export async function indexedPublicResultPages(): Promise<PublicResultPage[]> {
  if (!publicResultsIndexed()) return [];
  try {
    return await listPublicResultPages();
  } catch (error) {
    console.error("public_result_pages_unavailable", { message: error instanceof Error ? error.message : "unknown" });
    return [];
  }
}
