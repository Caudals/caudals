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
- The public site is the landing page and its funnel: `/`, `/sectors`, `/sectors/*`, `/contact`, `/call`, `/blog`, `/blog/*`, `/newsletter`, `/newsletter/*`, and `/legal/*`. Primary marketing navigation surfaces Sectors and Contact, plus the rounded "Get started" / "Comenzar" CTA; the footer adds "How it works" (the landing's `#how-it-works` anchor) and one link per sector. Blog and Newsletter are temporarily hidden. `/call` is a public funnel page reachable by direct link and cross-linked from `/contact` and the landing.
- Deployed private surfaces include retained internal-account auth (`/auth/*`) and the invite-only evaluation product (`/ops`, `/workspace`, `/review`, `/evaluation-entry`, `/share`). Features remain governed by workspace permissions, entitlements and readiness gates; see the latest evals work-package records.
- The pre-pivot marketplace surfaces were removed: `/buyer`, `/supplier`, `/v1/*`, `/security`, `/pricing`, `/docs`, `/about`, `/careers`, `/catalogue`, and Stripe checkout. They return `404`; do not reintroduce them.

## Routing and IA Contract

- There is no landing-mode flag; the public route set above is what the app builds.
- Public primary navigation is defined in `lib/navigation/public-links.ts` (currently Sectors and Contact; Blog and Newsletter are commented out). The footer may additionally expose meeting booking and legal pages.
- Public discovery files use `/sitemap.xml` as an index for `/post-sitemap.xml` and `/page-sitemap.xml`; `/llms.txt` provides a curated AI-readable overview. These files list public content only.
- `/contact` is the general contact and intake path. It records evaluation requests (`lib/validators/evaluation-request.ts`, `lib/public/evaluation-request-intake.ts`): system type, stage, sector, owner role, what the system answers, an optional URL and the offer to start from. Landing links pass `?offer=reality-check` to preselect the free diagnostic. Keep the quiet form treatment.
- Sector pages: `lib/public/sectors.ts` holds the sector ids (the same ids as the `/contact` `sector` options) and each locale's slug; page copy lives in `content/sectors/{locale}.json` (`es.json` is type-checked against `en.json`, and `lib/sectors/content.test.ts` guards icons, completeness and claims); short names are in the `sectors.names` messages. Each page reuses the landing's Paper components (hero chat fixed to its sector, failure modes with sector examples, expert network with sector roles), adds a FAQ with `FAQPage` data and links to the form as `/contact?offer=reality-check&sector={id}`, which preselects the sector.
- Public offers live in `lib/public/evaluation-offers.ts`, shared by `/llms.txt`, agent markdown and home structured data. The landing page has no pricing section. Only the free Reality Check has a price; the Pilot Evaluation and the monthly subscription read "Personalized" and are quoted on scope. Each offer's `slug` is the `offer` value `/contact` accepts.
- `/call` is the public meeting-booking surface. It embeds the Cal.com inline scheduler (light theme, brand-aligned `cal-brand` accent) configured via the `CALCOM_LINK` env var, mirrors the quiet `/contact` treatment, and renders an explicit fallback panel when no link is configured. Keep it out of the primary landing navigation but cross-linked from `/contact`.
- Planned `/proof`: public, no signup; it becomes the landing page's primary evidence CTA when it ships. It must enforce IP rate limits, 24-hour upload retention and a daily model-spend cap, and state plainly what is processed and where.
- Evaluation customer workspace (`/workspace`): invitation-only account access, workspace-scoped owner/editor/viewer permissions, connection → source-backed test-set preparation → approved run → report. The old planned `/e/[projectId]` magic-link sketch does not govern this implementation.
- Do not add landing-page entry points to direct-route or authenticated surfaces unless explicitly requested.
- Direct-route surfaces verify their own access controls rather than relying on marketing navigation or hostname obscurity.

## Localization Contract

Supported locales are `en` and `es`. The public marketing surface is
translated by URL (below). The evaluation app (`app.caudals.com`) is available
in American English and Castilian Spanish, chosen per person: the
`caudals_locale` cookie is read by `app/(evaluation)/layout.tsx`, published as
`window.__CAUDALS_LOCALE` before any bundle runs, and switching language
reloads the page. Strings live in `lib/evals/messages/en.ts` and `es.ts`
(missing Spanish keys fall back to English); fixed labels in data tables go
through `tr()` in `lib/evals/messages/phrases.ts`, and curated server messages
through `trServer()`. Spanish pages render on the client only, so the server
never sends English text they would replace. PDF and Word exports are written
in the requester's language (`lib/evals/reports/i18n.ts`); recorded questions,
answers and model-written text keep their own words. Retained `/auth/*`
routes remain English-only; `/admin` is removed and returns 404.

### URL shape

- Every public page lives at `/{locale}{path}`: `/en/blog`, `/es/legal/privacy`.
  There is no unprefixed default, so each page has exactly one canonical URL and
  each language is indexed independently.
- An unprefixed public path is redirected once (307) by `proxy.ts` to the
  negotiated locale. An unsupported language prefix (`/fr/blog`) is a 404.
- Some pages translate their path: `/es/sectores/banca` is `/en/sectors/banking`,
  and the Spanish funnel and legal pages are `/es/contacto`, `/es/llamada`,
  `/es/legal/privacidad`, `/es/legal/terminos` and `/es/legal/aviso-legal`.
  Code always names a page by its internal path (the folder under `app/[locale]`,
  e.g. `/sectors/banking`); `localizePathname` produces the public form,
  `TRANSLATED_PATHS` in `lib/i18n/routing.ts` defines the pairs, and the proxy
  rewrites the public slug to the route and 308-redirects the internal form or
  another language's slug to the canonical URL.
- `lib/i18n/routing.ts` is the single definition of that shape.
  `isNonLocalizedPath` lists every prefix that stays outside the locale tree —
  retired `/admin` paths, auth, APIs, sitemaps, `robots.txt` and `llms.txt`. Add
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
  locale-free `@id` that every localized page references
  (`lib/structured-data.ts` has the shared builders and a `<`-escaping `jsonLd`).
- Share images are generated by `opengraph-image.tsx` files (`lib/og/render.tsx`,
  1200 × 630, Geist and Newsreader from `assets/fonts/`). Do not pass
  `imagePath` to `buildPublicMetadata` unless a page has its own image; the
  nearest `opengraph-image` supplies it, and X falls back to `og:image`.
- `htmlLimitedBots` in `next.config.js` extends Next's list of crawlers that get
  metadata blocking in `<head>` with the AI search crawlers, which do not run
  JavaScript. Keep it in step with the AI user agents in `app/robots.ts`.
- `www.caudals.com` 308-redirects to `caudals.com` in the proxy.

### Static rendering

- The public tree is prerendered per locale via `generateStaticParams`. Nothing
  in `app/layout.tsx` may read the request — `cookies()` or `headers()` there
  opts *every* route out of static rendering, including the marketing pages.
- There is no `app/layout.tsx`. `app/[locale]/layout.tsx` is a root layout that
  renders `<html lang={locale}>`, so the served HTML declares its language; the
  internal groups `(app)`, `(auth)` and `(evaluation)` have separate root
  layouts; the evaluation surface applies its own per-person locale contract. All of them render `components/document/root-document.tsx`. A URL
  under a locale that matches no page renders the localized
  `app/[locale]/not-found.tsx` (via `app/[locale]/[...missing]`); anything
  outside every root layout gets `app/global-not-found.tsx`.
- The internal surfaces declare `export const dynamic = "force-dynamic"` in
  their own group layouts, because they are authenticated and per-request.

## Platform UI Contract

Applies to `/workspace/*`, `/ops/*`, `/share`, `/evaluation-entry` and `/auth/*`.

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
- Overlays come from `components/evals/overlays.tsx` (`Modal`, `SidePanel`,
  `ActionMenu`, `CopyField`, `notify`). A dialog shows the outcome of its own
  action inside itself (`Modal`'s `alert`), never behind the scrim.
- Workspace context comes from `useWorkspace()` (`workspace-context.tsx`); pages
  do not take a `workspaces` prop. Links into a workspace go through `withOrg`.
- Authenticated workspace, operator and expert pages share one `EvalShell` in
  `app/(evaluation)/(authenticated)/layout.tsx`. Pages render their content inside
  it; navigation must preserve the sidebar, workspace selection and activity state.
  Sign-in, recovery and public invitation handling stay outside this layout.
- `app/(evaluation)/evaluation.css` holds only screen-specific rules (today the
  expert workbench). There is no legacy alias layer; do not reintroduce one.
- `/admin` and all its subroutes return 404 for authenticated and anonymous
  users. Its dashboard, sidebar and command palette are removed; no active
  navigation or auth return path may point to it.

## Implementation Rules

1. Start from existing design tokens and shared primitives.
2. Keep marketing navigation aligned with the public route contract while enforcing each private surface’s server-side access controls.
3. Prefer incremental, verifiable UI changes.
4. Avoid parallel component systems.
5. Preserve keyboard/focus behavior while restyling.
6. Centre new workflows on evaluation: case authoring, grading, run results, reports and the public demo. Do not extend marketplace, supplier or catalogue flows.
7. Verify platform UI against the isolated harness: `node e2e/evals/harness-server.mjs`
   serves the real components with fixture data on `127.0.0.1:4187`. It bundles
   `platform.css` + `evaluation.css`, so it is the fastest way to see a design
   change without a database or a session. `npx playwright test
   --config=e2e/evals/ui.config.ts` runs the UI contracts against it (48 tests:
   flows, focus, 390/768/1440 layouts, secrets never rendered). The harness
   mounts the client `ShellFrame` directly, because `EvalShell` reads server
   environment flags.

## Runtime Review

For frontend changes, use the level of inspection appropriate to the risk of the change:

- local type and lint checks for code edits,
- browser/devtools inspection for changed routes,
- console and network review for changed interaction paths,
- viewport review when layout or responsive behavior changes.
