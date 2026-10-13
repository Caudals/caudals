# Frontend Delivery Contract

## Scope

Implementation rules for the public funnel (including the `/demo` free test), the internal Operator Console, and the separate evaluation surfaces (`/ops`, `/workspace`, private report view).

## Stack and Constraints

The event contact microsite at `connect.caudals.com` is an intentionally static
exception to the application stack below: build-time HTML/SVG generation with
small progressive-enhancement JavaScript, using the public Paper fonts/palette.
Its independent `/{es,en}/{mario,alonso}` pages, contact downloads, QR sheet,
native sharing and offline cache live in `services/connect`; deployment and
device acceptance are documented in its README. It does not import either
application root layout or add routes to the main site's sitemap/navigation.

- Next.js App Router + React 19 + TypeScript
- Tailwind v4 + Radix + shared app primitives
- Light mode only in current scope. The platform token layer is dark-ready
  (`:root[data-theme="dark"]` in `packages/brand/platform.css`) but dark is not
  enabled and is not QA'd.
- **Two design languages, never blended.** Authenticated surfaces use the
  platform system (`packages/brand/platform.css`, `.p-root`); the public site
  keeps the editorial system (`packages/brand/tokens.css`, `app/globals.css`).
  `docs/DESIGN.md` is the authority for both and states which applies where.
