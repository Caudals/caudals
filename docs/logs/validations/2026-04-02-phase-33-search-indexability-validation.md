# Phase 33 Search Indexability Validation

- **Date:** 2026-04-02
- **Phase:** 33
- **Tasks:** `P33-T02` to `P33-T07`
- **Owner:** agent

## Automated Checks
- [x] `npm run typecheck`
- [x] `npx vitest run lib/landing-mode.test.ts lib/seo.test.ts`
- [x] `npx eslint 'app/layout.tsx' 'app/robots.ts' 'app/sitemap.ts' 'app/(app)/layout.tsx' 'app/(auth)/auth/layout.tsx' 'app/(home)/page.tsx' 'app/(home)/about/page.tsx' 'app/(home)/blog/page.tsx' 'app/(home)/blog/[slug]/page.tsx' 'app/(home)/browse/page.tsx' 'app/(home)/browse/[id]/page.tsx' 'app/(home)/careers/page.tsx' 'app/(home)/contact/page.tsx' 'app/(home)/docs/page.tsx' 'app/(home)/docs/security-baseline/page.tsx' 'app/(home)/legal/cookies/page.tsx' 'app/(home)/legal/privacy/page.tsx' 'app/(home)/legal/terms/page.tsx' 'app/(home)/pricing/page.tsx' 'app/(home)/trust/page.tsx' 'components/landing/home-page-client.tsx' 'lib/landing-mode.ts' 'lib/landing-mode.test.ts' 'lib/seo.ts' 'lib/seo.test.ts'`
- [x] `npm run lint`
- [x] `npm test -- --run`
- [x] `npm run build`

## Lint/Test Notes
- `npm run lint` completed with existing repository warnings only; no ESLint errors remain after this pass.
- `npm test -- --run` passed after updating `lib/blog/posts.test.ts` to reflect the current five-post MDX corpus.
- `npm run build` completed successfully and emitted static metadata routes for `/robots.txt` and `/sitemap.xml`.

## Chrome DevTools MCP Verification
- [x] Built app validated via `PORT=3002 npm run start` because port `3000` was already occupied.
- [x] Home page at `http://127.0.0.1:3002/` renders with canonical `https://caudals.com/`, `robots=index, follow`, Open Graph tags, Twitter card metadata, and one JSON-LD script containing `Organization` + `WebSite` + `WebPage`.
- [x] `http://127.0.0.1:3002/robots.txt` serves the expected allow/disallow rules plus `Sitemap: https://caudals.com/sitemap.xml`.
- [x] `http://127.0.0.1:3002/sitemap.xml` serves the landing-mode indexable surface only: `/`, `/blog`, `/contact`, and all five blog posts with `lastmod`.
- [x] `http://127.0.0.1:3002/googlef901b912f9aefdea.html` serves the expected Search Console verification payload.
- [x] `http://127.0.0.1:3002/blog?topic=operations` emits canonical `https://caudals.com/blog` with `robots=noindex, nofollow`.
- [x] Home page console and network checks showed no new SEO-route failures.

## Runtime Notes
- Two `GET /api/user/role` `404` requests still appear on the public home page during browser validation. This is a pre-existing public-shell behavior and was not introduced by the SEO changes.
- The browser page title followed the root metadata default (`Caudals | AI Dataset Crowdsourcing Platform`) while the document `lang` resolved to `es` from the locale pipeline.
- `baseline-browser-mapping` freshness warnings and Node `punycode` deprecation warnings appear during lint/build/test, but they did not block successful validation.

## Visual Evidence
- [x] Desktop screenshot: `docs/logs/validations/2026-04-02-marketing-home-seo-desktop.png`
- [x] Tablet screenshot: `docs/logs/validations/2026-04-02-marketing-home-seo-tablet.png`
- [x] Mobile screenshot: `docs/logs/validations/2026-04-02-marketing-home-seo-mobile.png`
