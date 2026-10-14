# Frontend Delivery Contract

## Scope

Implementation rules for the public funnel (including the `/demo` free test), the internal Operator Console, and the separate evaluation surfaces (`/ops`, `/workspace`, private report view).

## Stack and Constraints

The event contact microsite at `connect.caudals.com` is an intentionally static
exception to the application stack below: Vite renders every page at build
time from `services/connect/src/site`, and a lazily loaded three.js stage
(`src/client/scene`) draws the glossy card, its shadow and the tilt-driven
reflections over a CSS card that is also the no-WebGL fallback. It keeps the
public Paper palette and Geist type (no italics or serif accents, by founder
request) in light and dark, follows the phone's colour scheme and
reduced-motion setting, ships no inline scripts or styles (strict CSP), and
does not import either application root layout or add routes to the main
site's sitemap/navigation. Deployment, Wallet passes and device acceptance
are in its README.

- Next.js App Router + React 19 + TypeScript
- Tailwind v4 + Radix + shared app primitives
- Light mode only in current scope. The platform token layer is dark-ready
  (`:root[data-theme="dark"]` in `packages/brand/platform.css`) but dark is not
  enabled and is not QA'd.
- **Two design languages, never blended.** Authenticated surfaces use the
  platform system (`packages/brand/platform.css`, `.p-root`); the public site
  keeps the editorial system (`packages/brand/tokens.css`, `app/globals.css`).
  `docs/DESIGN.md` is the authority for both and states which applies where.
