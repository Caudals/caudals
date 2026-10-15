"use client";

import Link from "next/link";
import { createContext, forwardRef, useContext, type ReactNode } from "react";
import { useLocale } from "@/lib/i18n/context";
import { localizePathname } from "@/lib/i18n/routing";

type LocaleLinkProps = Omit<React.ComponentProps<typeof Link>, "href"> & {
  /** Locale-free pathname, e.g. "/contact". Hashes and queries are preserved. */
  href: string;
};

/**
 * Origin for the public site's links when a public page is served from
 * another host: the 404 on the app host (`app/global-not-found.tsx`, launch
 * L-24c), whose translated slugs (`/es/contacto`) exist only on the public
 * host. Empty everywhere else: links stay relative.
 */
const LinkOriginContext = createContext("");

export function LinkOriginProvider({ origin, children }: { origin: string; children: ReactNode }) {
  return <LinkOriginContext.Provider value={origin}>{children}</LinkOriginContext.Provider>;
}

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
    const origin = useContext(LinkOriginContext);

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
        href={`${origin}${localized}${query ? `?${query}` : ""}${hash ? `#${hash}` : ""}`}
        {...props}
      />
    );
  },
);
