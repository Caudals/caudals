import type { Locale } from "@/lib/i18n/config";

export function slugifyHeading(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

export function normalizeTopicKey(value?: string | string[] | null) {
  if (!value) {
    return "";
  }

  const rawValue = Array.isArray(value) ? value[0] : value;
  return slugifyHeading(rawValue);
}

export function estimateReadTimeMinutes(source: string) {
  const words = source.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 220));
}

export function formatBlogDate(date: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale === "es" ? "es-ES" : "en-US", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(date));
}

export function formatBlogDateCompact(date: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale === "es" ? "es-ES" : "en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(date));
}

export function formatReadTime(minutes: number, locale: Locale) {
  if (locale === "es") {
    return `${minutes} min de lectura`;
  }

  return `${minutes} min read`;
}

export function formatArticleCollectionCount(count: number, locale: Locale) {
  if (locale === "es") {
    return `${count} ${count === 1 ? "artículo" : "artículos"} en esta colección.`;
  }

  return `${count} article${count === 1 ? "" : "s"} in this collection.`;
}
