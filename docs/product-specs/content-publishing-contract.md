# Blog Content Publishing Contract

Status: current contract
Owner: main-site blog (`caudals`)
Producer: Content Suite in the `leads` repository

This is the interface between the internal content system and the public blog.
The site is the source of truth for rendering behavior; Leads is the headless
CMS and source of truth for workflow, content, approvals, scheduling and
provenance. Bundled MDX is a resilience and hand-authored-content fallback.

## Public identity

- Content API: `GET https://leads.caudals.com/api/blog?locale={locale}` and
  `GET https://leads.caudals.com/api/blog/{slug}?locale={locale}`
- Static fallback: `content/blog/{locale}/{slug}.mdx`
- Locales: `en`, `es`
- Public URL: `/blog/{slug}`
- Locale selection: request locale/cookie, not a locale URL prefix
- Slug: lowercase ASCII and hyphens; use the same slug for translations

Both API and file loaders may fall back to English when a translation is
missing. A translation group containing both locales must use the same slug.

## Metadata

Required:

```yaml
---
title: "A specific article title"
excerpt: "An accurate description of what the article answers."
publishedAt: "2026-08-02"
author: "The Caudals Team"
authorRole: "Dataset operations"
category: "AI & ML"
categoryKey: "ai-ml"
---
```

Optional fields understood by the site:

```yaml
tags: ["Data Collection", "Dataset Planning"]
featured: false
coverVariant: "signal" # signal | grid | ledger
```

The API exposes equivalent camel-case JSON plus `bodyMdx`, `updatedAt`,
`readTimeMinutes` and optional `heroUrl`. It never exposes workflow rows,
prompts, credentials or unpublished content.

## MDX body

Supported Markdown includes h2/h3 headings, paragraphs, links, images, videos,
lists, tables, blockquotes, horizontal rules and fenced code. The component
allowlist currently contains:

- `Callout`
- `YouTube`
- `DataBudgetCalculator`
- `DataSourceQuiz`
- `FineTuningEstimator`
- `ActiveLearningLoop`
- `PreferencePairPlanner`
- `EvalDatasetPlanner`

Generated content must not add imports, scripts, forms, arbitrary components or
frontmatter. The publisher owns frontmatter and the site owns components.

## Publication workflow

The scheduled path selects approved, hash-bound variants. For every
publication, Leads:

1. Refuses an empty MDX body or excerpt.
2. Renders frontmatter according to this contract.
3. Validates every available locale and matching slugs in a bilingual group.
4. Atomically marks the rows `published`/`deployed` with `/blog/{slug}`.
5. Exposes only those published rows through the cacheable public API.

The Next.js server fetches the API with a 60-second revalidation window, merges
CMS results over bundled files by slug, and compiles remote MDX through the same
allowlist and preflight contract. If Leads is unreachable or rejects a remote
article, established bundled articles continue to render. Publishing a new
article does not push Git, start GitHub Actions or rebuild the site image.

This repository enforces the same deterministic contract when API or file
content is read, when `npm run blog:preflight` is executed and before a site
image is built. File preflight checks required frontmatter, locale/slug pairing and category
parity, the MDX component allowlist, imports/exports, unsafe HTML, links,
private-route discovery, headings, image alt text and a 250 kB source budget.
The site build remains the renderer/compiler compatibility test.

Shared editorial brand tokens and the machine-readable voice/primitive manifest
live in `packages/brand/`. `app/globals.css` consumes the CSS token package; the
Leads database stores the corresponding immutable brand version used by media
projects and prompt bundles.

## Change protocol

Any change to required frontmatter, locale behavior, route shape or MDX
components must update:

1. `lib/blog/posts.ts` and/or `components/blog/mdx-components.tsx` here;
2. this document;
3. `services/growth-social/src/content/blog.ts` in `leads`;
4. the blog-writer prompt/output schema and its build eval;
5. paired fixtures when the static fallback contract changes.

The site build remains the fallback compatibility test. A CMS article is live
when its API row is published and passes request-time preflight.
