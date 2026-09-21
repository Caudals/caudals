"use client";

import Link from "next/link";
import { forwardRef } from "react";
import { useLocale } from "@/lib/i18n/context";
import { localizePathname } from "@/lib/i18n/routing";

type LocaleLinkProps = Omit<React.ComponentProps<typeof Link>, "href"> & {
  /** Locale-free pathname, e.g. "/contact". Hashes and queries are preserved. */
  href: string;
};

/**
 * `next/link` that keeps the visitor inside their current language.
 *
 * Internal links are written locale-free (`/contact`) and prefixed here, so a
 * visitor reading Spanish never gets bounced to an English page mid-journey.
 * External links, anchors and non-localized paths pass through untouched.
 */
export const LocaleLink = forwardRef<HTMLAnchorElement, LocaleLinkProps>(
  function LocaleLink({ href, ...props }, ref) {
    const locale = useLocale();

    const isInternal = href.startsWith("/");
    if (!isInternal) {
      return <Link ref={ref} href={href} {...props} />;
    }

    const [pathAndQuery, hash] = href.split("#");
    const [pathname, query] = pathAndQuery.split("?");
    const localized = localizePathname(pathname, locale);

    return (
      <Link
        ref={ref}
        href={`${localized}${query ? `?${query}` : ""}${hash ? `#${hash}` : ""}`}
        {...props}
      />
    );
  },
);
