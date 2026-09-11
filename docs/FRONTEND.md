# Frontend Delivery Contract

## Scope

Implementation rules for the public funnel, the internal Operator Console, and the planned evaluation surfaces (operator case authoring and grading, customer dashboard, report view, `/proof` demo).

## Stack and Constraints

- Next.js App Router + React 19 + TypeScript
- Tailwind v4 + Radix + shared app primitives
- Light mode only in current scope
- The public site is the landing page and its funnel: `/`, `/contact`, `/call`, `/blog`, `/blog/*`, `/newsletter`, `/newsletter/*`, `/equipo`, `/equipo/*`, and `/legal/*`. Primary marketing navigation surfaces Contact, Blog, and Newsletter; `/call` is a public funnel page reachable by direct link and cross-linked from `/contact`, while `/equipo` is linked from the public footer.
- The only private surface is the Operator Console (`/admin`) with its sign-in (`/auth/*`).
- The pre-pivot marketplace surfaces were removed: `/buyer`, `/supplier`, `/v1/*`, `/security`, `/pricing`, `/docs`, `/about`, `/careers`, `/catalogue`, and Stripe checkout. They return `404`; do not reintroduce them.

## Routing and IA Contract

- There is no landing-mode flag; the public route set above is what the app builds.
- Public primary navigation exposes Contact, Blog, and Newsletter (`lib/navigation/public-links.ts`). The footer may additionally expose Team, meeting booking, and legal pages.
- Public discovery files use `/sitemap.xml` as an index for `/post-sitemap.xml`, `/page-sitemap.xml`, and `/author-sitemap.xml`; `/llms.txt` provides a curated AI-readable overview. These files list public content only.
- `/contact` is the general contact and intake path. It records evaluation requests (`lib/validators/evaluation-request.ts`, `lib/public/evaluation-request-intake.ts`): system type, stage, sector, owner role, what the system answers, an optional URL and the offer to start from. Hero and pricing links pass `?offer=<id>` to preselect that offer. Keep the quiet form treatment.
- Public offers live in `lib/public/evaluation-offers.ts`, shared by the landing page, `/llms.txt`, agent markdown and home structured data. The pricing section shows three offers: only the free Reality Check has a price; the Pilot Evaluation and the monthly subscription read "Personalized" and are quoted on scope.
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
