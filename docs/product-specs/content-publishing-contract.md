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
The production workflow should nevertheless treat the English and Spanish
files as one translation group so their release status is visible.

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

The current scheduled path selects approved articles. For every publication,
the CRM publisher:

1. Refuses an empty MDX body or excerpt.
2. Renders frontmatter according to this contract.
3. Creates or updates the locale file through GitHub on the configured branch.
4. Records commit SHA and `/blog/{slug}` in the CRM.
5. Marks the related campaign beat published.

The next contract version should add a preflight check that compiles the exact
MDX against the target revision, an atomic translation/asset bundle, build and
deployment status, and a preview rendered by this application.

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
