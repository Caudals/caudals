import en from "@/content/legal/en.json";
import es from "@/content/legal/es.json";
import type { Locale } from "@/lib/i18n/config";
import type { LegalEntity } from "./entity";
import type { LegalDocumentId } from "./versions";

export type { LegalDocumentId } from "./versions";

/**
 * Long-form legal copy, one file per locale.
 *
 * These documents are prose, not UI strings: they are revised by their own
 * review cycle and are far longer than anything in the message files, so they
 * live in `content/legal/` next to the blog content rather than mixed in with
 * button labels. `en.json` defines the shape; `es.json` is checked against it,
 * and `documents.test.ts` checks completeness, parity and placeholders.
 *
 * Text is plain: email addresses and `https://` URLs are linked when rendered.
 * The legal notice's `{entity}` paragraph is filled at request time from the
 * company data (`./entity.ts`), never from this file.
 */

export type LegalLink = { label: string; href: string };

export type LegalTable = {
  columns: readonly string[];
  rows: readonly (readonly string[])[];
};

export type LegalSection = {
  /** Anchor for the section, stable across locales. */
  id: string;
  title: string;
  /** Paragraphs before the list or table. */
  body?: readonly string[];
  items?: readonly string[];
  table?: LegalTable;
  /** Paragraphs after the list. */
  after?: readonly string[];
  /** Related legal pages, by internal path. */
  links?: readonly LegalLink[];
  /** Renders the DPA template downloads after the section. */
  download?: boolean;
};

export type LegalDocument = {
  /** Heading shown on the page. */
  title: string;
  /** Standfirst under the heading. */
  description: string;
  /** `<title>` for search results. */
  metaTitle: string;
  metaDescription: string;
  sections: readonly LegalSection[];
};

/** Sentences naming the company, with `{name}`, `{nif}`, `{address}`, `{registry}` slots. */
export type EntityCopy = { registered: string; registry: string; pending: string };

export type DpaTemplateCopy = {
  title: string;
  subtitle: string;
  intro: readonly string[];
  partiesTitle: string;
  customerTitle: string;
  processorTitle: string;
  partyFields: readonly string[];
  processorRegistered: string;
  clauses: readonly { title: string; body: readonly string[] }[];
  annexes: readonly {
    title: string;
    body?: readonly string[];
    items?: readonly string[];
    subprocessors?: boolean;
  }[];
  signaturesTitle: string;
  signatureFields: readonly string[];
  customerSignature: string;
  processorSignature: string;
  versionLabel: string;
};

type LegalContent = Record<Exclude<LegalDocumentId, "notice">, LegalDocument> & {
  notice: LegalDocument & { entity: EntityCopy };
  dpaTemplate: DpaTemplateCopy;
};

const content: Record<Locale, LegalContent> = {
  en: en satisfies LegalContent,
  es: es satisfies typeof en,
};

/** Token in the legal notice replaced by the company sentence. */
export const ENTITY_TOKEN = "{entity}";

export function getLegalContent(locale: Locale): LegalContent {
  return content[locale] ?? content.en;
}

/**
 * A document as stored, with the legal notice's company paragraph still a
 * token. Use `resolveLegalDocument` for anything a visitor reads.
 */
export function getLegalDocument(
  id: LegalDocumentId,
  locale: Locale,
): LegalDocument {
  return getLegalContent(locale)[id];
}

function fill(template: string, entity: LegalEntity) {
  return template
    .replaceAll("{name}", entity.name)
    .replaceAll("{nif}", entity.nif)
    .replaceAll("{address}", entity.address)
    .replaceAll("{registry}", entity.registry ?? "");
}

/** The sentence that names the company, or says its details follow on registration. */
export function describeEntity(locale: Locale, entity: LegalEntity | null): string {
  const copy = getLegalContent(locale).notice.entity;
  if (!entity) return copy.pending;
  const registered = fill(copy.registered, entity);
  return entity.registry ? `${registered} ${fill(copy.registry, entity)}` : registered;
}

/** The document as published: the `{entity}` paragraph is replaced. */
export function resolveLegalDocument(
  id: LegalDocumentId,
  locale: Locale,
  entity: LegalEntity | null,
): LegalDocument {
  const document = getLegalDocument(id, locale);
  if (id !== "notice") return document;
  const sentence = describeEntity(locale, entity);
  return {
    ...document,
    sections: document.sections.map((section) => ({
      ...section,
      body: section.body?.map((paragraph) =>
        paragraph === ENTITY_TOKEN ? sentence : paragraph,
      ),
    })),
  };
}
