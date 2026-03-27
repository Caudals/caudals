# Phase 28 - MDX Blog Launch

- **Date:** 2026-03-27
- **Phase:** 28
- **Tasks:** `P28-T01` to `P28-T05`

## Delivered
- Replaced the `/blog` placeholder with a fully designed editorial hub built around a Gemini-guided “Clear Signal” layout: typographic hero, featured post, topic filters, recent-post grid, and public CTA.
- Added a localized file-based MDX publishing system under `content/blog/{en,es}` with frontmatter parsing, read-time calculations, heading extraction, and dynamic article routes at `/blog/[slug]`.
- Implemented custom MDX rendering primitives for article typography, callouts, tables, code, internal links, and anchorable section headings.
- Added three starter articles in English and Spanish to seed the blog with launch, dataset-ops, and engineering content.
- Added blog discoverability to the public header navigation and expanded public route coverage plus blog loader tests.
- Fixed a QA-found topic-filter duplication bug so single-article topic views no longer repeat the featured story in the archive grid.

## Notes
- Locale-aware QA was validated on a clean `next start` server after the local dev server surfaced unrelated HMR websocket noise.
