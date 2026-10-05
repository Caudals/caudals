import type { Metadata } from "next";
import { DemoShell } from "@/components/demo/demo-shell";
import { getScopedTranslator, resolveLocale } from "@/lib/i18n/server";
import { buildPublicMetadata } from "@/lib/seo";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const locale = resolveLocale((await params).locale);
  const t = getScopedTranslator(locale, "demo");

  // Soft launch: reachable by direct link, not yet linked or indexed.
  return buildPublicMetadata({
    title: t("metaTitle"),
    description: t("metaDescription"),
    pathname: "/demo",
    locale,
    noIndex: true,
  });
}

/** The free test. A run's private link carries its token in the fragment, so this page stays static. */
export default function DemoRoute() {
  return <DemoShell />;
}
