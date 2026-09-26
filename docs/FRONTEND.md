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
- The public site is the landing page and its funnel: `/`, `/contact`, `/call`, `/blog`, `/blog/*`, `/newsletter`, `/newsletter/*`, and `/legal/*`. Primary marketing navigation surfaces "How it works" (the landing's `#how-it-works` anchor) and Contact, plus the rounded "Get started" / "Comenzar" CTA; Blog and Newsletter are temporarily hidden from it. `/call` is a public funnel page reachable by direct link and cross-linked from `/contact` and the landing.
- The deployed private surface is the legacy Operator Console (`/admin`) with its sign-in (`/auth/*`). The separate evaluation product routes (`/ops`, `/workspace`, `/evaluation-entry`, `/share`) exist in code but are not production-released.
- The pre-pivot marketplace surfaces were removed: `/buyer`, `/supplier`, `/v1/*`, `/security`, `/pricing`, `/docs`, `/about`, `/careers`, `/catalogue`, and Stripe checkout. They return `404`; do not reintroduce them.

## Routing and IA Contract

- There is no landing-mode flag; the public route set above is what the app builds.
- Public primary navigation is defined in `lib/navigation/public-links.ts` (currently How it works and Contact; Blog and Newsletter are commented out). The footer may additionally expose meeting booking and legal pages.
- Public discovery files use `/sitemap.xml` as an index for `/post-sitemap.xml` and `/page-sitemap.xml`; `/llms.txt` provides a curated AI-readable overview. These files list public content only.
- `/contact` is the general contact and intake path. It records evaluation requests (`lib/validators/evaluation-request.ts`, `lib/public/evaluation-request-intake.ts`): system type, stage, sector, owner role, what the system answers, an optional URL and the offer to start from. Landing links pass `?offer=reality-check` to preselect the free diagnostic. Keep the quiet form treatment.
- Public offers live in `lib/public/evaluation-offers.ts`, shared by `/llms.txt`, agent markdown and home structured data. The landing page has no pricing section. Only the free Reality Check has a price; the Pilot Evaluation and the monthly subscription read "Personalized" and are quoted on scope. Each offer's `slug` is the `offer` value `/contact` accepts.
- `/call` is the public meeting-booking surface. It embeds the Cal.com inline scheduler (light theme, brand-aligned `cal-brand` accent) configured via the `CALCOM_LINK` env var, mirrors the quiet `/contact` treatment, and renders an explicit fallback panel when no link is configured. Keep it out of the primary landing navigation but cross-linked from `/contact`.
- Planned `/proof`: public, no signup; it becomes the landing page's primary evidence CTA when it ships. It must enforce IP rate limits, 24-hour upload retention and a daily model-spend cap, and state plainly what is processed and where.
- Evaluation customer workspace (`/workspace`): invitation-only account access, workspace-scoped owner/editor/viewer permissions, connection → source-backed test-set preparation → approved run → report. The old planned `/e/[projectId]` magic-link sketch does not govern this implementation.
- Do not add landing-page entry points to direct-route or authenticated surfaces unless explicitly requested.
- Direct-route surfaces verify their own access controls rather than relying on the landing-mode route gate.

## Localization Contract

Supported locales are `en` and `es`. Only the public marketing surface is
translated; `/admin`, `/auth/*` and the evaluation surface are English-only.

### URL shape

- Every public page lives at `/{locale}{path}`: `/en/blog`, `/es/legal/privacy`.
  There is no unprefixed default, so each page has exactly one canonical URL and
  each language is indexed independently.
- An unprefixed public path is redirected once (307) by `proxy.ts` to the
  negotiated locale. An unsupported language prefix (`/fr/blog`) is a 404.
- `lib/i18n/routing.ts` is the single definition of that shape.
  `isNonLocalizedPath` lists every prefix that stays outside the locale tree —
  the Operator Console, auth, APIs, sitemaps, `robots.txt` and `llms.txt`. Add
  new internal surfaces there, never to the locale tree.

### Detection and choice

- Negotiation happens in `lib/i18n/negotiate.ts` and is pure and synchronous:
  it reads only the request. No IP geolocation, no third-party call, no
  client-side reload.
- Precedence: the `NEXT_LOCALE` cookie (an explicit choice), then
  `Accept-Language`, then an edge country hint, then `en`.
- A country hint never overrides an explicit choice or a stated language
  preference. Someone in Spain reading in English keeps English.
- A client that states no language gets `en`, so what a crawler indexes is
  predictable.
- The language switcher (`components/i18n/language-switcher.tsx`) renders real
  links to the same page in the other language: crawlable, no reload.

### Messages

- UI copy lives in `lib/i18n/messages/{en,es}.json`, namespaced by surface.
  `en.json` defines the shape and `es.json` is checked against it, so a key
  present in one locale and missing from the other is a `tsc` error.
- Read messages with `useTranslations("namespace")` in client components and
  `getScopedTranslator(locale, "namespace")` on the server. Keys are typed;
  an unknown key does not compile.
- Long-form prose (blog, legal) is content, not UI copy: it lives in
  `content/blog/{locale}/` and `content/legal/{locale}.json`.
- Zod schemas emit message *keys*, not sentences — they run where no locale is
  in scope, and the form resolves them at render. A schema that omits a custom
  message falls back to Zod's own English text, which is a defect.
- Do not ship hardcoded user-facing strings in public components, and do not
  reintroduce runtime DOM translation.
- `npm run i18n:check-parity` verifies key parity, blank values and
  interpolation slots. It runs against the message files, not the source.

### SEO

- `buildPublicMetadata` takes the page's `locale` and emits a self-referencing
  canonical, a full `hreflang` set including `x-default`, and `og:locale` with
  alternates. Pass `locale` from the route params on every public page.
- Both sitemaps emit one `<url>` per locale, each carrying the whole
  `hreflang` set (`lib/sitemap-xml.ts`).
- Structured data is built per locale; the Organization node keeps one
  locale-free `@id` that every localized page references.

### Static rendering

- The public tree is prerendered per locale via `generateStaticParams`. Nothing
  in `app/layout.tsx` may read the request — `cookies()` or `headers()` there
  opts *every* route out of static rendering, including the marketing pages.
- `<html lang>` is corrected inside the locale subtree by
  `components/i18n/html-lang.tsx`.
- The internal surfaces declare `export const dynamic = "force-dynamic"` in
  their own group layouts, because they are authenticated and per-request.

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
