import type { Metadata } from "next";
import { DemoShell } from "@/components/demo/demo-shell";
import { getScopedTranslator, resolveLocale } from "@/lib/i18n/server";
import { demoPublicEnabled } from "@/lib/public/front-door";
import { buildPublicMetadata } from "@/lib/seo";

// Rendered per request, so its robots tag always follows the runtime flag. A
// prerendered copy would carry the image build's flag-off `noindex` for up to
// one revalidation window after every deploy, and a crawler could drop the page.
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const locale = resolveLocale((await params).locale);
  const t = getScopedTranslator(locale, "demo");

  // Indexed once DEMO_PUBLIC makes the free test the front door (launch L-04);
  // until then it is reachable by direct link only. The share card is the
  // sibling opengraph-image.tsx.
  return buildPublicMetadata({
    title: t("metaTitle"),
    description: t("metaDescription"),
    pathname: "/demo",
    locale,
    noIndex: !demoPublicEnabled(),
  });
}

/** The free test. A run's private link carries its token in the fragment, never in the request. */
export default async function DemoRoute({ params }: { params: Promise<{ locale: string }> }) {
  const locale = resolveLocale((await params).locale);
  return <DemoShell locale={locale} />;
}
