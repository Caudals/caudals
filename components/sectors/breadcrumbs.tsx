"use client";

import { LocaleLink as Link } from "@/components/i18n/locale-link";
import { useTranslations } from "@/lib/i18n/context";

/**
 * Visible breadcrumb trail. It mirrors the page's `BreadcrumbList` structured
 * data, so search results and the page show the same path.
 */
export function Breadcrumbs({ items }: { items: readonly { label: string; href?: string }[] }) {
  const t = useTranslations("sectors");

  return (
    <nav className="lp-wrap lp-crumbs" aria-label={t("breadcrumbLabel")}>
      <ol>
        {items.map((item, index) => (
          <li key={item.label}>
            {item.href && index < items.length - 1 ? (
              <Link href={item.href}>{item.label}</Link>
            ) : (
              <span aria-current="page">{item.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
