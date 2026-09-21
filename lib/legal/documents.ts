import en from "@/content/legal/en.json";
import es from "@/content/legal/es.json";
import type { Locale } from "@/lib/i18n/config";

/**
 * Long-form legal copy, one file per locale.
 *
 * These documents are prose, not UI strings: they are revised by their own
 * review cycle and are far longer than anything in the message files, so they
 * live in `content/legal/` next to the blog content rather than mixed in with
 * button labels. `en.json` defines the shape; `es.json` is checked against it.
 */

export type LegalDocumentId = keyof typeof en;

export type LegalDocument = {
  /** Heading shown on the page. */
  title: string;
  /** Standfirst under the heading. */
  description: string;
  /** `<title>` for search results. */
  metaTitle: string;
  metaDescription: string;
  sections: readonly { title: string; body: string }[];
};

const documents: Record<Locale, Record<LegalDocumentId, LegalDocument>> = {
  en,
  es: es satisfies typeof en,
};

export function getLegalDocument(
  id: LegalDocumentId,
  locale: Locale,
): LegalDocument {
  return documents[locale][id] ?? documents.en[id];
}
