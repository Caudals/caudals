import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/legal-page";
import { locales } from "@/lib/i18n/config";
import { resolveLocale } from "@/lib/i18n/server";
import { getLegalDocument } from "@/lib/legal/documents";
import { buildPublicMetadata } from "@/lib/seo";

const DOCUMENT = "notice" as const;
const PATHNAME = "/legal/notice";

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

type LegalPageProps = { params: Promise<{ locale: string }> };

export async function generateMetadata({
  params,
}: LegalPageProps): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale = resolveLocale(rawLocale);
  const { metaTitle, metaDescription } = getLegalDocument(DOCUMENT, locale);

  return buildPublicMetadata({
    title: metaTitle,
    description: metaDescription,
    pathname: PATHNAME,
    locale,
  });
}

export default async function Page({ params }: LegalPageProps) {
  const { locale: rawLocale } = await params;
  return <LegalPage document={DOCUMENT} locale={resolveLocale(rawLocale)} />;
}
