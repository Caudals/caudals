# Frontend Delivery Contract

## Scope

Implementation rules for the public funnel, the internal Operator Console, and the planned evaluation surfaces (operator case authoring and grading, customer dashboard, report view, `/proof` demo).

## Stack and Constraints

- Next.js App Router + React 19 + TypeScript
- Tailwind v4 + Radix + shared app primitives
- Light mode only in current scope
- Current public deployment is landing mode: public pages are `/`, `/contact`, `/call`, `/blog`, `/blog/*`, `/newsletter`, `/newsletter/*`, `/equipo`, `/equipo/*`, and `/legal/*`. Primary marketing navigation surfaces Contact, Blog, and Newsletter; `/call` is a public funnel page reachable by direct link and cross-linked from `/contact`, while `/equipo` is linked from the public footer.
- Landing mode is not a route-publication ban. `/buyer`, `/supplier`, `/security`, and `/v1/*` may be reachable by direct URL when protected by their normal auth, authorization, RLS, rate-limit, and audit controls.
- Landing mode hides those entry points from the landing page: no buttons, nav links, hero CTAs, marketing cards, sitemap promotion, or other public discovery paths unless explicitly requested.
- `/buyer` (read-only delivery, subscription, integration, billing, scorecard, manifest and trust evidence) and `/supplier` (asset declaration, signed sample upload, build participation, payout and Stripe Connect status) are legacy surfaces, frozen: fix defects, do not add features.
- Catalogue browsing, sample-preview and purchase flows are out of scope; `/catalogue` and `/v1/datasets/*` stay unpublished.

## Routing and IA Contract

- `LANDING_MODE=true` is the canonical production posture until further notice.
- Public primary navigation exposes Contact, Blog, and Newsletter while landing mode remains active. The footer may additionally expose Team, meeting booking, and legal pages.
- Public discovery files use `/sitemap.xml` as an index for `/post-sitemap.xml`, `/page-sitemap.xml`, and `/author-sitemap.xml`; `/llms.txt` provides a curated AI-readable overview. These files list public content only.
- `/contact` is the general contact and intake path. It currently records structured dataset briefs (`lib/public/buyer-brief-intake.ts`); repositioning its copy and fields to evaluation requests (system type, sector, owner role, what the system answers) is pending and keeps the same quiet form treatment.
- `/call` is the public meeting-booking surface. It embeds the Cal.com inline scheduler (light theme, brand-aligned `cal-brand` accent) configured via the `CALCOM_LINK` env var, mirrors the quiet `/contact` treatment, and renders an explicit fallback panel when no link is configured. Keep it out of the primary landing navigation but cross-linked from `/contact`.
- Planned `/proof`: public, no signup; it becomes the landing page's primary evidence CTA when it ships. It must enforce IP rate limits, 24-hour upload retention and a daily model-spend cap, and state plainly what is processed and where.
- Planned customer dashboard (`/e/[projectId]`): magic-link access, read-only, scoped to one customer project, never linked or listed publicly.
- Do not add landing-page entry points to direct-route or authenticated surfaces unless explicitly requested.
- Direct-route surfaces verify their own access controls rather than relying on the landing-mode route gate.

## Localization Contract

- Supported locales: `en` and `es`.
- Locale cookie: `NEXT_LOCALE`.
- Middleware locale detection can use country headers, `Accept-Language`, and IP geolocation fallback.
- Spain (`ES`) is treated as a strong signal for Spanish locale routing.
- Requests without an `Accept-Language` header use Spanish as the canonical public fallback so crawlers receive metadata and content in the same language. Explicit English browser preferences still resolve to English outside Spain.
- Use translation pipeline (`t()`, `getServerTranslator()`, `translateReactNode`) for all user-visible strings.
- Do not ship new hardcoded user-facing English strings in public or admin components.
- Spain locale (`ES`) should resolve naturally to Spanish copy.

## Implementation Rules

1. Start from existing design tokens and shared primitives.
2. Keep landing-page navigation aligned with landing-mode restrictions while preserving direct-route access for published surfaces.
3. Prefer incremental, verifiable UI changes.
4. Avoid parallel component systems.
5. Preserve keyboard/focus behavior while restyling.
6. Centre new workflows on evaluation: case authoring, grading, run results, reports and the public demo. Do not extend marketplace, supplier or catalogue flows.

## Runtime Review

For frontend changes, use the level of inspection appropriate to the risk of the change:

- local type and lint checks for code edits,
- browser/devtools inspection for changed routes,
- console and network review for changed interaction paths,
- viewport review when layout or responsive behavior changes.
