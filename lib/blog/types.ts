import type { ReactNode } from "react";
import type { Locale } from "@/lib/i18n/config";

export type BlogCoverVariant = "signal" | "grid" | "ledger";

export type BlogHeading = {
  id: string;
  level: 2 | 3;
  title: string;
};

export type BlogFrontmatter = {
  title: string;
  excerpt: string;
  publishedAt: string;
  author: string;
  authorRole: string;
  category: string;
  categoryKey: string;
  tags: string[];
  featured: boolean;
  coverVariant: BlogCoverVariant;
};

export type BlogPostSummary = BlogFrontmatter & {
  locale: Locale;
  readTimeMinutes: number;
  slug: string;
};

export type BlogPost = BlogPostSummary & {
  content: ReactNode;
  headings: BlogHeading[];
};
