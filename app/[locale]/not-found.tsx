"use client";

import { NotFoundView } from "@/components/public/not-found-view";
import { useTranslations } from "@/lib/i18n/context";

/**
 * The localized 404 when a public page calls `notFound()` (an unknown
 * results page or sector-index quarter). A URL that matches no page at all is
 * answered by `app/global-not-found.tsx`, rendered on the server (L-24c).
 */
export default function NotFound() {
  const t = useTranslations("notFound");
  return (
    <>
      <title>{`${t("metaTitle")} | Caudals`}</title>
      <meta name="robots" content="noindex" />
      <NotFoundView />
    </>
  );
}
