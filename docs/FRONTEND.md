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
- The localized 404 (`app/[locale]/not-found.tsx`) leads to the free test with `DEMO_PUBLIC` on, then the home page and the sectors (launch L-30). On the app host the 404 for unmatched URLs (`app/global-not-found.tsx`) passes the public origin to `PublicRoot`, so its links and the cookie notice's policy link (`LocaleLink`) go to `caudals.com`. A signed-in page that calls `notFound()` renders `app/(evaluation)/(authenticated)/not-found.tsx` inside the app shell instead.
- The internal documents (`RootDocument`) renew the better-auth session with `SessionKeepAlive` (`lib/auth/session-keep-alive.tsx`): at most one `GET /api/auth/get-session` per five minutes per browser while the page is visible. Do not mount better-auth's `useSession` in a layout: one request per page load and focus runs into better-auth's per-visitor limit (QA 2026-10-15). Server pages and the API check the session themselves.
- The landing's step 1 and FAQ name the free test; "How much does it cost?" answers with the free test and account, pay-as-you-go credits in the app and fixed-price pilots by quote, never a number (D-06; `lib/public/site-copy.test.ts`).
- Public offers live in `lib/public/evaluation-offers.ts`, shared by `/llms.txt`, agent markdown and home structured data. The landing page has no pricing section. In order (launch L-20): the free test (8 questions, no account), the free account, pay-as-you-go credits in the app (no amounts on public pages, D-06), the Pilot Evaluation and the monthly subscription (quoted on scope), and last the free manual diagnostic for teams who prefer that Caudals runs it. Each offer's `start` names where it begins: a public page (`/demo`), an app page, or the `/contact` form with its `offer` slug.
- `/call` is the public meeting-booking surface. A three-line agenda (what your assistant answers, how you check it today, what a test would cover) sits above the Cal.com inline scheduler (light theme, brand-aligned `cal-brand` accent) configured via the `CALCOM_LINK` env var; it mirrors the quiet `/contact` treatment and renders an explicit fallback panel when no link is configured. When Cal reports a booking (`bookingSuccessfulV2`), a confirmation in the visitor's language replaces the scheduler (date and time in their zone, the calendar invitation, and the free test as preparation) and takes focus (launch L-30). Keep it out of the primary landing navigation but cross-linked from `/contact`.
- `/demo` (`app/[locale]/demo`, `components/demo/*`, copy in the `demo` message namespace): the public no-signup test. One page, three states: start form (one field that accepts a page, an OpenAI-compatible endpoint or a curl command; the kind is inferred; with the queue on, a quiet notice says when the service is busy, degraded or at capacity, and the footnote discloses the backup model when the fallback is on), live run (a waiting run shows its place in line, an ETA range and the "Email me the report" form with its consent checkbox; a running one shows an ETA range beside the clock, the email option as one link, and tips once finding the chat has taken over a minute; the four explanatory steps become the progress, and questions, answers and verdicts fill a numbered ledger as they arrive) and report (score, failure causes, expandable results, the AI-disclosure check while `AI_DISCLOSURE_CHECK=true` (launch L-29: status with an ink mark that is never a cross, the reason, the quoted sentence, the conversation in a disclosure, and "Evidence for your own assessment, not a legal determination"; `components/demo/disclosure.tsx`), account card). The product report shows the same check on its Overview after the top findings (`components/evals/ai-disclosure-evidence.tsx`). A run's private link is `/{locale}/demo#r=<id>.<token>`: the token stays in the fragment and is sent as `x-demo-token`; the browser also keeps it in an HttpOnly cookie. Once the report is ready, a bar pinned to the bottom leads to the account card and hides while the card is on screen. The front door while `DEMO_PUBLIC=true` (launch L-04): linked from the header, hero, sector pages and footer, indexed, with its own share image (`app/[locale]/demo/opengraph-image.tsx`) and entries in the sitemap, `llms.txt` and agent markdown; with the flag off it is reachable by direct link and `noindex`. With the flag, the account card also takes an optional company and offers, in order, Create free account (pill) · Book a readout (ghost pill to `/call`) · Send to a colleague (a link that opens an email field, a note that anyone with the link can open the report until it is deleted, and a required consent checkbox; `POST /api/demo/runs/:id/share`). The account link lands on `app.caudals.com/workspace/signup#<token>` (platform language, `AuthFrame`).
- Direct sign-up (`/workspace/start`, launch L-05): exists only while `SELF_SERVE_DIRECT_SIGNUP=true` (read on the server; otherwise 404). `AuthFrame` with work email and company, a privacy line, and one confirmation that never says whether an account or workspace exists. Free-mail and disposable refusals render as a warning with "Run the free test" to the public demo in the person's language. While the flag is on, the sign-in footer reads "New here? Create a free account" → `/workspace/start`, and an expired sign-up link offers "Request a new link"; a direct link's sign-up page omits the demo wording. Harness contracts cover 390, 768 and 1440 px and Spanish.
- Sample report (`/{locale}/sample-report`, `/es/informe-de-ejemplo`; launch L-33): the example evaluation as a server-rendered Paper page (`components/sample-report/*`, copy in `content/sample-report/{en,es}.json` because only this page reads it) with an "Example" label and the synthetic-data line at the top and bottom, and a downloadable PDF per language at `/sample-report/caudals-sample-report-en.pdf` and `/sample-report/caudals-informe-de-ejemplo-es.pdf`. Results are `<details>` elements; a small inline script opens a result when a `#tN` link points at it. No client bundle of its own. With `EXAMPLE_EVALUATION_ENABLED` off the page and PDFs answer 404; until `SAMPLE_REPORT_INDEXED` it is `noindex` and out of the sitemap and `llms.txt`. It is not linked from the landing or sector pages until the founder has read it.
- Report v2 (`/workspace/reports/:id`; launch L-17): the Overview opens with the executive summary (three sentences with "Evidence (n)" links, the sample size, the status badges each explained in one line) and its next steps — Book a readout (the `CALCOM_LINK` booking page in a new tab, read on the server by the page and carrying a hashed workspace id), Share and Download PDF (the heading's own dialogs, for the roles that have them) and Request expert review (`caudals.com/{locale}/contact?offer=pilot-evaluation` until L-26) — then the whole-percent score, then "Fix these first" (three to five fixes with evidence, a disabled "Re-run these questions" until L-18, CSV and Markdown exports built in the browser). Test results sort by severity by default ("Failures first" is the alternative) and export the failing answers as CSV; a result page has "Copy question". Methodology keeps the exact rate with decimals. The example evaluation shows the summary (its review labelled simulated) without next steps or re-run. The shared page (`/share`, `SharedReport`) adds "What this report is" above the report and "Test your own assistant free" below it, to the public demo with the share's referral code; recipients get no next steps. The share dialog offers 7, 30 and 90 days (30 by default) and shows "Opened N times, last on …" per link. Harness contracts in `e2e/evals/report-v2.contract.ts` cover 390, 768 and 1440 px and Spanish.
- "Send to my vendor" (launch P-54): owners and operators get a secondary button beside "Fix these first" on the current published revision (`cta.onSendToVendor` → `ReportCommands.sendToVendor`). `VendorShareDialog` (`components/evals/vendor-share.tsx`) states what the vendor sees and does not see and that the page mentions the partner programme, offers the 7/30/90-day presets, lists this report's fix-list links with "Opened N times…" and Revoke, previews the vendor's page in a side panel (the same `projectFixList` the server uses), and returns `/share/fixes#token=…` once. The report's share dialog labels those links "Fix list only". The vendor's page `/share/fixes` (`app/(evaluation)/share/fixes/page.tsx`, `VendorFixListPage`) is the one Paper page inside the evaluation group: it loads Geist and Newsreader itself with `next/font`, renders its own frame (wordmark, context, EN/ES buttons that set the app's language cookie) instead of `PublicFrame`, reads the token like `/share` (`components/evals/share-token.ts`) and moves a report token to `/share` (and `/share` moves a fix-list token here). Markdown and CSV downloads are built in the browser. Copy: `vendor*`, `sendToVendor*` and `shareScopeFixList` in `lib/evals/messages`; the fix wording is `summary-copy.ts`. Harness contracts: `e2e/evals/vendor-fix-list.contract.ts` (390 and 1440 px, EN/ES, axe, the Spanish scanner).
- Methodology (`/{locale}/methodology`, `/es/metodologia`; launch L-20): a prerendered Paper reading page (`components/methodology/*`, copy in `content/methodology/{en,es}.json`) on how questions are written from sources, grading by meaning, the outcome labels with their ink marks, sample sizes and 95% intervals (the table is checked against the scorer's `wilson()`), review levels, traceability, limits and what Caudals never does. It closes with the free test (or the diagnostic request while `DEMO_PUBLIC` is off) and a call. Indexed, in the sitemap, `llms.txt` and agent markdown; linked from the footer, the demo report ("How we grade") and the in-app report's Methodology tab. Section anchors (`#labels`, `#samples`, …) are the same in both languages.
- Help centre (launch L-20): the help panel (account menu, ⌘K, or a step's "?") searches the help articles and opens one in place, with "Open as a page" to `/workspace/help/[slug]`; `/workspace/help` lists and searches them all. Every surface ends with email, "Book a 30-minute call" and the methodology link. Contextual "?" (`HelpLink`) sits beside Connect, Reference material, Test set, the run panels, the results summary and Scheduled runs. Settings → Developers adds the API reference under tokens and webhooks; the estimate endpoint is listed only when `BILLING_ESTIMATES_ENABLED=true` (read on the server, passed as `estimatesApi`). Harness contracts (`e2e/evals/help.contract.ts`) cover 390, 768 and 1440 px and Spanish.
- Example evaluation (`/workspace/example`; launch L-33): read-only, rendered from the fixture with `ReportView` (no API calls of its own), labelled "Example"/"Ejemplo" with the synthetic-data line above every tab. Reached from the evaluations list (a card below the table, never counted in the filters), every empty state (evaluations, systems, test sets and reports: the action for viewers and where the page has no action of its own, a text link beside a writer's action; launch G1) and Settings → General; owners and operators can hide it for the whole workspace (stored in the workspace's onboarding state, launch L-06; no device storage).
- Sector packs and monthly new questions (launch L-25; `SECTOR_PACKS_ENABLED`, read on the server): `/ops/library/sector-packs` (`OperatorLibrary` section `sector-packs`; the tab appears when the page passes `sectorPacks`) and `/review/sector-packs` (verified experts and staff; nav item through `ShellFeatures.sectorPacks`) render `components/evals/sector-packs.tsx`. Customer side (`components/evals/sector-questions.tsx`): `SectorQuestionsCard` above the test-set review in Prepare and on the test set page, `MonthlyQuestionsPanel` under a test set's questions; both read their API and render nothing on 404 (flag off) or when no published pack exists, so no flag prop is needed. Adding sector questions remounts the review so it shows the new draft version.
- Ask your report (launch L-36): while `REPORT_QUESTIONS_ENABLED` or `REPORT_QUESTIONS_WORKSPACE_IDS` could open it (`reportQuestionsConfigured`, read by the report page and passed as a prop), `ReportQuestions` (`components/evals/report-questions.tsx`) asks `GET /reports/:id/questions` for the revision and shows "Ask this report" in the heading only when the API says the workspace has it (or questions are stored). The side panel shows the typical cost and limits before the first question (and beside the field), three suggestions, the thread (question bubble, answer sentences each followed by `.p-cite` T/F buttons that close the panel and open the result, `?result=`, or the finding on the Findings tab, focused), the fixed refusal with "How we evaluate" and "Book a readout", "I can't answer that from this report.", and failure lines saying nothing was charged; queued questions are polled every 2 s. Answers and fixed texts use the question's language (`lang` attribute); the panel follows the interface language. Viewers read; owners and operators delete (confirm dialog). Not on the shared page or the example. Harness contracts in `e2e/evals/report-questions.contract.ts` (390, 768, 1440 px, Spanish, axe).
- Readout mode (`/workspace/reports/:id/present?revision=`, `/workspace/example/present`; launch L-35): "Present" in the report heading (and on the example) while `READOUT_MODE_ENABLED` allows the person (`lib/evals/readout/access.ts`, read on the server and passed as a prop; the API checks it again). `components/evals/readout/*` portals a full-window view (`.p-readout`) over the shell; slides are the shared HTML template (`READOUT_CSS`, `renderReadoutSlide`) so the screen and the PDF match. Keyboard: ← / → / Space / PageUp / PageDown, Home / End, number keys (two quick digits for 10+), Esc exits to the report, P opens the presenter view (`?view=presenter` in a popup: current and next slide, notes for operators, timer with the §7.5 segment), F toggles full screen. Both windows stay in step over a `BroadcastChannel` named after the revision. Operators edit notes, transcript picks and the next step in a side panel (saved per revision; on the example, in `localStorage`); owners and editors change the next step for the session only. Slides scale with the window from 700 px wide (body text 24 slide units, 36 px at 1920 × 1080) and become a scrolling card below that; reduced motion fades instead of sliding. Copy lives in `lib/evals/reports/readout-copy.ts` (EN/ES, shared with the PDF).
- Expert review (launch L-26): `ExpertReviewRequest` (`components/evals/expert-review-request.tsx`) is the "Have an expert review this" action in the report's next steps (`ReportCta.expertReview`, replacing the L-17 contact link) and in the evaluation's results summary, for owners and workspace operators on a published report while `EXPERT_REVIEW_ORDERS_ENABLED` is on (read on the server, passed as the `expertReview` prop). The modal asks scope (radios), an optional note, deadline and sector; after sending, the action becomes a status line ("Requested — we'll reply within one working day", the order's due date, or the delivery). Ops: `ExpertManagement` gains Review requests and Bench tabs and `/ops/experts/reviews/:id` (`components/evals/expert-reviews.tsx`: request, CRM draft copy block, order form with a required redacted preview, order progress, publish/cancel, bench checklist side panel). Expert screens (`expert-workbench.tsx`) are fully localized, sort open work by due date with overdue/due-soon badges, show the save state in the heading (`aria-live`, not a status role) and take Ctrl/⌘+S, Ctrl/⌘+Enter and Alt+G. Contracts: `e2e/evals/expert-review.contract.ts`.
- Email (launch L-07): Settings → Notifications keeps the in-app categories, then one email checkbox per category (results and test sets, input required, failures, billing and credits for owners, regressions) for this workspace, and "Tips for getting started" (lifecycle email) for the person across workspaces. Saving sends the interface language as the email language. The client accepts the older summary shape (`email` only) and derives the boxes from it. `/workspace/unsubscribe#<token>` is public (`AuthFrame`): it reads the token from the fragment, removes it from the address bar and switches lifecycle email off only after "Unsubscribe" is pressed. When the server emailed a new invitation (`emailed: true`), the invitation dialog says so and still shows the private link. Email templates are not React pages: they live in `lib/email/` (see `docs/ARCHITECTURE.md` → Email). Harness contracts cover 390, 768 and 1440 px and Spanish.
- Upgrade moments (launch L-14, P-09, `components/evals/limit-dialog.tsx`): `evalRequest` announces every typed `PLAN_LIMIT_*` answer (`caudals:plan-limit`) and the shell's `LimitDialogHost` opens one platform `Modal`: the limit's name, the plan and where the workspace stands, then "With credits · pay as you go" (what PAYG adds, packs from €20 + VAT, the +20 % first top-up and the 1,000 free credits a month; only when credits unlock it) and "On a managed plan", with "Add credits" (owners, where payments are open; editors are told to ask an owner) and "Talk to us" (the booking page). The data come from `GET /billing/plan` (`usePlanSummary`), which answers 404 while plans v2 is off, so every screen keeps its pre-L-14 wording then. New evaluation: a disabled connection card reads "Available with credits" or "Available on a managed plan" and "What unlocks more connections?" opens the dialog; Settings → Monitoring adds "See what unlocks it" to the scheduling notice. Harness contracts cover 390, 768 and 1440 px, Spanish, the editor case and plans v2 off.
- Self-serve sign-up (`/workspace/signup`): with `SIGNUP_TERMS_REQUIRED=true` (read on the server and passed as a prop) the form shows a required Terms and Privacy checkbox linking to the public pages in the person's language, and the API records both versions in `evals.terms_acceptance` in the same transaction that creates the account. The password field rates strength as the person types (length first, then variety; the server still requires only 12 characters). With `ONBOARDING_AUTOSTART=true` the form adds a "What happens next" line: a demo link says the demo is imported and the full test set starts preparing; a direct link says a checklist guides the next steps.
- First-run onboarding (launch L-06, `components/evals/onboarding-checklist.tsx`): renders only while `ONBOARDING_AUTOSTART=true`, which the shell reads on the server and provides through `OnboardingAvailability`. The evaluations list shows the optional two-question welcome to the owner (chips, "Save answers" and "Skip"; never blocks) and, for workspaces created through self-serve sign-up, the five-step activation checklist as a dismissable card (writers can hide it). Empty states always show the checklist (no hide) under L-33's example-evaluation link; the checklist card links the example too (`ExampleEvaluationLink`, nothing when the example is off or hidden); viewers see the checklist without actions instead of "ask an owner". The evaluation page of an imported demo shows the "first evaluation" panel (four `.p-checklist` steps with live status from `GET /evaluations/:id/onboarding`, polled every 4 s while anything moves, typical time ranges, "What happens next", the demo's recovery guidance with Connect and "Get help"); while the automatic start waits, Prepare replaces its Generate button with a line saying how many questions start by themselves. `.p-checklist`, `.p-choice-group` and `.p-first-eval-next` live in `packages/brand/platform.css`. Harness contracts cover 390, 768 and 1440 px, Spanish, the viewer and flag-off cases, and `/ops/growth` (welcome answers, the 30-minute activation table and help requests with Resolve).
- Buying credits (`/workspace/billing/top-up` and the Stripe return page `/workspace/billing/top-ups/<order>`, `components/evals/billing-top-up.tsx`, launch L-12): rendered only for owners of workspaces where payments are open (`paymentsAccess`, read on the server; otherwise the not-found page), reached from Settings → Billing and usage (L-15). Platform kit: billing details form (business declaration required), the treatment line (IVA, reverse charge or not subject), a `p-choice-grid` of packs with credits, bonus, net and total, the Terms and Privacy checkbox linking to the public pages, and "Continue to secure payment", which posts with an `Idempotency-Key` and navigates to Stripe Checkout (`form-action` also allows `checkout.stripe.com` and `billing.stripe.com`). The return page polls the order until Stripe confirms it, and closes it when the person cancelled. A "Test mode" badge shows in Stripe test mode. Harness contracts cover the redirect, the details form, the return states, Spanish and 390/768/1440 px.
- Billing and usage (launch L-15, P-13, P-16, `components/evals/{billing-state,workspace-billing,run-estimate-dialog}.tsx`): shown only where the server says billing shows (`features.billing` from `BILLING_UI_ENABLED`, then `GET /billing/summary` answering for the workspace; viewers never ask). `BillingProvider` in the shell holds one summary per workspace and refreshes it every minute, on focus, every 4 s while a top-up is pending and on `caudals:billing-changed`. **Sidebar pill** (`BillingPill`, a nav row above Settings): plan · balance, warn tone below the low-balance threshold, links to Billing. **Low-balance banner** (`LowBalanceBanner`, a warn `Status` at the top of the canvas, not on Billing itself): "Add credits" for owners, dismissible per session until the balance drops further. **Settings → Billing and usage** tab with pill sub-tabs (`?view=`): Overview (`StatGrid`: available with the euro equivalent, held, used this month against the cap, plan and allowance; cap `Meter`, next expiry, auto-recharge, alerts), Top up (packs, auto-recharge form, saved card; owners), Usage (period select, `DayBars` chart with its table, by evaluation and run with rows linking to the report or evaluation, by model and meter, CSV export, owners' account activity from the ledger), Invoices (owners; only when `GET /billing/invoices` answers), Billing details (profile with VIES, Customer Portal; owners) and Limits and alerts (monthly and per-run caps, the low-balance threshold — default or the owner's own, saved with the caps, launch G2 — and recipients; owners). **Settings → General** shows "Plan and limits" instead of the machine-spend row; entitlement amendments live only in ops. **Run estimate dialog**: every run started where billing shows opens it first (question count, connection, models with credit rates, p50–p90 credits with euros, balance, the largest hold, the time range and the §6.7 copy); where credits are enforced and the balance is below p90 it blocks with "Add X credits" (owners: the one-step `TopUpDialog` with the covering pack preselected; editors: ask an owner), unless auto-recharge covers the gap; contract workspaces get no gate; platform admins can jump to the model settings. **Paused for credits**: "Paused — add credits to continue" with Add credits, Resume and Finish; a cap pause links owners to Limits. The return page announces the paid order so the shell's balance updates at once, and offers the way back to where the purchase started (session storage). **Model rates** in Evaluation · Connect for customers: the models a run uses with their credit rates, and on pay as you go the price list. Notification centre: billing notices (category `billing`, card icon) link to the matching Billing tab. Harness: `e2e/evals/billing.contract.ts` (EN and ES, 390/768/1440 px, axe with no serious issues on the billing screens and the dialog, the paused run's progress included since G2).
- Your own model keys (launch L-27, `components/evals/{byok-settings,customer-key-notice}.tsx`): Settings → AI models shows to owners (and platform admins, above their engine settings) where `GET /engine/byok` answers: BYOK on for the workspace (`BYOK_ENABLED` / `BYOK_WORKSPACE_IDS`, read on the server) or a key still connected. Keys table (provider, saved/replaced date, state badge: Working, Out of quota, Rejected by your provider; actions menu: Replace key, Remove key), Engine tasks table (each role on "Your key · <provider>" with its model, or "Caudals' model · charged in credits"; a row menu: Use your key, Use Caudals' model), the data-routing note and, for free workspaces, why keys are unavailable. The key dialog is a password field (`autocomplete=off`) checked with the provider before saving; the typed key never stays on the page and is never shown again. The model dialog lists the models the key could list (a model id field when none), the tasks (all four by default) and an optional context window. "Your provider key failed: <reason>" (`CustomerKeyNotice`, error tone, "Fix the key" link to Settings → AI models for owners) shows on test-set preparation stopped on a key and on a run whose grading waits on one (`grading.blocked`). The run estimate dialog labels a key's roles "your key · no token credits"; reports show the data routing in Methodology. Harness: `e2e/evals/byok.contract.ts` (EN and ES, 390/768/1440 px, axe).
- Self-serve sign-up (`/workspace/signup`): with `SIGNUP_TERMS_REQUIRED=true` (read on the server and passed as a prop) the form shows a required Terms and Privacy checkbox linking to the public pages in the person's language, and the API records both versions in `evals.terms_acceptance` in the same transaction that creates the account.
- Evaluation customer workspace (`/workspace`): invitation-only account access, workspace-scoped owner/editor/viewer permissions, connection → source-backed test-set preparation → approved run → report. The old planned `/e/[projectId]` magic-link sketch does not govern this implementation.
- Workspace Settings → General has a Data Processing Agreement row (launch L-30, P-42, `components/evals/dpa-setting.tsx`): the help line, the record in one sentence (version, signer and date; an older version asks for the new one), "Read the DPA" and "Download for signature (Word)" on the public site in the person's language, and the countersigned-copy address. Owners get "Review and accept", a `Modal` with the version, the signer and one required confirmation, posting `{version, locale, requestId}` once per dialog to `/workspaces/:id/dpa`. Other members see the status and that an owner can accept. A load failure stays inside the row with Try again. Harness contracts (`e2e/evals/dpa.contract.ts`) cover 390, 768 and 1440 px and Spanish.
- Settings → Data (launch L-32, P-44, `components/evals/workspace-data-controls.tsx`), a tab for every member while `DATA_CONTROLS_ENABLED=true` (read on the server, passed as `dataControls`; the shell passes the same flag to ⌘K, which lists the tab for every member, gap G4): "Answer retention" (owners choose Until deleted (default), 30, 90 or 365 days; a shorter period first opens a `Modal` with the read-only counts from `?preview=`, what the pins keep and that removal cannot be undone; others see the setting) and "Export all workspace data" (owners: Prepare export, polling every 3 s while queued or running, then size, expiry, counts, Download ZIP and Delete export; failures say why). Settings → Danger zone lists what deletion does (access, credentials and tokens, runs and reports, stored files, the closed workspace and the erasure request, backups, no recall) and, with the flag, points to the export. The DPA row adds the countersigned copy (owners download it; platform operations attach a PDF and remove it with a reason). Harness: `e2e/evals/data-controls.contract.ts` (390/768/1440 px, EN and ES).
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
(a missing Spanish key would fall back to English, so `npm run i18n:check-parity`
fails on one); fixed labels in data tables go through `tr()` in
`lib/evals/messages/phrases.ts` (marked `phrase("…")` where they are defined),
and API errors through `apiErrorText()` (`lib/evals/messages/api-errors.ts`, launch L-23b; see
below). Spanish pages render on the client only, so the server
never sends English text they would replace.

The browser never loads the app's catalogues (launch L-24c). Client code
imports `t`, `tv` and `getLocale` from `lib/evals/messages/runtime.ts`, never
from `en.ts` (which registers both catalogues there when it loads: server,
tests, workers). Each page sends its messages in the reader's language in its
RSC payload with `<EvalsMessages>` (`components/evals/messages.tsx`), which
registers them while it renders, before the components that read them: the
evaluation layout sends the frame's keys (`shell`: errors, loading, language
menu); the signed-in layout (`(authenticated)/layout.tsx`) sends every key once,
so client-side navigation inside the app needs nothing more; each page outside
it (sign-in, sign-up, password reset, invitations, unsubscribe, two-factor
set-up, shared report, fix list) sends its own list with
`await evalsPageMessages(["workspace/start"])`. The lists are generated from
the code (`npm run i18n:evals-client-keys` → `lib/evals/messages/client-keys.ts`:
key literals, label tables, props such as `contextKey`, and template heads
such as `` `sheetProblem_${code}` ``). Two rules follow: never call `t`/`tv`
when a module loads (build label tables in a function), and regenerate the
lists after changing what one of those pages shows.
`tests/i18n/evals-client-messages.test.ts` (in the image build) fails on a
stale list, a module-scope call, a client import of the catalogues, a page
without an entry, and on any key a page reads but does not send (it renders
each one in both languages with only its keys). A missing key renders as the
key and logs `Missing evals message` outside production. PDF and Word exports are written
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
- Client components see only the messages the page sends them, in one
  language (launch L-24b): the public layout sends `PUBLIC_SHELL_MESSAGES`
  (`lib/i18n/client-messages.ts`: header, footer, cookie notice, 404 view) and
  a page sends the rest with `<ClientMessages locale groups={[…]}>`
  (`components/i18n/client-messages.tsx`) right around the client component
  that reads them (`"demo"`, `"steps.exam"`, `heroChatMessages(sectors)`). A
  missing group renders the key and logs `Missing message` in development;
  `tests/i18n/public-client-messages.test.ts` renders the landing, demo,
  sector pages, hub and 404 with exactly these subsets and fails on one. Never
  import `lib/i18n/messages` from a client component: it carries both
  catalogues (`lib/i18n/context.tsx` uses `lib/i18n/translate.ts`, which does
  not).
- Public components that render on the server and in the UI harness alike
  (landing sections, sector pages, hub, breadcrumbs) take `locale` (and
  `demoPublic`, read by the page with `demoPublicEnabled()`) as props and
  translate with `createScopedTranslator(locale, …)` from `lib/i18n/messages`;
  they must not import `server-only` modules, React hooks or `marks.tsx`
  (use `lib/marked-text`).
- Long-form prose (blog, legal) is content, not UI copy: it lives in
  `content/blog/{locale}/` and `content/legal/{locale}.json`.
- Zod schemas emit message *keys*, not sentences — they run where no locale is
  in scope, and the form resolves them at render. A schema that omits a custom
  message falls back to Zod's own English text, which is a defect.
- Do not ship hardcoded user-facing strings in public components, and do not
  reintroduce runtime DOM translation.
- EN/ES parity guard (launch L-23). The ESLint rule `caudals/no-ui-literals`
  (`scripts/lint/no-ui-literals.mjs`, part of `npm run lint` and of
  `npm run i18n:check-parity`) reports JSX text, visible attributes
  (`aria-label`, `title`, `placeholder`, `alt`, `label`, `*Label`,
  `description`, column `headers`…), visible object fields (`label:`,
  `title:`…) and messages passed to `setError`-style setters, under
  `components/evals`, `components/demo`, `app/(evaluation)`, the email
  templates and the public site's components and `app/[locale]` pages. Brand
  names, units, file formats and identifiers that read the same in both
  languages are in its `ALLOWED_TERMS`; a genuine exception takes
  `// eslint-disable-next-line caudals/no-ui-literals -- reason`. Fixed labels
  in data tables are written `phrase("…")` (or typed `Phrase`) and shown with
  `tr()`, so the Spanish entry must exist.
- `npm run i18n:check-parity` verifies every catalogue: the site JSON, the
  evaluation app (`lib/evals/messages`), the phrase table (every literal
  passed to `tr()`/`phrase()`), the emails (`lib/email/copy.ts`), the PDF/Word
  labels, the report summary and readout copy, the invoice wording, the legal
  JSON and the help articles. It fails on missing or extra keys, blank values,
  mismatched `{slots}` and Spanish values left identical to the English ones
  (unless language-neutral). Rendered checks: `tests/email/templates.test.ts`
  (structure and no copy from the other language), and
  `tests/evals/report-language-parity.test.ts` (PDF and Word); the UI harness
  scans Spanish screens with `e2e/evals/spanish-leaks.ts`
  (`spanish.contract.ts` and the Spanish tests of the other contracts). The
  image build runs the parity script and these tests, because the
  general CI workflow is disabled.
- API errors in the reader's language (launch L-23b). The API keeps its
  contract: `{ error: { code, message } }` with a stable code and an English
  sentence. `evalRequest`/`EvalRequestError` (`components/evals/api.ts`) show
  the sentence through `apiErrorText(code, message)`: in Spanish its entry in
  `API_MESSAGES_ES` (or the older `SERVER_ES` table in `phrases.ts`), a
  sentence with run-time parts through `API_PATTERNS_ES`, sentences joined
  into one message one by one, otherwise the code's own message
  (`API_CODES`, EN and ES), and for an unknown code a generic message with the
  code — never English prose. A failed `fetch` (offline) is `NETWORK_ERROR`
  and the 5xx support reference is localized. Direct `fetch` uploads build
  their error with `evalResponseError(status, body)`. Results the app shows
  (connection and web-search tests) go through `apiResultText()`, which
  quotes a model provider's own words as such. A reason or error code without
  a label of its own is shown by `codeText()`/`humanize()` as the code itself
  in Spanish, not as English words. A GET opened in the browser (a download
  link, a file in a new tab: `Sec-Fetch-Mode: navigate`) that fails gets a
  small page in the reader's language (`errorPage` in
  `lib/evals/domain/http.ts`, cookie then `Accept-Language`) with the API's
  status, instead of raw JSON. Token APIs for integrators
  (`/api/evals/v1/integrations/*`, the CI trigger, token estimates) and the
  private runner keep English codes and messages by contract.
- `scripts/i18n/api-errors.ts` lists every code and sentence the server can
  send (each `new EvalError(code, status, message)`, its default message,
  message tables, destructured tuples, helpers and subclasses that forward a
  message, route bodies outside `api()`, the sector-pack database messages
  the API passes through, and the platform admin's test results). `npm run
  i18n:check-parity` and `tests/i18n/api-errors.test.ts` (both in the image
  build) fail on a code or sentence without both languages, on a Spanish entry
  nothing sends any more, and on a message built at run time that is not
  reviewed in `DYNAMIC_SITES`. A new server message therefore needs its
  Spanish in `API_MESSAGES_ES` (or `API_PATTERNS_ES`) in the same change.

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
  layouts; the evaluation surface applies its own per-person locale contract. The public layout renders `components/document/public-root.tsx` (document, shell messages, front door, cookie notice); the internal ones `components/document/root-document.tsx`.
- **404 (launch L-24c).** A URL that matches no page, on either host
  (`/en/nada`, `/es/sectores/nada`, `app.caudals.com/workspace/nada`,
  `app.caudals.com/nada`), is answered by `app/global-not-found.tsx`: Next
  renders it on the server with status 404, so the localized Paper 404 and its
  free-test link (L-30) are in the HTML without JavaScript. Its language comes
  from the path the proxy saw (`x-caudals-pathname`), else the app's language
  cookie, the site's, then Accept-Language; it reads the request, so it is
  rendered per request. Do not add a catch-all page or call `notFound()` in a
  layout for a miss: Next 16 can only render a `notFound()` thrown while the
  page renders as an empty error shell (`<html id="__next_error__">`) that the
  browser fills in. Unknown values of a static dynamic segment use
  `dynamicParams = false` instead (`[locale]` on the landing page, sectors).
  Pages that must check a record (`results/[slug]`, `sector-index/[quarter]`)
  still call `notFound()`: they answer 404 and `app/[locale]/not-found.tsx`
  appears once the page's script runs.
- The internal surfaces declare `export const dynamic = "force-dynamic"` in
  their own group layouts, because they are authenticated and per-request.

## Platform UI Contract

Applies to `/workspace/*`, `/ops/*`, `/share`, `/evaluation-entry` and `/auth/*`. The vendor's fix list (`/share/fixes`, launch P-54) is the exception: a public reading page in the Paper language (DESIGN.md §13).

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
- **⌘K** lists evaluations, reports, systems (deep links), test sets and every Settings tab the person can open (`components/evals/settings-tabs.ts`, shared with Settings): AI models for platform admins and, for owners, when `GET /engine/byok` answers (the palette asks on open, as Settings does; editors and viewers never see it or ask), and Data while `DATA_CONTROLS_ENABLED` is on (`ShellFeatures.dataControls`). Both also match what they do ("retention", "export", "provider key"; Spanish too, `palette*Keywords`) (gap G4). An evaluation's breadcrumb is Evaluations › system › evaluation (`usePageCrumb(label, parent)`); an open system is Systems › system.
- **Remembered tabs.** Settings and reports reopen on the tab this device last showed (`caudals.tab.settings`, `caudals.tab.report` in `localStorage`, best effort) unless the link names a tab or a result. Shared and example reports do not remember.
- **Test-set review** (`TestSetReview` in `components/evals/preparation-parts.tsx`): free and pay-as-you-go workspaces open on a spot check of 10 questions (spread across source pages, most severe first; `lib/evals/review/spot-check.ts`), each marked "Looks right", edited in place or removed; "Approve and run" (or "Approve without running") unlocks when all are checked and says the report will be preliminary. "Review all N questions" opens the full review, the only mode for managed workspaces: search, difficulty chips, a source-page filter, select (one or all shown), "Mark as checked", "Remove selected" (one request, confirmed) and inline edit. The approval sends `review` (mode and checked ids) for the audit trail. Spot-check progress survives a reload in the tab (`sessionStorage`).
- **Review keyboard shortcuts** (while no field, dialog or menu has the keyboard; "Keyboard shortcuts" or `?` lists them): `j` next question, `k` previous, `c` mark as right (or undo), `x` select (full review), `e` edit, `r` remove (asks first), `/` search (opens the full review from the spot check), `?` show the list.

### Accessibility and performance budgets (launch L-24)

- **Accessibility gate (P-46).** `e2e/evals/a11y.contract.ts` (in `ui.config.ts`) runs axe (`e2e/evals/axe.ts`: WCAG 2.0–2.2 A/AA plus best practices, serious and critical only, colours checked at rest) on the core screens: landing (EN/ES), demo start, live and report, sign-up from the demo, direct sign-up, sign-in, evaluations list, new evaluation, the evaluation page (running and paused for credits), the report's overview and results, billing, top up and the estimate and top-up dialogs. It also checks that dialogs take, keep and return focus, that progress is announced (`aria-live`, `progressbar` values), that nothing moves under reduced motion, and that the funnel (landing → demo → report → sign-up) can be completed with the keyboard alone, with a visible focus indicator on every stop. `e2e/a11y-public.spec.ts` runs the same axe pass on served pages (a production build in CI, or production with `PLAYWRIGHT_BASE_URL`/`PLAYWRIGHT_APP_URL`). The harness serves the landing at `/en` and `/es` and the demo at `/en/demo` and `/es/demo` with the front door on.
- **App pages carry one language (L-24c).** The evaluation app's catalogues never reach the browser (see the app's i18n contract above): sign-up and sign-in send ~1 KB of messages instead of a 147 KB chunk of both catalogues, and the signed-in app gets its whole catalogue in the reader's language once per page load, in the RSC payload. Images are served unoptimized, so a page uses a copy of a brand asset sized for its display (the auth screens' 7 KB wordmark). `app/global-not-found.tsx` is at the root of every route's tree: a font preload there becomes a `Link` header on every page, so it preloads nothing.
- **Reading Lighthouse's mobile LCP.** Lantern counts every request that finished before the largest paint in the unthrottled run, and on production's fast network the stylesheets, Geist and the framework's ~180 KB of script all finish before it, so a page's simulated LCP is mostly the bytes and requests of that set. Lighthouse 12.6 (pinned by `@lhci/cli`) and 13.5 multiplex only HTTP/2: production is HTTP/3 and localhost/CI HTTP/1.1, both modelled as six connections with a round trip per request. `@paulirish/trace_engine` 0.0.66 (Lighthouse main from 2026-10-09, not yet in a release) treats HTTP/3 as multiplexed; with it production's medians are landing 2.42–2.50 s, demo 1.97–2.28 s, sign-up 1.69–1.99 s (L-24d.md). Compare changes on the same protocol and Lighthouse version, and add `--disable-quic` to the Chrome flags for the HTTP/2 figure.
- **Performance budgets (P-47).** `lighthouserc.js`: the landing (`/en`), the demo (`/en/demo`), the sample report (`/en/sample-report`, L-33) and direct sign-up (`/workspace/start`), mobile (default) and desktop (`LHCI_FORM_FACTOR=desktop`), three runs, lhci's median run asserted. Every page and form factor has a warning at the budget (LCP 2.5 s, TBT 200 ms, CLS 0.1) and an error at a regression ceiling: the worst production median with Lighthouse 12.6.1 + 20 % (LCP) or + 50 % (TBT), never below the budget (gap G4). Mobile ceilings: LCP landing 4.5 s, demo, sample report and sign-up 4.25 s; TBT landing 400 ms, sign-up 250 ms, the others 200 ms; desktop and CLS at the budget. Re-measure and reset them when the Lighthouse version changes (docs/launch/G4.md). Accessibility score ≥ 0.95 is an error everywhere. CI's `budgets` job builds the app and runs both, only when files that reach those pages change.
- **Public pages stay light.** Everything on the public site is paid for on a phone's first visit: no animation or motion library (CSS keyframes, as the cookie notice), and the largest text renders on the server at full opacity (`.lp-lift` for the hero headline and standfirst; the demo's start view is server-rendered, and a run's private link hides it before the first paint). Launch L-24b: a layout loads the script of every client component its server modules import, rendered or not, so the public layout uses `PublicDocument` (no session client, Better Auth or toast host; the contact form mounts its own `Toaster`) and imports `rootMetadata` from `components/document/root-metadata.ts`; the 404 view (`app/[locale]/not-found.tsx`) is part of every public page's script, so it stays small. The landing, sector pages, hub and demo frame render on the server (`LandingShell` is not a client component; `MomentumScroll` is its effect); only the header, footer, cookie notice, hero chat, animated figures and the demo hydrate. The header's mobile sheet (`components/ui/mobile-menu-sheet.tsx`) loads on first use. Only Geist is preloaded (the largest paint). Newsreader and Geist Mono load after the first paint (launch L-24d): `html:not([data-fonts]) .mk-font-gate` in `globals.css` points their variables at the metric-matched fallbacks next/font generates, and `components/document/late-fonts.ts` (an async `data:` script hoisted into the head) sets `data-fonts` once the first contentful paint is presented; they then swap in as before (`font-display: swap`). A new public surface that uses them renders inside `PublicRoot`. No script in front of the largest paint may block the parser: the demo's run-link check is an async `blocking="render"` `data:` script, and `mailto:` addresses go through `EmailLink` (`<!--email_off-->`), because Cloudflare's email obfuscation otherwise injects a parser-blocking decoder into the page. The browser Sentry SDK loads only with a build-time `NEXT_PUBLIC_SENTRY_DSN` (none in production, so it never reached Sentry anyway).
- **The demo's proof of work** runs in a Blob worker built from `powKernel`'s source and read back by property name (`components/demo/pow.ts`), so minification cannot break it; it starts when the visitor engages with the form, and the main-thread fallback works in slices of at most 8 ms. `lib/demo/demo.test.ts` runs the worker source from an esbuild-minified bundle.

### Partner dashboard (launch L-28)

- `/partner` (`app/(evaluation)/(authenticated)/partner/page.tsx`, `components/evals/partner-dashboard.tsx`) inside the shell, while `PARTNERS_ENABLED` opens the person's partner (`?id=` picks one of several; platform admins may open any by id while the ops API is on); otherwise the not-found page. The sidebar shows a **Partner** group when `identity.partners` is not empty.
- One page: heading with the role; stats (client workspaces of the cap, referred accounts, referred revenue and share with its credit equivalent, allowance left this month; a dash until known); **Clients** (access, last activity, evaluations, runs this month, latest score, credits; "Open" switches to the client's workspace; partner admins create clients in a dialog with an Idempotency-Key); **Referral links** (copy buttons for the free test in EN and ES and for sign-up; admins create and revoke with a reason); **Referred accounts** (first payment and first-year revenue left empty until they pay); **Allowance**; **Monthly statement** (month picker, CSV link in the running Stripe mode); **Report branding** (admins upload a PNG/JPEG, checked in the browser and again on the server; preview through the authenticated logo route); **People**. Stripe test mode is stated in a banner.
- Copy lives in `lib/evals/partners/copy.ts` (EN/ES, type-checked parity). Harness contracts: `e2e/evals/partner.contract.ts` (390/768/1440 px, admin and member, Spanish).

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
