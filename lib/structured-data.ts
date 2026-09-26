import { buildMarketingUrl } from "@/lib/seo";

/**
 * Small schema.org builders shared by the public pages.
 *
 * Every node points at the one locale-free Organization declared on the home
 * page, so search engines and AI answer engines read each page as part of the
 * same entity.
 */

export function organizationReference() {
  return { "@id": `${buildMarketingUrl("/")}#organization` };
}

/** `BreadcrumbList` for a trail of absolute URLs; the last item is the page itself. */
export function breadcrumbList(items: readonly { name: string; url: string }[]) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

/** `FAQPage` from question and answer pairs that are visible on the page. */
export function faqPage(url: string, items: readonly { q: string; a: string }[]) {
  return {
    "@type": "FAQPage",
    "@id": `${url}#faq`,
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };
}

/** Serialises JSON-LD for a `<script>` tag, escaping `<` so no string can close it. */
export function jsonLd(data: unknown) {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
