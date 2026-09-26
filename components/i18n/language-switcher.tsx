"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { locales, localeLabels, localeShortLabels } from "@/lib/i18n/config";
import { useLocale, useTranslations } from "@/lib/i18n/context";
import { switchLocalePathname } from "@/lib/i18n/routing";
import { rememberLocale } from "@/lib/i18n/set-locale-cookie";
import { cn } from "@/lib/utils";

/**
 * Minimal EN · ES toggle for the public navigation.
 *
 * Each option is a real `<Link>` to the same page in the other language, so it
 * is crawlable, middle-clickable and works without JavaScript. Choosing a
 * language navigates client-side — no full page reload — and records the
 * choice in a cookie so a later visit to an unprefixed URL lands in the same
 * language.
 */
export function LanguageSwitcher({ className }: { className?: string }) {
  const activeLocale = useLocale();
  const pathname = usePathname();
  const t = useTranslations("nav");

  return (
    <nav
      aria-label={t("languageLabel")}
      className={cn(
        "flex items-center gap-1 text-[13px] font-medium tabular-nums",
        className,
      )}
    >
      {locales.map((locale, index) => {
        const isActive = locale === activeLocale;

        return (
          <span key={locale} className="flex items-center">
            {index > 0 ? (
              <span aria-hidden className="select-none px-1 text-[#cfcdc6]">
                ·
              </span>
            ) : null}
            <Link
              href={switchLocalePathname(pathname, locale)}
              hrefLang={locale}
              prefetch={false}
              aria-current={isActive ? "true" : undefined}
              aria-label={`${t("switchLanguage")}: ${localeLabels[locale]}`}
              onClick={() => rememberLocale(locale)}
              className={cn(
                "rounded px-1 py-0.5 transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/30",
                isActive ? "text-[#141413]" : "text-[#8c8b84] hover:text-[#141413]",
              )}
            >
              {localeShortLabels[locale]}
            </Link>
          </span>
        );
      })}
    </nav>
  );
}