- The public site is the landing page and its funnel: `/`, `/sectors`, `/sectors/*`, `/contact`, `/call`, `/blog`, `/blog/*`, `/newsletter`, `/newsletter/*`, and `/legal/*`. Primary marketing navigation surfaces Sectors and Contact, plus the rounded CTA: "Try it free" / "Pruébalo gratis" to `/demo` and a quiet "Sign in" to the app while `DEMO_PUBLIC=true` (launch L-04; on phones the pill sits beside the menu button), otherwise "Get started" / "Comenzar" to the diagnostic form; the footer adds "How it works" (the landing's `#how-it-works` anchor), one link per sector and, with the flag, "Free test" and "Sign in". Blog and Newsletter are temporarily hidden. `/call` is a public funnel page reachable by direct link and cross-linked from `/contact` and the landing.
- Deployed private surfaces include retained internal-account auth (`/auth/*`) and the invite-only evaluation product (`/ops`, `/workspace`, `/review`, `/evaluation-entry`, `/share`). Features remain governed by workspace permissions, entitlements and readiness gates; see the latest evals work-package records.
- The pre-pivot marketplace surfaces were removed: `/buyer`, `/supplier`, `/v1/*`, `/security`, `/pricing`, `/docs`, `/about`, `/careers`, `/catalogue`. They return `404`; do not reintroduce them.

## Routing and IA Contract

- There is no landing-mode flag; the public route set above is what the app builds.
- Public primary navigation is defined in `lib/navigation/public-links.ts` (currently Sectors and Contact; Blog and Newsletter are commented out). The footer may additionally expose meeting booking and legal pages.
- Legal and trust pages (`app/[locale]/legal/*`, launch L-01): Terms, Privacy, DPA (`/legal/dpa`, with the Word template at `/legal/caudals-dpa-{en,es}.docx` from `app/legal/[file]/route.ts`), Sub-processors, Security, Cookies and Legal notice. They share `components/legal/legal-page.tsx` and `legal-route.tsx`; `lib/legal/versions.ts` lists them (footer, sitemap, agent markdown and `llms.txt` read that list) with each document's version, shown as "Last updated". Only the legal notice is rendered per request, because it reads the company data (`LEGAL_ENTITY_*`). `/security`, `/docs` and `/pricing` stay removed: the trust pages live under `/legal`.
- Public discovery files use `/sitemap.xml` as an index for `/post-sitemap.xml` and `/page-sitemap.xml`; `/llms.txt` provides a curated AI-readable overview. These files list public content only.
- `/contact` is the general contact and intake path. It records evaluation requests (`lib/validators/evaluation-request.ts`, `lib/public/evaluation-request-intake.ts`): system type, stage, sector, owner role, what the system answers, an optional URL and the offer to start from. Landing links pass `?offer=reality-check` to preselect the free diagnostic; with `DEMO_PUBLIC` on, the closing card keeps that link under the free test. Keep the quiet form treatment.
- Sector pages: `lib/public/sectors.ts` holds the sector ids (the same ids as the `/contact` `sector` options) and each locale's slug; page copy lives in `content/sectors/{locale}.json` (`es.json` is type-checked against `en.json`, and `lib/sectors/content.test.ts` guards icons, completeness and claims); short names are in the `sectors.names` messages. Each page reuses the landing's Paper components (hero chat fixed to its sector, failure modes with sector examples, expert network with sector roles), adds a FAQ with `FAQPage` data and links to the form as `/contact?offer=reality-check&sector={id}`, which preselects the sector.
- Public offers live in `lib/public/evaluation-offers.ts`, shared by `/llms.txt`, agent markdown and home structured data. The landing page has no pricing section. Only the free Reality Check has a price; the Pilot Evaluation and the monthly subscription read "Personalized" and are quoted on scope. Each offer's `slug` is the `offer` value `/contact` accepts.
- `/call` is the public meeting-booking surface. It embeds the Cal.com inline scheduler (light theme, brand-aligned `cal-brand` accent) configured via the `CALCOM_LINK` env var, mirrors the quiet `/contact` treatment, and renders an explicit fallback panel when no link is configured. Keep it out of the primary landing navigation but cross-linked from `/contact`.
- `/demo` (`app/[locale]/demo`, `components/demo/*`, copy in the `demo` message namespace): the public no-signup test. One page, three states: start form (one field that accepts a page, an OpenAI-compatible endpoint or a curl command; the kind is inferred; with the queue on, a quiet notice says when the service is busy, degraded or at capacity, and the footnote discloses the backup model when the fallback is on), live run (a waiting run shows its place in line, an ETA range and the "Email me the report" form with its consent checkbox; a running one shows an ETA range beside the clock, the email option as one link, and tips once finding the chat has taken over a minute; the four explanatory steps become the progress, and questions, answers and verdicts fill a numbered ledger as they arrive) and report (score, failure causes, expandable results, account card). A run's private link is `/{locale}/demo#r=<id>.<token>`: the token stays in the fragment and is sent as `x-demo-token`; the browser also keeps it in an HttpOnly cookie. Once the report is ready, a bar pinned to the bottom leads to the account card and hides while the card is on screen. The front door while `DEMO_PUBLIC=true` (launch L-04): linked from the header, hero, sector pages and footer, indexed, with its own share image (`app/[locale]/demo/opengraph-image.tsx`) and entries in the sitemap, `llms.txt` and agent markdown; with the flag off it is reachable by direct link and `noindex`. With the flag, the account card also takes an optional company and offers, in order, Create free account (pill) · Book a readout (ghost pill to `/call`) · Send to a colleague (a link that opens an email field, a note that anyone with the link can open the report until it is deleted, and a required consent checkbox; `POST /api/demo/runs/:id/share`). The account link lands on `app.caudals.com/workspace/signup#<token>` (platform language, `AuthFrame`).
- Direct sign-up (`/workspace/start`, launch L-05): exists only while `SELF_SERVE_DIRECT_SIGNUP=true` (read on the server; otherwise 404). `AuthFrame` with work email and company, a privacy line, and one confirmation that never says whether an account or workspace exists. Free-mail and disposable refusals render as a warning with "Run the free test" to the public demo in the person's language. While the flag is on, the sign-in footer reads "New here? Create a free account" → `/workspace/start`, and an expired sign-up link offers "Request a new link"; a direct link's sign-up page omits the demo wording. Harness contracts cover 390, 768 and 1440 px and Spanish.
- Sample report (`/{locale}/sample-report`, `/es/informe-de-ejemplo`; launch L-33): the example evaluation as a server-rendered Paper page (`components/sample-report/*`, copy in `content/sample-report/{en,es}.json` because only this page reads it) with an "Example" label and the synthetic-data line at the top and bottom, and a downloadable PDF per language at `/sample-report/caudals-sample-report-en.pdf` and `/sample-report/caudals-informe-de-ejemplo-es.pdf`. Results are `<details>` elements; a small inline script opens a result when a `#tN` link points at it. No client bundle of its own. With `EXAMPLE_EVALUATION_ENABLED` off the page and PDFs answer 404; until `SAMPLE_REPORT_INDEXED` it is `noindex` and out of the sitemap and `llms.txt`. It is not linked from the landing or sector pages until the founder has read it.
- Report v2 (`/workspace/reports/:id`; launch L-17): the Overview opens with the executive summary (three sentences with "Evidence (n)" links, the sample size, the status badges each explained in one line) and its next steps — Book a readout (the `CALCOM_LINK` booking page in a new tab, read on the server by the page and carrying a hashed workspace id), Share and Download PDF (the heading's own dialogs, for the roles that have them) and Request expert review (`caudals.com/{locale}/contact?offer=pilot-evaluation` until L-26) — then the whole-percent score, then "Fix these first" (three to five fixes with evidence, a disabled "Re-run these questions" until L-18, CSV and Markdown exports built in the browser). Test results sort by severity by default ("Failures first" is the alternative) and export the failing answers as CSV; a result page has "Copy question". Methodology keeps the exact rate with decimals. The example evaluation shows the summary (its review labelled simulated) without next steps or re-run. The shared page (`/share`, `SharedReport`) adds "What this report is" above the report and "Test your own assistant free" below it, to the public demo with the share's referral code; recipients get no next steps. The share dialog offers 7, 30 and 90 days (30 by default) and shows "Opened N times, last on …" per link. Harness contracts in `e2e/evals/report-v2.contract.ts` cover 390, 768 and 1440 px and Spanish.
- Example evaluation (`/workspace/example`; launch L-33): read-only, rendered from the fixture with `ReportView` (no API calls of its own), labelled "Example"/"Ejemplo" with the synthetic-data line above every tab. Reached from the evaluations list (a card below the table, never counted in the filters), the empty states and Settings → General; owners and operators can hide it for the whole workspace (stored in the workspace's onboarding state, launch L-06; no device storage).
- Email (launch L-07): Settings → Notifications keeps the in-app categories, then one email checkbox per category (results and test sets, input required, failures, billing and credits for owners, regressions) for this workspace, and "Tips for getting started" (lifecycle email) for the person across workspaces. Saving sends the interface language as the email language. The client accepts the older summary shape (`email` only) and derives the boxes from it. `/workspace/unsubscribe#<token>` is public (`AuthFrame`): it reads the token from the fragment, removes it from the address bar and switches lifecycle email off only after "Unsubscribe" is pressed. When the server emailed a new invitation (`emailed: true`), the invitation dialog says so and still shows the private link. Email templates are not React pages: they live in `lib/email/` (see `docs/ARCHITECTURE.md` → Email). Harness contracts cover 390, 768 and 1440 px and Spanish.
- Self-serve sign-up (`/workspace/signup`): with `SIGNUP_TERMS_REQUIRED=true` (read on the server and passed as a prop) the form shows a required Terms and Privacy checkbox linking to the public pages in the person's language, and the API records both versions in `evals.terms_acceptance` in the same transaction that creates the account. The password field rates strength as the person types (length first, then variety; the server still requires only 12 characters). With `ONBOARDING_AUTOSTART=true` the form adds a "What happens next" line: a demo link says the demo is imported and the full test set starts preparing; a direct link says a checklist guides the next steps.
- First-run onboarding (launch L-06, `components/evals/onboarding-checklist.tsx`): renders only while `ONBOARDING_AUTOSTART=true`, which the shell reads on the server and provides through `OnboardingAvailability`. The evaluations list shows the optional two-question welcome to the owner (chips, "Save answers" and "Skip"; never blocks) and, for workspaces created through self-serve sign-up, the five-step activation checklist as a dismissable card (writers can hide it). Empty states always show the checklist (no hide) under L-33's example-evaluation link; the checklist card links the example too (`ExampleEvaluationLink`, nothing when the example is off or hidden); viewers see the checklist without actions instead of "ask an owner". The evaluation page of an imported demo shows the "first evaluation" panel (four `.p-checklist` steps with live status from `GET /evaluations/:id/onboarding`, polled every 4 s while anything moves, typical time ranges, "What happens next", the demo's recovery guidance with Connect and "Get help"); while the automatic start waits, Prepare replaces its Generate button with a line saying how many questions start by themselves. `.p-checklist`, `.p-choice-group` and `.p-first-eval-next` live in `packages/brand/platform.css`. Harness contracts cover 390, 768 and 1440 px, Spanish, the viewer and flag-off cases, and `/ops/growth` (welcome answers, the 30-minute activation table and help requests with Resolve).
- Buying credits (`/workspace/billing/top-up` and the Stripe return page `/workspace/billing/top-ups/<order>`, `components/evals/billing-top-up.tsx`, launch L-12): rendered only for owners of workspaces where payments are open (`paymentsAccess`, read on the server; otherwise the not-found page), with no navigation entry until L-15's billing screens. Platform kit: billing details form (business declaration required), the treatment line (IVA, reverse charge or not subject), a `p-choice-grid` of packs with credits, bonus, net and total, the Terms and Privacy checkbox linking to the public pages, and "Continue to secure payment", which posts with an `Idempotency-Key` and navigates to Stripe Checkout (`form-action` also allows `checkout.stripe.com` and `billing.stripe.com`). The return page polls the order until Stripe confirms it, and closes it when the person cancelled. A "Test mode" badge shows in Stripe test mode. Harness contracts cover the redirect, the details form, the return states, Spanish and 390/768/1440 px.
- Self-serve sign-up (`/workspace/signup`): with `SIGNUP_TERMS_REQUIRED=true` (read on the server and passed as a prop) the form shows a required Terms and Privacy checkbox linking to the public pages in the person's language, and the API records both versions in `evals.terms_acceptance` in the same transaction that creates the account.
- Evaluation customer workspace (`/workspace`): invitation-only account access, workspace-scoped owner/editor/viewer permissions, connection → source-backed test-set preparation → approved run → report. The old planned `/e/[projectId]` magic-link sketch does not govern this implementation.
- Workspace Settings → General shows Edit controls for platform administrators beside the monthly machine-spend limit, active run allowance, allowed connections, exports and scheduling. The shared entitlement form also preserves reviewed-case allowance, requires a reason and uses the audited `/budgets/:orgId/amendments` API with version checks and in-place reauthentication. Recorded spend stays ledger-derived. Manage roles opens Members, where administrators can change existing workspace memberships through `/workspaces/:orgId/members/:userId`; platform roles remain separate, concurrent edits are rejected, and the last owner cannot be demoted. Migration 077 adds scoped member listing, the restricted role-change function and before/after audit details.
- Do not add landing-page entry points to direct-route or authenticated surfaces unless explicitly requested.
- Direct-route surfaces verify their own access controls rather than relying on marketing navigation or hostname obscurity.

## Localization Contract

Supported locales are `en` and `es`. The public marketing surface is
translated by URL (below). The evaluation app (`app.caudals.com`) is available
in American English and Castilian Spanish, chosen per person: the
`caudals_locale` cookie (or, until the person picks one, the browser's
`Accept-Language`, so a Spanish browser opens the app in Spanish; no country
hint) is resolved by `lib/evals/interface-locale.ts` in `app/(evaluation)/layout.tsx`, published as
`window.__CAUDALS_LOCALE` before any bundle runs, and switching language
reloads the page. A link can choose the language for its reader: an app-host
evaluation page requested with `?lang=es` or `?lang=en` (for example a shared
report sent in outreach, `/share?lang=es#token=…`) has the cookie set by
`proxy.ts` and is redirected to the same URL without the parameter; the
browser keeps the `#token` fragment. Strings live in `lib/evals/messages/en.ts` and `es.ts`
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
  `/es/legal/privacidad`, `/es/legal/terminos`, `/es/legal/aviso-legal`,
  `/es/legal/encargo-de-tratamiento`, `/es/legal/subencargados` and
  `/es/legal/seguridad`.
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

- The public tree is prerendered per locale via `generateStaticParams` and
  revalidates every 300 s (`app/[locale]/layout.tsx`), so server-read runtime
  flags such as `DEMO_PUBLIC` reach prerendered pages a few minutes after the
  app restarts (and up to five minutes after each image build, pages still
  show the build's flag-off state). Read such flags in the layout and pass
  them down (`FrontDoorProvider`), never with `NEXT_PUBLIC_*`. `/demo` renders
  per request so its robots tag never lags the flag. Nothing
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

Evaluation model selection lives under **1. Connect** in the evaluation journey, alongside system connection management. The current step remains reachable while Connect is open; active preparation stays mounted. Lifecycle actions belong to the evaluation's three-dot menu and reflect server capabilities. Stop/restart dialogs explain retained evidence, draining calls and new budget use. Pause/stop/restart intent is shown from persisted state, and a new run must never display a previous run's progress or report as its results.
