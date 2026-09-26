import type { NamespaceKeys } from "@/lib/i18n/messages";

/**
 * Primary public navigation, shared by the marketing header and footer.
 *
 * Links carry a message key rather than display text, so the label is resolved
 * in the reader's language and a copy change happens in one place.
 */
export type PublicNavigationLink = {
  href: string;
  labelKey: NamespaceKeys<"nav">;
};

export const publicNavigationLinks: readonly PublicNavigationLink[] = [
  { href: "/contact", labelKey: "contact" },
  // Temporarily hidden:
  // { href: "/blog", labelKey: "blog" },
  // { href: "/newsletter", labelKey: "newsletter" },
] as const;
