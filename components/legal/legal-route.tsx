import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/legal-page";
import { locales } from "@/lib/i18n/config";
import { resolveLocale } from "@/lib/i18n/server";
import { resolveLegalDocument } from "@/lib/legal/documents";
import { getLegalEntity } from "@/lib/legal/entity";
import { LEGAL_DOCUMENT_PATHS, type LegalDocumentId } from "@/lib/legal/versions";
import { buildPublicMetadata } from "@/lib/seo";

/**
 * Shared route plumbing for `app/[locale]/legal/*`: each page file names its
 * document and re-exports these. Only the legal notice reads the company data,
 * so it is the only page rendered per request (`dynamic = "force-dynamic"`);
 * the others are prerendered per locale.
 */
export type LegalRouteProps = { params: Promise<{ locale: string }> };

export function legalStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function legalMetadata(
  id: LegalDocumentId,
  params: LegalRouteProps["params"],
): Promise<Metadata> {
  const locale = resolveLocale((await params).locale);
  const { metaTitle, metaDescription } = resolveLegalDocument(id, locale, null);
  return buildPublicMetadata({
    title: metaTitle,
    description: metaDescription,
    pathname: LEGAL_DOCUMENT_PATHS[id],
    locale,
  });
}

export async function renderLegalPage(
  id: LegalDocumentId,
  params: LegalRouteProps["params"],
) {
  const locale = resolveLocale((await params).locale);
  const entity = id === "notice" ? getLegalEntity() : null;
  return (
    <LegalPage id={id} locale={locale} document={resolveLegalDocument(id, locale, entity)} />
  );
}
