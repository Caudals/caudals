# 2026-04-02 - Phase 33 Search Indexability and Technical SEO

## Summary
Prepared the Caudals public surface for Google indexing by shipping crawl controls, a production sitemap, canonical metadata, structured data, explicit noindex boundaries for non-public surfaces, and a working Google verification file path that survives landing mode.

## Delivered
- Added shared SEO helpers in `lib/seo.ts` to centralize production marketing/app host selection, canonical URL generation, Open Graph/Twitter metadata, and indexable-route selection.
- Added `app/robots.ts` and `app/sitemap.ts`, with sitemap output restricted to the landing-mode public surface (`/`, `/contact`, `/blog`, and blog posts) when `LANDING_MODE=true`.
- Added the Google Search Console verification file under `public/` and updated `lib/landing-mode.ts` so `/google*.html` remains reachable while the rest of the private app stays blocked in landing mode.
- Upgraded root metadata in `app/layout.tsx` and public marketing/blog pages with absolute canonical metadata, social preview data, and production host resolution based on `NEXT_PUBLIC_MARKETING_HOSTNAMES`.
- Split the home page into a server wrapper plus client body so the landing route can emit JSON-LD for `Organization`, `WebSite`, and `WebPage` without changing the existing UI behavior.
- Added explicit `noindex` metadata to auth/app layouts and to non-canonical query/dynamic surfaces that should not rank (`/blog?topic=...`, dataset detail pages).
- Refreshed stale blog tests to match the current five-post MDX corpus and fixed the existing blog lint error so repo-level validation can pass again.

## Launch Notes
- Production canonical URLs and the sitemap now resolve to the first hostname in `NEXT_PUBLIC_MARKETING_HOSTNAMES`; in the current local env this is `https://caudals.com`.
- After deployment, submit `https://caudals.com/sitemap.xml` in Google Search Console and confirm ownership via `https://caudals.com/googlef901b912f9aefdea.html`.
