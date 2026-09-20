# Frontend Delivery Contract

## Scope

Implementation rules for the public funnel, the internal Operator Console, and the separate invite-only evaluation surfaces (`/ops`, `/workspace`, private report view). `/proof` remains a separate future demo.

## Stack and Constraints

- Next.js App Router + React 19 + TypeScript
- Tailwind v4 + Radix + shared app primitives
- Light mode only in current scope. The platform token layer is dark-ready
  (`:root[data-theme="dark"]` in `packages/brand/platform.css`) but dark is not
  enabled and is not QA'd.
- **Two design languages, never blended.** Authenticated surfaces use the
  platform system (`packages/brand/platform.css`, `.p-root`); the public site
  keeps the editorial system (`packages/brand/tokens.css`, `app/globals.css`).
  `docs/DESIGN.md` is the authority for both and states which applies where.
- The public site is the landing page and its funnel: `/`, `/contact`, `/call`, `/blog`, `/blog/*`, `/newsletter`, `/newsletter/*`, and `/legal/*`. Primary marketing navigation surfaces Contact, Blog, and Newsletter; `/call` is a public funnel page reachable by direct link and cross-linked from `/contact`.
- The deployed private surface is the legacy Operator Console (`/admin`) with its sign-in (`/auth/*`). The separate evaluation product routes (`/ops`, `/workspace`, `/evaluation-entry`, `/share`) exist in code but are not production-released.
- The pre-pivot marketplace surfaces were removed: `/buyer`, `/supplier`, `/v1/*`, `/security`, `/pricing`, `/docs`, `/about`, `/careers`, `/catalogue`, and Stripe checkout. They return `404`; do not reintroduce them.

## Routing and IA Contract

- There is no landing-mode flag; the public route set above is what the app builds.
- Public primary navigation exposes Contact, Blog, and Newsletter (`lib/navigation/public-links.ts`). The footer may additionally expose meeting booking and legal pages.
- Public discovery files use `/sitemap.xml` as an index for `/post-sitemap.xml` and `/page-sitemap.xml`; `/llms.txt` provides a curated AI-readable overview. These files list public content only.
- `/contact` is the general contact and intake path. It records evaluation requests (`lib/validators/evaluation-request.ts`, `lib/public/evaluation-request-intake.ts`): system type, stage, sector, owner role, what the system answers, an optional URL and the offer to start from. Hero and pricing links pass `?offer=<id>` to preselect that offer. Keep the quiet form treatment.
- Public offers live in `lib/public/evaluation-offers.ts`, shared by the landing page, `/llms.txt`, agent markdown and home structured data. The pricing section shows three offers: only the free Reality Check has a price; the Pilot Evaluation and the monthly subscription read "Personalized" and are quoted on scope.
- `/call` is the public meeting-booking surface. It embeds the Cal.com inline scheduler (light theme, brand-aligned `cal-brand` accent) configured via the `CALCOM_LINK` env var, mirrors the quiet `/contact` treatment, and renders an explicit fallback panel when no link is configured. Keep it out of the primary landing navigation but cross-linked from `/contact`.
- Planned `/proof`: public, no signup; it becomes the landing page's primary evidence CTA when it ships. It must enforce IP rate limits, 24-hour upload retention and a daily model-spend cap, and state plainly what is processed and where.
- Evaluation customer workspace (`/workspace`): invitation-only account access, workspace-scoped owner/editor/viewer permissions, connection → source-backed test-set preparation → approved run → report. The old planned `/e/[projectId]` magic-link sketch does not govern this implementation.
- Do not add landing-page entry points to direct-route or authenticated surfaces unless explicitly requested.
- Direct-route surfaces verify their own access controls rather than relying on the landing-mode route gate.

## Localization Contract

- Supported locales: `en` and `es`.
- Locale cookie: `NEXT_LOCALE`.
- Middleware locale detection can use country headers, `Accept-Language`, and IP geolocation fallback.
- Spain (`ES`) is treated as a strong signal for Spanish locale routing.
- Requests without an `Accept-Language` header use Spanish as the canonical public fallback so crawlers receive metadata and content in the same language. Explicit English browser preferences still resolve to English outside Spain.
- Use translation pipeline (`t()`, `getServerTranslator()`, `translateReactNode`) for public and legacy admin strings. The evaluation surface uses its own English message catalog; see `docs/evals/AGENTS.md`.
- Do not ship new hardcoded user-facing English strings in public or admin components.
- Spain locale (`ES`) should resolve naturally to Spanish copy.

## Platform UI Contract

Applies to `/workspace/*`, `/ops/*`, `/share`, `/evaluation-entry`, `/auth/*` and `/admin`.

- Compose from `components/evals/primitives.tsx`. Do not reach into
  `components/ui/*` directly in a new platform screen, and do not style inline.
- Every colour, radius, shadow, duration, easing and type value comes from a
  `--p-*` token. A literal hex, px radius or ms duration in a component is a
  defect.
- The outermost element of every platform surface carries `className="p-root"`.
  Shells that render outside `EvalShell` (auth frame, error boundary, loading,
  the shared report, the unauthenticated invitation view) set it themselves.
- Never render a raw domain enum. Use `StatusBadge`, and add the mapping to the
  `STATUS` table when you add a backend state.
- Icons are lucide-react only, stroke `1.5` beside regular text and `2` beside
  medium.
- `app/(evaluation)/evaluation.css` ends with a compatibility alias block for
  legacy `.eval-*` class names. Do not add to it; when you touch one of those
  components, migrate it to the `p-*` primitives and delete its alias.
- `/admin` is frozen scope: it adopts the platform tokens through a variable
  remap and is not to be rewritten wholesale.

## Implementation Rules

1. Start from existing design tokens and shared primitives.
2. Keep landing-page navigation aligned with landing-mode restrictions while preserving direct-route access for published surfaces.
3. Prefer incremental, verifiable UI changes.
4. Avoid parallel component systems.
5. Preserve keyboard/focus behavior while restyling.
6. Centre new workflows on evaluation: case authoring, grading, run results, reports and the public demo. Do not extend marketplace, supplier or catalogue flows.
7. Verify platform UI against the isolated harness: `node e2e/evals/harness-server.mjs`
   serves the real components with fixture data on `127.0.0.1:4187`. It bundles
   `platform.css` + `evaluation.css`, so it is the fastest way to see a design
   change without a database or a session.

## Runtime Review

For frontend changes, use the level of inspection appropriate to the risk of the change:

- local type and lint checks for code edits,
- browser/devtools inspection for changed routes,
- console and network review for changed interaction paths,
- viewport review when layout or responsive behavior changes.
