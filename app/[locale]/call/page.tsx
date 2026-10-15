import type { Metadata } from "next";
import { CallPageContent } from "@/components/call/call-page-content";
import { ClientMessages } from "@/components/i18n/client-messages";
import { getScopedTranslator, resolveLocale } from "@/lib/i18n/server";
import { buildPublicMetadata } from "@/lib/seo";

// Public Cal.com event slug for the booking embed. Hardcoded so the page works
// in production without extra env setup; CALCOM_LINK (read at request time, no
// rebuild needed) overrides it if the event ever changes.
const DEFAULT_CAL_LINK = "caudals/call";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const locale = resolveLocale((await params).locale);
  const t = getScopedTranslator(locale, "call");

  return buildPublicMetadata({
    title: t("metaTitle"),
    description: t("metaDescription"),
    pathname: "/call",
    locale,
  });
}

export default async function CallPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = resolveLocale((await params).locale);
  const calLink =
    (process.env.CALCOM_LINK ?? process.env.NEXT_PUBLIC_CALCOM_LINK)?.trim() ||
    DEFAULT_CAL_LINK;

  return (
    <ClientMessages locale={locale} groups={["call"]}>
      <CallPageContent calLink={calLink} />
    </ClientMessages>
  );
}
