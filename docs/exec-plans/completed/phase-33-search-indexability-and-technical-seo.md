# Phase 33 - Search Indexability and Technical SEO

- Status: DONE
- Priority: P0
- Owner: agent
- Last Updated: 2026-04-02

## Goal
- Make Caudals ready for Google indexing on its public marketing surface by shipping crawl controls, sitemap coverage, canonical metadata, structured data, verification-file delivery, and explicit noindex boundaries for non-public surfaces.

## Exit Criteria
- `robots.txt` is served from the app and points Google to the production sitemap.
- `sitemap.xml` is served from the app and includes only indexable public URLs for the current deployment mode.
- The Google site-verification HTML file is publicly reachable in landing mode.
- Public marketing and blog pages emit absolute canonical metadata plus stable Open Graph/Twitter previews.
- Authenticated and auth-only surfaces emit explicit `noindex` metadata.
- Query-variant pages that should not rank emit canonical/noindex protections.
- Structured data is present on the core landing and blog surfaces.
- Automated checks and browser verification pass, and evidence is logged.

## Queue
- Queue Position: 1
- Blocking Dependencies: none

## Scope Context
- Production marketing discovery currently depends on the landing-mode public surface, so crawlable/indexable URLs must match what is actually reachable in that mode.
- The repo already contains a Google verification HTML file, but it is stored at the repository root and would not be served by Next.js or allowed through landing-mode filtering.
- Public pages have partial titles/descriptions today, but there is no shared canonical host strategy, no sitemap/robots route, and no explicit index/noindex split between marketing and application surfaces.
- Risk: over-indexing auth/app routes or blocked landing-mode paths would waste crawl budget and dilute search quality.

## Stages

### S1 - Crawl Governance
- Objective: define the indexable surface and ship crawl endpoints plus verification delivery.
- Outputs: phase/queue updates, site URL helpers, `robots.txt`, `sitemap.xml`, verification-file delivery, landing-mode allowlist coverage.
- Done when: public crawl endpoints and verification routes are available and aligned with deployment mode.
- Mapped Tasks: `P33-T01`, `P33-T02`

### S2 - Metadata and Structured Data
- Objective: harden public-page metadata and keep non-public routes out of search.
- Outputs: shared metadata helpers, canonical/Open Graph/Twitter metadata, structured data, noindex boundaries.
- Done when: indexable pages emit complete metadata and non-public/query-variant pages emit crawl/index protections.
- Mapped Tasks: `P33-T03`, `P33-T04`

### S3 - Validation and Release Readiness
- Objective: validate the SEO surface, record evidence, and prepare the branch for push.
- Outputs: passing checks, browser verification notes, changelog entry, validation log, push-ready branch.
- Done when: automated and browser checks are complete and delivery evidence is recorded.
- Mapped Tasks: `P33-T05`, `P33-T06`, `P33-T07`

## Tasks
- [x] `P33-T01` (P0, DONE, owner: agent) Create the exec plan for search indexability work and update the active queue to prioritize this user-requested phase.
- [x] `P33-T02` (P0, DONE, owner: agent) Implement crawl endpoints and verification delivery (`robots.txt`, `sitemap.xml`, Google verification HTML, landing-mode allowlist coverage).
- [x] `P33-T03` (P0, DONE, owner: agent) Add shared SEO helpers and upgrade root/public metadata with canonical URLs, absolute preview data, and production host selection.
- [x] `P33-T04` (P0, DONE, owner: agent) Add structured data for the core public surface and explicit `noindex` protections for auth/app/query-variant routes.
- [x] `P33-T05` (P1, DONE, owner: agent) Run automated validation for the SEO changes (`npm run typecheck`, targeted lint/tests, metadata-route coverage).
- [x] `P33-T06` (P1, DONE, owner: agent) Run browser verification for the public SEO surface, including `robots.txt`, `sitemap.xml`, metadata inspection, and required screenshots.
- [x] `P33-T07` (P1, DONE, owner: agent) Update changelog and validation logs, then prepare the finished branch for push.

## Validation Required
- `npm run typecheck`
- targeted lint/tests for touched scope
- runtime/browser checks for metadata routes and public pages

## Evidence Links
- Changelog: `docs/logs/changelog/2026-04-02-phase-33-search-indexability.md`
- Validation: `docs/logs/validations/2026-04-02-phase-33-search-indexability-validation.md`

## Mid-Execution Steering Notes
- Keep the sitemap limited to the URLs that are actually reachable in the current deployment mode.
- Prefer production marketing hostnames for canonical metadata and sitemap URLs.
- If search-surface scope changes during implementation, update this phase file before continuing.
