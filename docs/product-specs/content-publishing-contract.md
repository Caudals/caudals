# Blog Content Publishing Contract

Status: current contract
Owner: main-site blog (`caudals`)
Producer: Content Suite in the `leads` repository

This is the interface between the internal content system and the public blog.
The site is the source of truth for the file format and rendering behavior; the
CRM is the source of truth for workflow, approvals, scheduling and provenance.

## File identity

- Path: `content/blog/{locale}/{slug}.mdx`
- Locales: `en`, `es`
- Public URL: `/blog/{slug}`
- Locale selection: request locale/cookie, not a locale URL prefix
- Slug: lowercase ASCII and hyphens; use the same slug for translations

The loader may fall back to the default locale when a translation is missing.
V2 production releases use `translation_group_id` and require exactly one
English and one Spanish file with the same slug before the atomic commit.

## Frontmatter

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

Unknown fields are ignored by the renderer. The Content Suite currently adds
`source`, `sourceLocale`, `sourcePillar`, `sourceReadingMinutes` and
`sourceHeroImage` for provenance. Those fields are not a public presentation
contract.

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

The current scheduled path selects approved, hash-bound variants. For every
publication, the CRM publisher:

1. Refuses an empty MDX body or excerpt.
2. Renders frontmatter according to this contract.
3. Requires the paired `en`/`es` translation group and matching slug.
4. Creates both blobs, one Git tree and one commit, then advances the configured
   branch with a non-force compare-and-swap update.
5. Records the same commit SHA, `/blog/{slug}` and `committed` deployment state
   for both locales.
6. Reconciles GitHub Actions as `committed → building → deployed` or `failed`.

This repository enforces the same deterministic contract when content is read,
when `npm run blog:preflight` is executed and before the production image is
built. Preflight checks required frontmatter, locale/slug pairing and category
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
5. at least one paired fixture in `content/blog/en` and `content/blog/es`.

The site build is the final compatibility test. A GitHub commit alone does not
mean an article is deployed successfully.
