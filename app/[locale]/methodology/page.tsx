import type { Metadata } from "next";
import { MethodologyPage } from "@/components/methodology/methodology-page";
import { locales } from "@/lib/i18n/config";
import { resolveLocale } from "@/lib/i18n/server";
import { METHODOLOGY_PATH, methodologyCopy } from "@/lib/methodology/content";
import { buildPublicMetadata } from "@/lib/seo";

type Props = { params: Promise<{ locale: string }> };

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = resolveLocale((await params).locale);
  const copy = methodologyCopy(locale);
  return buildPublicMetadata({ title: copy.metaTitle, description: copy.metaDescription, pathname: METHODOLOGY_PATH, locale });
}

/** How Caudals writes, grades and reviews tests (launch L-20, P-40); `/es/metodologia`. */
export default async function MethodologyRoute({ params }: Props) {
  const locale = resolveLocale((await params).locale);
  return <MethodologyPage locale={locale} />;
}
