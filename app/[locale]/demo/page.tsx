import type { Metadata } from "next";
import { DemoShell } from "@/components/demo/demo-shell";
import { getScopedTranslator, resolveLocale } from "@/lib/i18n/server";
import { demoPublicEnabled } from "@/lib/public/front-door";
import { buildPublicMetadata } from "@/lib/seo";

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

/** The free test. A run's private link carries its token in the fragment, so this page stays static. */
export default function DemoRoute() {
  return <DemoShell />;
}