- The public site is the landing page and its funnel: `/`, `/sectors`, `/sectors/*`, `/methodology`, `/contact`, `/call`, `/blog`, `/blog/*`, `/newsletter`, `/newsletter/*`, and `/legal/*`. Primary marketing navigation surfaces Sectors and Contact, plus the rounded CTA: "Try it free" / "Pruébalo gratis" to `/demo` and a quiet "Sign in" to the app while `DEMO_PUBLIC=true` (launch L-04; on phones the pill sits beside the menu button), otherwise "Get started" / "Comenzar" to the diagnostic form; the footer adds "How it works" (the landing's `#how-it-works` anchor), "Methodology" (launch L-20), one link per sector, a Trust column (Security, DPA, Sub-processors) beside Legal (Terms, Privacy, Cookies, Legal notice; launch L-30) and, with the flag, "Free test" and "Sign in". Blog and Newsletter stay hidden until their content is live (spec §7.7: four new blog posts; the newsletter restarted); on 2026-10-12 the newest post was from 2026-08-12 and the last issue from 2026-07-31. `/call` is a public funnel page reachable by direct link and cross-linked from `/contact` and the landing.
- Deployed private surfaces include retained internal-account auth (`/auth/*`) and the invite-only evaluation product (`/ops`, `/workspace`, `/review`, `/evaluation-entry`, `/share`). Features remain governed by workspace permissions, entitlements and readiness gates; see the latest evals work-package records.
- The pre-pivot marketplace surfaces were removed: `/buyer`, `/supplier`, `/v1/*`, `/security`, `/pricing`, `/docs`, `/about`, `/careers`, `/catalogue`. They return `404`; do not reintroduce them.

## Routing and IA Contract

- There is no landing-mode flag; the public route set above is what the app builds.
- Public primary navigation is defined in `lib/navigation/public-links.ts` (currently Sectors and Contact; Blog and Newsletter are commented out). The footer may additionally expose meeting booking and legal pages.
- Legal and trust pages (`app/[locale]/legal/*`, launch L-01): Terms, Privacy, DPA (`/legal/dpa`, with the Word template at `/legal/caudals-dpa-{en,es}.docx` from `app/legal/[file]/route.ts`), Sub-processors, Security, Cookies and Legal notice. They share `components/legal/legal-page.tsx` and `legal-route.tsx`; `lib/legal/versions.ts` lists them (footer, sitemap, agent markdown and `llms.txt` read that list) with each document's version, shown as "Last updated". Only the legal notice is rendered per request, because it reads the company data (`LEGAL_ENTITY_*`). `/security`, `/docs` and `/pricing` stay removed: the trust pages live under `/legal`.
- Public discovery files use `/sitemap.xml` as an index for `/post-sitemap.xml` and `/page-sitemap.xml`; `/llms.txt` provides a curated AI-readable overview. These files list public content only.
- `/contact` is the general contact and intake path, kept for pilots (launch L-30): "Request a pilot evaluation", then "Prefer to try it yourself? Run the free test" (with `DEMO_PUBLIC`) and the call link, then five fields: full name, work email, company, sector and what the pilot should cover. The offer comes from the link (`?offer=`, default `pilot-evaluation`) and the sector from `?sector=`; `lib/validators/evaluation-request.ts` still accepts the earlier structured fields, and the form sends `formVersion: "pilot-request-v2"`. Pilot links are `lib/public/pilot-request.ts`: with `DEMO_PUBLIC` on, the closing card reads "Need answers reviewed by experts in your sector? Request a pilot" and each sector page's hero offers its own "Or request a pilot reviewed by …" (copy in `content/sectors/{locale}.json` → `pilot`). Older `?offer=reality-check` links still open the form and record that offer. Keep the quiet form treatment.
- Sector pages: `lib/public/sectors.ts` holds the sector ids (the same ids as the `/contact` `sector` options) and each locale's slug; page copy lives in `content/sectors/{locale}.json` (`es.json` is type-checked against `en.json`, and `lib/sectors/content.test.ts` guards icons, completeness, claims, the pilot copy and D-06: no prices and no retired 48-hour diagnostic in the FAQ); short names are in the `sectors.names` messages. Each page reuses the landing's Paper components (hero chat fixed to its sector, failure modes with sector examples, expert network with sector roles) and adds a FAQ with `FAQPage` data. With `DEMO_PUBLIC` the primary CTA is the free test and the secondary a pilot request, `/contact?offer=pilot-evaluation&sector={id}` (launch L-30); without it, the form as `/contact?offer=reality-check&sector={id}`. Both preselect the sector.
- The localized 404 (`app/[locale]/not-found.tsx`) leads to the free test with `DEMO_PUBLIC` on, then the home page and the sectors (launch L-30).
- The landing's step 1 and FAQ name the free test; "How much does it cost?" answers with the free test and account, pay-as-you-go credits in the app and fixed-price pilots by quote, never a number (D-06; `lib/public/site-copy.test.ts`).
- Public offers live in `lib/public/evaluation-offers.ts`, shared by `/llms.txt`, agent markdown and home structured data. The landing page has no pricing section. In order (launch L-20): the free test (8 questions, no account), the free account, pay-as-you-go credits in the app (no amounts on public pages, D-06), the Pilot Evaluation and the monthly subscription (quoted on scope), and last the free manual diagnostic for teams who prefer that Caudals runs it. Each offer's `start` names where it begins: a public page (`/demo`), an app page, or the `/contact` form with its `offer` slug.
- `/call` is the public meeting-booking surface. A three-line agenda (what your assistant answers, how you check it today, what a test would cover) sits above the Cal.com inline scheduler (light theme, brand-aligned `cal-brand` accent) configured via the `CALCOM_LINK` env var; it mirrors the quiet `/contact` treatment and renders an explicit fallback panel when no link is configured. When Cal reports a booking (`bookingSuccessfulV2`), a confirmation in the visitor's language replaces the scheduler (date and time in their zone, the calendar invitation, and the free test as preparation) and takes focus (launch L-30). Keep it out of the primary landing navigation but cross-linked from `/contact`.
- `/demo` (`app/[locale]/demo`, `components/demo/*`, copy in the `demo` message namespace): the public no-signup test. One page, three states: start form (one field that accepts a page, an OpenAI-compatible endpoint or a curl command; the kind is inferred; with the queue on, a quiet notice says when the service is busy, degraded or at capacity, and the footnote discloses the backup model when the fallback is on), live run (a waiting run shows its place in line, an ETA range and the "Email me the report" form with its consent checkbox; a running one shows an ETA range beside the clock, the email option as one link, and tips once finding the chat has taken over a minute; the four explanatory steps become the progress, and questions, answers and verdicts fill a numbered ledger as they arrive) and report (score, failure causes, expandable results, the AI-disclosure check while `AI_DISCLOSURE_CHECK=true` (launch L-29: status with an ink mark that is never a cross, the reason, the quoted sentence, the conversation in a disclosure, and "Evidence for your own assessment, not a legal determination"; `components/demo/disclosure.tsx`), account card). The product report shows the same check on its Overview after the top findings (`components/evals/ai-disclosure-evidence.tsx`). A run's private link is `/{locale}/demo#r=<id>.<token>`: the token stays in the fragment and is sent as `x-demo-token`; the browser also keeps it in an HttpOnly cookie. Once the report is ready, a bar pinned to the bottom leads to the account card and hides while the card is on screen. The front door while `DEMO_PUBLIC=true` (launch L-04): linked from the header, hero, sector pages and footer, indexed, with its own share image (`app/[locale]/demo/opengraph-image.tsx`) and entries in the sitemap, `llms.txt` and agent markdown; with the flag off it is reachable by direct link and `noindex`. With the flag, the account card also takes an optional company and offers, in order, Create free account (pill) · Book a readout (ghost pill to `/call`) · Send to a colleague (a link that opens an email field, a note that anyone with the link can open the report until it is deleted, and a required consent checkbox; `POST /api/demo/runs/:id/share`). The account link lands on `app.caudals.com/workspace/signup#<token>` (platform language, `AuthFrame`).
- Direct sign-up (`/workspace/start`, launch L-05): exists only while `SELF_SERVE_DIRECT_SIGNUP=true` (read on the server; otherwise 404). `AuthFrame` with work email and company, a privacy line, and one confirmation that never says whether an account or workspace exists. Free-mail and disposable refusals render as a warning with "Run the free test" to the public demo in the person's language. While the flag is on, the sign-in footer reads "New here? Create a free account" → `/workspace/start`, and an expired sign-up link offers "Request a new link"; a direct link's sign-up page omits the demo wording. Harness contracts cover 390, 768 and 1440 px and Spanish.
- Sample report (`/{locale}/sample-report`, `/es/informe-de-ejemplo`; launch L-33): the example evaluation as a server-rendered Paper page (`components/sample-report/*`, copy in `content/sample-report/{en,es}.json` because only this page reads it) with an "Example" label and the synthetic-data line at the top and bottom, and a downloadable PDF per language at `/sample-report/caudals-sample-report-en.pdf` and `/sample-report/caudals-informe-de-ejemplo-es.pdf`. Results are `<details>` elements; a small inline script opens a result when a `#tN` link points at it. No client bundle of its own. With `EXAMPLE_EVALUATION_ENABLED` off the page and PDFs answer 404; until `SAMPLE_REPORT_INDEXED` it is `noindex` and out of the sitemap and `llms.txt`. It is not linked from the landing or sector pages until the founder has read it.
- Report v2 (`/workspace/reports/:id`; launch L-17): the Overview opens with the executive summary (three sentences with "Evidence (n)" links, the sample size, the status badges each explained in one line) and its next steps — Book a readout (the `CALCOM_LINK` booking page in a new tab, read on the server by the page and carrying a hashed workspace id), Share and Download PDF (the heading's own dialogs, for the roles that have them) and Request expert review (`caudals.com/{locale}/contact?offer=pilot-evaluation` until L-26) — then the whole-percent score, then "Fix these first" (three to five fixes with evidence, a disabled "Re-run these questions" until L-18, CSV and Markdown exports built in the browser). Test results sort by severity by default ("Failures first" is the alternative) and export the failing answers as CSV; a result page has "Copy question". Methodology keeps the exact rate with decimals. The example evaluation shows the summary (its review labelled simulated) without next steps or re-run. The shared page (`/share`, `SharedReport`) adds "What this report is" above the report and "Test your own assistant free" below it, to the public demo with the share's referral code; recipients get no next steps. The share dialog offers 7, 30 and 90 days (30 by default) and shows "Opened N times, last on …" per link. Harness contracts in `e2e/evals/report-v2.contract.ts` cover 390, 768 and 1440 px and Spanish.
- Methodology (`/{locale}/methodology`, `/es/metodologia`; launch L-20): a prerendered Paper reading page (`components/methodology/*`, copy in `content/methodology/{en,es}.json`) on how questions are written from sources, grading by meaning, the outcome labels with their ink marks, sample sizes and 95% intervals (the table is checked against the scorer's `wilson()`), review levels, traceability, limits and what Caudals never does. It closes with the free test (or the diagnostic request while `DEMO_PUBLIC` is off) and a call. Indexed, in the sitemap, `llms.txt` and agent markdown; linked from the footer, the demo report ("How we grade") and the in-app report's Methodology tab. Section anchors (`#labels`, `#samples`, …) are the same in both languages.
- Help centre (launch L-20): the help panel (account menu, ⌘K, or a step's "?") searches the help articles and opens one in place, with "Open as a page" to `/workspace/help/[slug]`; `/workspace/help` lists and searches them all. Every surface ends with email, "Book a 30-minute call" and the methodology link. Contextual "?" (`HelpLink`) sits beside Connect, Reference material, Test set, the run panels, the results summary and Scheduled runs. Settings → Developers adds the API reference under tokens and webhooks; the estimate endpoint is listed only when `BILLING_ESTIMATES_ENABLED=true` (read on the server, passed as `estimatesApi`). Harness contracts (`e2e/evals/help.contract.ts`) cover 390, 768 and 1440 px and Spanish.
- Example evaluation (`/workspace/example`; launch L-33): read-only, rendered from the fixture with `ReportView` (no API calls of its own), labelled "Example"/"Ejemplo" with the synthetic-data line above every tab. Reached from the evaluations list (a card below the table, never counted in the filters), the empty states and Settings → General; owners and operators can hide it for the whole workspace (stored in the workspace's onboarding state, launch L-06; no device storage).
- Sector packs and monthly new questions (launch L-25; `SECTOR_PACKS_ENABLED`, read on the server): `/ops/library/sector-packs` (`OperatorLibrary` section `sector-packs`; the tab appears when the page passes `sectorPacks`) and `/review/sector-packs` (verified experts and staff; nav item through `ShellFeatures.sectorPacks`) render `components/evals/sector-packs.tsx`. Customer side (`components/evals/sector-questions.tsx`): `SectorQuestionsCard` above the test-set review in Prepare and on the test set page, `MonthlyQuestionsPanel` under a test set's questions; both read their API and render nothing on 404 (flag off) or when no published pack exists, so no flag prop is needed. Adding sector questions remounts the review so it shows the new draft version.
- Readout mode (`/workspace/reports/:id/present?revision=`, `/workspace/example/present`; launch L-35): "Present" in the report heading (and on the example) while `READOUT_MODE_ENABLED` allows the person (`lib/evals/readout/access.ts`, read on the server and passed as a prop; the API checks it again). `components/evals/readout/*` portals a full-window view (`.p-readout`) over the shell; slides are the shared HTML template (`READOUT_CSS`, `renderReadoutSlide`) so the screen and the PDF match. Keyboard: ← / → / Space / PageUp / PageDown, Home / End, number keys (two quick digits for 10+), Esc exits to the report, P opens the presenter view (`?view=presenter` in a popup: current and next slide, notes for operators, timer with the §7.5 segment), F toggles full screen. Both windows stay in step over a `BroadcastChannel` named after the revision. Operators edit notes, transcript picks and the next step in a side panel (saved per revision; on the example, in `localStorage`); owners and editors change the next step for the session only. Slides scale with the window from 700 px wide (body text 24 slide units, 36 px at 1920 × 1080) and become a scrolling card below that; reduced motion fades instead of sliding. Copy lives in `lib/evals/reports/readout-copy.ts` (EN/ES, shared with the PDF).
- Expert review (launch L-26): `ExpertReviewRequest` (`components/evals/expert-review-request.tsx`) is the "Have an expert review this" action in the report's next steps (`ReportCta.expertReview`, replacing the L-17 contact link) and in the evaluation's results summary, for owners and workspace operators on a published report while `EXPERT_REVIEW_ORDERS_ENABLED` is on (read on the server, passed as the `expertReview` prop). The modal asks scope (radios), an optional note, deadline and sector; after sending, the action becomes a status line ("Requested — we'll reply within one working day", the order's due date, or the delivery). Ops: `ExpertManagement` gains Review requests and Bench tabs and `/ops/experts/reviews/:id` (`components/evals/expert-reviews.tsx`: request, CRM draft copy block, order form with a required redacted preview, order progress, publish/cancel, bench checklist side panel). Expert screens (`expert-workbench.tsx`) are fully localized, sort open work by due date with overdue/due-soon badges, show the save state in the heading (`aria-live`, not a status role) and take Ctrl/⌘+S, Ctrl/⌘+Enter and Alt+G. Contracts: `e2e/evals/expert-review.contract.ts`.
- Email (launch L-07): Settings → Notifications keeps the in-app categories, then one email checkbox per category (results and test sets, input required, failures, billing and credits for owners, regressions) for this workspace, and "Tips for getting started" (lifecycle email) for the person across workspaces. Saving sends the interface language as the email language. The client accepts the older summary shape (`email` only) and derives the boxes from it. `/workspace/unsubscribe#<token>` is public (`AuthFrame`): it reads the token from the fragment, removes it from the address bar and switches lifecycle email off only after "Unsubscribe" is pressed. When the server emailed a new invitation (`emailed: true`), the invitation dialog says so and still shows the private link. Email templates are not React pages: they live in `lib/email/` (see `docs/ARCHITECTURE.md` → Email). Harness contracts cover 390, 768 and 1440 px and Spanish.
- Upgrade moments (launch L-14, P-09, `components/evals/limit-dialog.tsx`): `evalRequest` announces every typed `PLAN_LIMIT_*` answer (`caudals:plan-limit`) and the shell's `LimitDialogHost` opens one platform `Modal`: the limit's name, the plan and where the workspace stands, then "With credits · pay as you go" (what PAYG adds, packs from €20 + VAT, the +20 % first top-up and the 1,000 free credits a month; only when credits unlock it) and "On a managed plan", with "Add credits" (owners, where payments are open; editors are told to ask an owner) and "Talk to us" (the booking page). The data come from `GET /billing/plan` (`usePlanSummary`), which answers 404 while plans v2 is off, so every screen keeps its pre-L-14 wording then. New evaluation: a disabled connection card reads "Available with credits" or "Available on a managed plan" and "What unlocks more connections?" opens the dialog; Settings → Monitoring adds "See what unlocks it" to the scheduling notice. Harness contracts cover 390, 768 and 1440 px, Spanish, the editor case and plans v2 off.
- Self-serve sign-up (`/workspace/signup`): with `SIGNUP_TERMS_REQUIRED=true` (read on the server and passed as a prop) the form shows a required Terms and Privacy checkbox linking to the public pages in the person's language, and the API records both versions in `evals.terms_acceptance` in the same transaction that creates the account. The password field rates strength as the person types (length first, then variety; the server still requires only 12 characters). With `ONBOARDING_AUTOSTART=true` the form adds a "What happens next" line: a demo link says the demo is imported and the full test set starts preparing; a direct link says a checklist guides the next steps.
- First-run onboarding (launch L-06, `components/evals/onboarding-checklist.tsx`): renders only while `ONBOARDING_AUTOSTART=true`, which the shell reads on the server and provides through `OnboardingAvailability`. The evaluations list shows the optional two-question welcome to the owner (chips, "Save answers" and "Skip"; never blocks) and, for workspaces created through self-serve sign-up, the five-step activation checklist as a dismissable card (writers can hide it). Empty states always show the checklist (no hide) under L-33's example-evaluation link; the checklist card links the example too (`ExampleEvaluationLink`, nothing when the example is off or hidden); viewers see the checklist without actions instead of "ask an owner". The evaluation page of an imported demo shows the "first evaluation" panel (four `.p-checklist` steps with live status from `GET /evaluations/:id/onboarding`, polled every 4 s while anything moves, typical time ranges, "What happens next", the demo's recovery guidance with Connect and "Get help"); while the automatic start waits, Prepare replaces its Generate button with a line saying how many questions start by themselves. `.p-checklist`, `.p-choice-group` and `.p-first-eval-next` live in `packages/brand/platform.css`. Harness contracts cover 390, 768 and 1440 px, Spanish, the viewer and flag-off cases, and `/ops/growth` (welcome answers, the 30-minute activation table and help requests with Resolve).
- Buying credits (`/workspace/billing/top-up` and the Stripe return page `/workspace/billing/top-ups/<order>`, `components/evals/billing-top-up.tsx`, launch L-12): rendered only for owners of workspaces where payments are open (`paymentsAccess`, read on the server; otherwise the not-found page), reached from Settings → Billing and usage (L-15). Platform kit: billing details form (business declaration required), the treatment line (IVA, reverse charge or not subject), a `p-choice-grid` of packs with credits, bonus, net and total, the Terms and Privacy checkbox linking to the public pages, and "Continue to secure payment", which posts with an `Idempotency-Key` and navigates to Stripe Checkout (`form-action` also allows `checkout.stripe.com` and `billing.stripe.com`). The return page polls the order until Stripe confirms it, and closes it when the person cancelled. A "Test mode" badge shows in Stripe test mode. Harness contracts cover the redirect, the details form, the return states, Spanish and 390/768/1440 px.
- Billing and usage (launch L-15, P-13, P-16, `components/evals/{billing-state,workspace-billing,run-estimate-dialog}.tsx`): shown only where the server says billing shows (`features.billing` from `BILLING_UI_ENABLED`, then `GET /billing/summary` answering for the workspace; viewers never ask). `BillingProvider` in the shell holds one summary per workspace and refreshes it every minute, on focus, every 4 s while a top-up is pending and on `caudals:billing-changed`. **Sidebar pill** (`BillingPill`, a nav row above Settings): plan · balance, warn tone below the low-balance threshold, links to Billing. **Low-balance banner** (`LowBalanceBanner`, a warn `Status` at the top of the canvas, not on Billing itself): "Add credits" for owners, dismissible per session until the balance drops further. **Settings → Billing and usage** tab with pill sub-tabs (`?view=`): Overview (`StatGrid`: available with the euro equivalent, held, used this month against the cap, plan and allowance; cap `Meter`, next expiry, auto-recharge, alerts), Top up (packs, auto-recharge form, saved card; owners), Usage (period select, `DayBars` chart with its table, by evaluation and run with rows linking to the report or evaluation, by model and meter, CSV export, owners' account activity from the ledger), Invoices (owners; only when `GET /billing/invoices` answers), Billing details (profile with VIES, Customer Portal; owners) and Limits and alerts (monthly and per-run caps, low-balance threshold, recipients; owners). **Settings → General** shows "Plan and limits" instead of the machine-spend row; entitlement amendments live only in ops. **Run estimate dialog**: every run started where billing shows opens it first (question count, connection, models with credit rates, p50–p90 credits with euros, balance, the largest hold, the time range and the §6.7 copy); where credits are enforced and the balance is below p90 it blocks with "Add X credits" (owners: the one-step `TopUpDialog` with the covering pack preselected; editors: ask an owner), unless auto-recharge covers the gap; contract workspaces get no gate; platform admins can jump to the model settings. **Paused for credits**: "Paused — add credits to continue" with Add credits, Resume and Finish; a cap pause links owners to Limits. The return page announces the paid order so the shell's balance updates at once, and offers the way back to where the purchase started (session storage). **Model rates** in Evaluation · Connect for customers: the models a run uses with their credit rates, and on pay as you go the price list. Notification centre: billing notices (category `billing`, card icon) link to the matching Billing tab. Harness: `e2e/evals/billing.contract.ts` (EN and ES, 390/768/1440 px, axe with no serious issues on the billing screens and the dialog).
- Your own model keys (launch L-27, `components/evals/{byok-settings,customer-key-notice}.tsx`): Settings → AI models shows to owners (and platform admins, above their engine settings) where `GET /engine/byok` answers: BYOK on for the workspace (`BYOK_ENABLED` / `BYOK_WORKSPACE_IDS`, read on the server) or a key still connected. Keys table (provider, saved/replaced date, state badge: Working, Out of quota, Rejected by your provider; actions menu: Replace key, Remove key), Engine tasks table (each role on "Your key · <provider>" with its model, or "Caudals' model · charged in credits"; a row menu: Use your key, Use Caudals' model), the data-routing note and, for free workspaces, why keys are unavailable. The key dialog is a password field (`autocomplete=off`) checked with the provider before saving; the typed key never stays on the page and is never shown again. The model dialog lists the models the key could list (a model id field when none), the tasks (all four by default) and an optional context window. "Your provider key failed: <reason>" (`CustomerKeyNotice`, error tone, "Fix the key" link to Settings → AI models for owners) shows on test-set preparation stopped on a key and on a run whose grading waits on one (`grading.blocked`). The run estimate dialog labels a key's roles "your key · no token credits"; reports show the data routing in Methodology. Harness: `e2e/evals/byok.contract.ts` (EN and ES, 390/768/1440 px, axe).
- Self-serve sign-up (`/workspace/signup`): with `SIGNUP_TERMS_REQUIRED=true` (read on the server and passed as a prop) the form shows a required Terms and Privacy checkbox linking to the public pages in the person's language, and the API records both versions in `evals.terms_acceptance` in the same transaction that creates the account.
- Evaluation customer workspace (`/workspace`): invitation-only account access, workspace-scoped owner/editor/viewer permissions, connection → source-backed test-set preparation → approved run → report. The old planned `/e/[projectId]` magic-link sketch does not govern this implementation.
- Workspace Settings → General has a Data Processing Agreement row (launch L-30, P-42, `components/evals/dpa-setting.tsx`): the help line, the record in one sentence (version, signer and date; an older version asks for the new one), "Read the DPA" and "Download for signature (Word)" on the public site in the person's language, and the countersigned-copy address. Owners get "Review and accept", a `Modal` with the version, the signer and one required confirmation, posting `{version, locale, requestId}` once per dialog to `/workspaces/:id/dpa`. Other members see the status and that an owner can accept. A load failure stays inside the row with Try again. Harness contracts (`e2e/evals/dpa.contract.ts`) cover 390, 768 and 1440 px and Spanish.
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
  `/es/legal/encargo-de-tratamiento`, `/es/legal/subencargados`,
  `/es/legal/seguridad`, `/es/informe-de-ejemplo` and `/es/metodologia`.
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

### Workspace Home, navigation and review (launch L-22)

- **Home** (`/workspace/home`, `components/evals/workspace-home.tsx`) is the first sidebar item and the landing page for workspace members while `WORKSPACE_HOME_ENABLED` is on (read on the server, passed to `ShellFrame` as `features.home`; off, the route answers 404 and the nav item is absent). It renders from the one workspace summary: "Needs your action" (exactly the evaluations list's Needs action filter, through `evaluationRows`; "See all" opens `/workspace/evaluations?filter=action`), the latest score per system with its three-run trend, the next scheduled run, the plan (`balance` prop reserved for L-15) and shortcuts with the example evaluation link.
- **Systems** has status (connected / needs attention), last successful check and last score columns, "Check now" and "Fix". `?system=<id>` opens a system's panel (Home, ⌘K, the evaluation's Connect step and its breadcrumb link there) and `&fix=1` scrolls to re-teaching the chat (owners), the key (editors) or pairing. The Connect step shows the same health block (`ConnectionHealth`).
- **⌘K** lists evaluations, reports, systems (deep links), test sets and every Settings tab the person can open (`components/evals/settings-tabs.ts`, shared with Settings). An evaluation's breadcrumb is Evaluations › system › evaluation (`usePageCrumb(label, parent)`); an open system is Systems › system.
- **Remembered tabs.** Settings and reports reopen on the tab this device last showed (`caudals.tab.settings`, `caudals.tab.report` in `localStorage`, best effort) unless the link names a tab or a result. Shared and example reports do not remember.
- **Test-set review** (`TestSetReview` in `components/evals/preparation-parts.tsx`): free and pay-as-you-go workspaces open on a spot check of 10 questions (spread across source pages, most severe first; `lib/evals/review/spot-check.ts`), each marked "Looks right", edited in place or removed; "Approve and run" (or "Approve without running") unlocks when all are checked and says the report will be preliminary. "Review all N questions" opens the full review, the only mode for managed workspaces: search, difficulty chips, a source-page filter, select (one or all shown), "Mark as checked", "Remove selected" (one request, confirmed) and inline edit. The approval sends `review` (mode and checked ids) for the audit trail. Spot-check progress survives a reload in the tab (`sessionStorage`).
- **Review keyboard shortcuts** (while no field, dialog or menu has the keyboard; "Keyboard shortcuts" or `?` lists them): `j` next question, `k` previous, `c` mark as right (or undo), `x` select (full review), `e` edit, `r` remove (asks first), `/` search (opens the full review from the spot check), `?` show the list.

### Accessibility and performance budgets (launch L-24)

- **Accessibility gate (P-46).** `e2e/evals/a11y.contract.ts` (in `ui.config.ts`) runs axe (`e2e/evals/axe.ts`: WCAG 2.0–2.2 A/AA plus best practices, serious and critical only, colours checked at rest) on the core screens: landing (EN/ES), demo start, live and report, sign-up from the demo, direct sign-up, sign-in, evaluations list, new evaluation, the evaluation page (running and paused for credits), the report's overview and results, billing, top up and the estimate and top-up dialogs. It also checks that dialogs take, keep and return focus, that progress is announced (`aria-live`, `progressbar` values), that nothing moves under reduced motion, and that the funnel (landing → demo → report → sign-up) can be completed with the keyboard alone, with a visible focus indicator on every stop. `e2e/a11y-public.spec.ts` runs the same axe pass on served pages (a production build in CI, or production with `PLAYWRIGHT_BASE_URL`/`PLAYWRIGHT_APP_URL`). The harness serves the landing at `/en` and `/es` and the demo at `/en/demo` and `/es/demo` with the front door on.
- **Performance budgets (P-47).** `lighthouserc.js`: the landing (`/en`), the demo (`/en/demo`) and direct sign-up (`/workspace/start`), mobile (default) and desktop (`LHCI_FORM_FACTOR=desktop`), three runs, median asserted. CLS < 0.1 and TBT < 200 ms are errors everywhere; LCP < 2.5 s is an error for sign-up and on desktop, and a warning plus a regression ceiling for the mobile landing and demo until the public-site weight follow-up (L-24.md). CI's `budgets` job builds the app and runs both, only when files that reach those pages change.
- **Public pages stay light.** Everything on the public site is paid for on a phone's first visit: no animation or motion library (CSS keyframes, as the cookie notice), no session client (`RootDocument session={false}` in the public layout: nothing public depends on who is signed in), and the largest text renders on the server at full opacity (`.lp-lift` for the hero headline and standfirst; the demo's start view is server-rendered, and a run's private link hides it before the first paint).
- **The demo's proof of work** runs in a Blob worker built from `powKernel`'s source and read back by property name (`components/demo/pow.ts`), so minification cannot break it; it starts when the visitor engages with the form, and the main-thread fallback works in slices of at most 8 ms. `lib/demo/demo.test.ts` runs the worker source from an esbuild-minified bundle.

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
   --config=e2e/evals/ui.config.ts` runs the UI contracts against it (312 tests
   on 2026-10-14: flows, focus, 390/768/1440 layouts, axe, secrets never rendered). The harness
   mounts the client `ShellFrame` directly, because `EvalShell` reads server
   environment flags.

## Runtime Review

For frontend changes, use the level of inspection appropriate to the risk of the change:

- local type and lint checks for code edits,
- browser/devtools inspection for changed routes,
- console and network review for changed interaction paths,
- viewport review when layout or responsive behavior changes.

Evaluation model selection lives under **1. Connect** in the evaluation journey, alongside system connection management. The current step remains reachable while Connect is open; active preparation stays mounted. Lifecycle actions belong to the evaluation's three-dot menu and reflect server capabilities. Stop/restart dialogs explain retained evidence, draining calls and new budget use. Pause/stop/restart intent is shown from persisted state, and a new run must never display a previous run's progress or report as its results.
