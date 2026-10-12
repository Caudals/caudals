# Caudals Architecture

## System Overview

Caudals evaluates companies' AI systems and builds custom datasets with freelance domain experts (`product-specs/overview.md`). Production includes the public marketing funnel and deployed invite-only evaluation product. Customer rollout remains subject to workspace entitlements, target readiness and the remaining release gates; see `product-specs/evals-platform-implementation-spec.md` and `evals/work-packages/WP-08.md`–`WP-15.md`.

Current production scope:

- Public marketing, authority and demand capture: `/`, `/sectors`, `/sectors/*`, `/contact`, `/call`, `/blog`, `/blog/*`, `/newsletter`, `/newsletter/*`, `/legal/*`
- Public APIs for that funnel: `/api/contact`, `/api/newsletter`, `/api/analytics/track`, `/api/demo/*`
- Public demo: `/demo`, the public front door while `DEMO_PUBLIC=true` (launch L-04); self-serve sign-up from it at `/workspace/signup`; direct work-email sign-up at `/workspace/start` (app host, `SELF_SERVE_DIRECT_SIGNUP`)
- Event contact cards: `connect.caudals.com`, a separate static service in `services/connect` on atlantic; permanent `/mario` and `/alonso` links, bilingual pages, vCard/QR sharing and offline cache. No database or evaluation-app dependency. See `services/connect/README.md`.
- Private operator access: `/auth/*`, `/api/auth/*` (retained internal-account auth)
- Evaluation: `/ops`, `/workspace`, `/review`, `/evaluation-entry`, `/share` and scoped `/api/evals/v1` APIs

The pre-pivot marketplace surfaces (`/buyer`, `/supplier`, `/v1/*`, `/security`, `/pricing`, `/docs`, `/about`, `/careers`, `/catalogue`) were deleted; they return `404`. There is no landing-mode flag: the routes above define the public and private product boundaries.

## Application Stack

- Framework: Next.js App Router (`next@16`), React 19, TypeScript
- UI: Tailwind CSS v4, Radix UI, shadcn/ui, custom primitives
- Data/Auth: self-hosted PostgreSQL + Better Auth + Postgres RLS
- Storage: S3-compatible object storage — private MinIO on the VPS, with DigitalOcean Spaces as the external managed target (`DO_SPACES_*` variable names serve both)
- Email: Resend
- Payments: Stripe is available for billing; the marketplace checkout was removed
- Observability: Sentry on the web app and the worker, scheduler and document services, scrubbed of personal data, with the deployed commit as release (launch L-08); platform alerts from the atlantic health timer and one-minute external uptime checks, both emailed with runbook links (`docs/evals/runbooks.md`). The retained Tempo/Loki/Prometheus/Grafana stack is not running. See `VPS_RUNTIME.md`
- CI/CD: GitHub Actions → Docker Hub → repository Swarm deploy scripts over Tailscale/SSH; retained Dokploy Traefik handles ingress
- Legacy dataset-build scope is frozen; runtime differs by stack. Temporal and social Redis are running; see "Legacy Private Stacks" and `VPS_RUNTIME.md`.

## Code Topology

- `app/[locale]/*`: localized marketing/public routes
- `app/(auth)/*`: sign-in/callback/reset flows for existing internal accounts
- `app/(app)/*`: internal APIs and short-link handlers; no legacy dashboard UI
- `app/(app)/api/auth/[...all]`: Better Auth endpoint for operator email/password, reset-password, organization/team, and optional TOTP/passkey hardening
- `components/*`: shared and domain UI modules
- `lib/actions/*`: server action business logic
- `lib/public/*`: public funnel logic: the `/contact` evaluation-request intake (`evaluation-request-intake.ts`) and the published offers (`evaluation-offers.ts`)
- `lib/security/*`: public API abuse controls (rate limiting)
- `lib/operator/*`: Operator Console domain modules. Record CRUD and the console repository are shared infrastructure; the dataset-build modules (dataset operations, active learning, cleanlab, license composition, modality contracts, release documentation, sample-preview gating, subscription delivery, compliance controls) are frozen.
- Pre-pivot buyer/supplier/v1 route groups were removed; retained legacy domain code is not a live self-service surface
- `lib/cli/*`, `scripts/caudals.ts`, `bin/caudals.mjs`: legacy operations CLI (frozen)
- `db/migrations/*` and `db/rollbacks/*`: PostgreSQL schema history; every migration ships a rollback
- `app/(evaluation)/*`, `app/api/evals/v1/*`, `lib/evals/*`: invite-only evaluation, expert-review and improvement-dataset product
- `lib/billing/*`, schema `billing`: the self-serve credit ledger (see Billing: Credit Ledger)

Schema notes: `audit_event`, `signing_key`, operator record notes, escalation runbooks (`runbook`, `escalation_case`) and `security_review_artifact` are platform infrastructure. `/contact` writes `contact`, `buyer_opportunity` and `evaluation_request` rows (migration 030) with `audit_event` transitions for the opportunity and the request; it no longer writes `dataset_brief`; the former `/v1` brief intake is not a live route. `evaluation_request` holds the structured intake while the sales pipeline stays on `buyer_opportunity`; the intake records remain retained after removal of the legacy dashboard. Legacy build tables (`label_batch`, `modality_contract`, `release_documentation_bundle`, `compliance_control_scope`, `cost_entry` and related) are frozen: keep them migrating cleanly, do not build on them.

## Evaluation Product Implementation (feature-gated)

The current evaluation implementation uses `app/(evaluation)` for separate `/ops`, `/workspace` and assignment-scoped `/review` routes, `/api/evals/v1` for scoped APIs, `lib/evals` for typed evidence and execution, the `evals` PostgreSQL schema with additive migrations, and separate general, document, scheduler and browser workers. Workspace membership is verified server-side; tenant queries run under a non-owner, NOBYPASSRLS role. Stage C keeps registration invite-only, except self-serve free-plan sign-up from the public demo and direct work-email sign-up (see Public Demo). Website recipes are declarative and require validation before use; the deployed browser worker has a private egress gateway and DB relay, with synthetic acceptance recorded and customer recipes/authorizations checked per target. Stage D adds a customer-side outbound private runner and a separate gated scheduler service. Stage E adds redacted expert assignments, immutable submissions/reviews and privately delivered signed improvement datasets with family-aware splits and observational follow-up evidence. Stage E is disabled unless `EVALS_EXPERT_WORK_ENABLED=true` and the migration, role, trigger and Ed25519 release checks pass. See `evals/work-packages/WP-09.md`–`WP-15.md` for precise status and remaining release checks.

Engine models and lifecycle (migrations 063–064, 078–079):

- **Website context.** The browser reader follows the submitted page's public HTTPS redirects and uses the first captured page's final origin for its bounded crawl. Excerpts cite the resolved URL, including query parameters supplied by a redirect; linked pages stay on that final origin. The isolated HTTPS egress proxy validates and pins every destination connection, including intermediate redirect hops.
- **Model routes.** Each internal engine role (`context_analyzer`, `generator`, `judge`, `report_writer`) resolves to an evaluation choice (`evals.evaluation_model_route`), then a workspace route (`evals.generation_provider_route`) or the platform default (`evals.platform_model_route`); see `lib/evals/repositories/model-routes.ts`. Platform administrators choose models in Settings → AI models (`/api/evals/v1/engine/*`, `lib/evals/repositories/engine-settings.ts`), from the DGX Spark (Ollama tags) or any OpenAI-compatible API. DGX work stays `local_only`; commercial revisions run through the approved-provider path with the account's key from `evals.provider_connection` (an envelope bound to the nil tenant, readable only by the inference worker). Choosing a model registers an immutable provider revision and price revision, so every call stays budgeted and attributed. Source material is fitted round-robin to the model's context window; the workspace budget is created from the entitlement on first use. Platform administrators can also choose models per evaluation in the evaluation page's **1. Connect → AI models** panel (`/api/evals/v1/evaluations/[id]/models`), with one/all-task resets to defaults. These choices affect Caudals' engine; free workspaces reject external API overrides.
- **Frozen job models.** Before insertion, each new generation job and run freezes all four effective routes in its immutable `model_routes` snapshot. The first generation call, later drafting rounds, grading and report narratives use the snapshot. Explicit retired evaluation models remain pinned so normal provider admission stops unavailable work. Pre-migration jobs have NULL snapshots and retain legacy workspace/platform resolution. Keep the additive schema when rolling back app/worker images; never drop model evidence or edit applied migration checksums.
- **Evaluation controls.** The evaluation's three-dot menu offers available pause, resume, stop and restart actions through `/evaluations/[id]/control`. Preparation persists operator intent separately from worker output (`generation_job.control_state`), so late completions cannot undo a pause or stop. Resume uses the saved job and its frozen models; provider errors with uncertain outcomes offer a fresh restart instead of replaying captured target work. Stop prevents pending calls and retains evidence; captured run answers may still be graded into a partial report. Restart saves one durable `evaluation_restart` request per evaluation, waits for running claims to drain, rechecks the requesting writer's live permission, then atomically creates one new preparation/run with current models and connection. The scheduler continues pending restarts with the page closed. Controls reject stale subject IDs, are idempotent and audited; creation failures retain a visible failed request. Migration 079 and the matching app/scheduler are one release unit. Never clear unknown outcome liabilities or worker fences to force a restart.
- **Evaluation queue.** Valid run requests and resumes enter a durable FIFO per workspace. General and browser workers take the same tenant advisory lock before claiming a run slot, bounded by the immutable `max_active_runs` entitlement. Waiting steps retry through the outbox without attempts or reservations; completion, cancellation or a fully drained pause frees capacity. Private runner polling and signed bundle downloads use the same admission check. Missing/disabled entitlements, exhausted budgets and unready connections remain denied. Migration 073 adds `queued_at` and read-only worker allowance grants; resume joins the end of the queue.
- **Worker scope.** The general, document, scheduler and browser workers serve their deploy-time `EVALS_*_ORG_IDS` plus every live workspace from `evals.worker_workspace_ids()`, refreshed every 30 s, so new clients need no redeploy. Every job still runs inside its own tenant scope under RLS.
- **Lifecycle.** Evaluations, systems, test sets, reports and reference material can be renamed and deleted (`/api/evals/v1/items/:kind/:id`). Delete archives (`archived_at`): the item leaves every list, share links of deleted reports are revoked, schedules pause, and immutable evidence follows the retention policy. Workspaces are renamed through `evals.rename_workspace()`; deleting a workspace remains the audited deletion workflow.
- **Notification centre.** Workspace-scoped notices show the latest event first, with per-person unread filtering and stable cursor pagination over 30 days. Started events appear only in Activity. The badge counts all visible unread notices, including older pages, and respects category preferences. Activity orders every job by its last durable update, with filters for work in progress, attention and completed work. Refresh failures remain visible; read state changes only after the server accepts the write. Workspace changes discard old requests and polling state.
- **Report exports.** PDF (document worker), editable Word (`lib/evals/reports/docx.ts`), CSV results and the CEF evidence bundle.

## Public Demo

A no-signup, eight-question test of a visitor's AI system (founder decision 2026-10-05). It is deliberately separate from the tenant engine: no workspace, RLS, budget ledger or queue, so it stays fast and its abuse surface stays small.

- **Code:** `lib/demo/*` (engine), `app/(app)/api/demo/*` (API), `components/demo/*` and `app/[locale]/demo` (page), `services/evals-browser/demo-worker.ts` (website work), `app/api/evals/v1/signup` + `components/evals/self-serve-signup.tsx` (account).
- **Data:** schema `demo` (migration 075): `demo.run` (one row per test: pages read, questions, answers, verdicts, summary; deleted seven days after creation), `demo.llm_usage` (primary-model calls per UTC day), `demo.challenge_use` (spent proof-of-work challenges). Migration 083 adds the queue (`queued_at`, `started_at`), the report-by-email request (`notify_email_ciphertext`, `notify_requested_at`, `notified_at`), `model_used`, `fallback_cost_eur`, and `demo.fallback_usage(day, eur, reserved_eur, calls)`. Never a credential: API keys and curl headers live only in the web process's memory and are dropped when the run ends.
- **Flow:** with the queue on, a new run waits (`queued_at` set, `started_at` NULL) until it is admitted; the web process then runs it through `reading` (pinned HTTPS fetch of up to six same-site pages, robots.txt honoured, ranked toward help/pricing/conditions) → `writing` (one streamed call writes eight questions with answer, key facts and a verbatim quote; each is accepted only when the quote is found in the cited excerpt) → `asking` (APIs called from the web process, one per second; website chats asked by the browser worker in fresh contexts) → `grading` (one batch judge call, grading engine v2 semantics, deterministic pre-checks and a lexical fallback) → `done`. A 45-second lease lets a restarted process resume unfinished runs; the client polls `GET /api/demo/runs/:id` with an ETag. Each phase has a time limit (reading 5 min, writing 10, asking 12, grading 5; `lib/demo/config.ts`); a phase that runs over fails the run as `timeout_<phase>`, and a finished run is never written again.
- **Website chats:** the browser worker (`EVALS_BROWSER_DEMO_ENABLED=true`) finds the chat as soon as the run exists, using the connector's auto-detection, and the engine writes questions only after the chat is found, so a missing chat costs no model quota. The demo loop runs beside the platform's browser slot (one demo at a time, `EVALS_BROWSER_DEMO_PARALLEL` questions at once) and never blocks customer jobs. Pages that need a browser to render are read there too. The worker's role has column-level grants on `demo.run`.
- **Models:** DeepSeek V4 Flash on the DGX Spark (`DEMO_MODELS`, default `bluehawana/deepseek-v4-flash:iq2_m` via Ollama on the private network endpoint `http://192.168.70.19:11434/v1`), about two calls per demo. Local private inference runs with zero external cost or provider rate limits; `DEMO_DAILY_MODEL_CALLS` (default 200) bounds daily execution. OpenRouter free models (`DEMO_OPENROUTER_API_KEY`) remain supported as an optional external fallback or override. Platform administrators choose the preferred model in Settings → AI models → Public demo (`/api/evals/v1/engine/demo`), from the configured demo provider's live model catalog (free models only on OpenRouter). The audited choice is saved in `demo.model_setting` (migration 076), bound to the provider endpoint's hash. The web runtime can read it; only the configuration-admin role can write it. Each completion resolves the preference without a restart, then retains the `DEMO_MODELS` fallback chain. With no saved preference, the environment/default model order applies.
- **Queue (`DEMO_QUEUE_ENABLED`, L-03):** a FIFO queue replaces the `busy` and `capacity` refusals. The web process admits the oldest waiting run (`lib/demo/queue.ts`, under a transaction advisory lock, so a rolling deploy cannot over-admit) while fewer than `DEMO_MAX_ACTIVE` (3) runs are in progress, fewer than `DEMO_MAX_ACTIVE_WEBSITE` (2, the browser worker's `EVALS_BROWSER_DEMO_CONCURRENCY`) website runs are, and a model can serve it. An API run may pass a website run that waits for the browser. Visitor and site limits are unchanged; `DEMO_QUEUE_MAX` (50) waiting runs is a safety valve (`queue_full`). The page shows the place in line and an ETA range from the median and 90th percentile of the last 50 finished runs (defaults 4 and 8 minutes). A run that loses model capacity mid-way goes back to the head of the queue with its work kept, rather than failing; one that waits longer than `DEMO_QUEUE_MAX_WAIT_MINUTES` (360) fails as `queue_timeout`. The browser worker serves admitted runs only and hands a re-queued run back.
- **Fallback model (`DEMO_FALLBACK_ENABLED`, L-03):** the primary is tried first; a rate limit, timeout, 5xx or spent daily call quota opens an in-process circuit (`lib/demo/health.ts`, two minutes) and the call goes to one commercial model, `DEMO_FALLBACK_MODEL` (default `google/gemini-3.1-flash-lite`) at `DEMO_FALLBACK_ENDPOINT` (default OpenRouter) with `DEMO_FALLBACK_API_KEY` or `DEMO_OPENROUTER_API_KEY`. Every fallback call first reserves its worst-case cost (input at one token per three characters, all output tokens, +25 %, at `DEMO_FALLBACK_INPUT_EUR_PER_MTOK` 0.25 / `DEMO_FALLBACK_OUTPUT_EUR_PER_MTOK` 1.5) in `demo.fallback_usage` with one conditional upsert against `DEMO_FALLBACK_DAILY_EUR` (default 5), then settles the provider-reported cost (USD counted 1:1 as euros, `DEMO_FALLBACK_USD_EUR`); an interrupted call keeps its hold, so concurrent calls never exceed the cap. The run records `model_used` and `fallback_cost_eur`. When neither model can serve (DGX down and the cap reached, or the key refuses to spend), the run waits in the queue and the page says so. `DEMO_FALLBACK_FORCE=true` skips the primary (DGX maintenance, verification). The demo footnote discloses that a backup model from Google, through OpenRouter, may read the public pages.
- **Report by email (with the queue):** a waiting or running test offers "Email me the report when it's ready" with a consent checkbox. The address and the run's private token are stored only as an AES-256-GCM envelope under the master keyring (`EVALS_MASTER_KEYRING_FILE`, purpose `demo_notify`, `lib/demo/notify.ts`). When the run ends the web process emails that address alone (Resend, idempotency key per run): the private report link, then deletes the envelope and sets `notified_at`; the sweeper retries for an hour, then drops the request. Startup instrumentation resumes the loop without requiring another visitor. Request bodies stay identical across email retries; signup remains an explicit action from the report. Three requests per visitor a day.
- **Events and status:** `demo_started` (target kind, docs given, locale, queue wait) when a run first leaves the queue and `demo_finished` (outcome, error code, duration, scored, correct, model used) when it ends, both server-side from `lib/demo/events.ts` into `product_analytics_event` (taxonomy owned by L-02). `GET /api/demo/challenge` and each run's view carry a service level (`ok`, `degraded` when the primary is down and the fallback answers, `capacity` when nothing can) for the page's notice.
- **Abuse controls:** a self-hosted proof of work (18 bits, signed, bound to the visitor, single use) instead of a CAPTCHA; the visitor key is an HMAC of their IP (`cf-connecting-ip` only when the peer is a Cloudflare edge, IPv6 per /64), never the raw address; one successful test per visitor a day and six attempts; three a day per tested site and per documentation site; three at a time overall; public HTTPS destinations only, DNS pinned and every redirect re-checked; byte and time limits everywhere; same-origin checks on writes; private capability links (the token stays in the URL fragment; the API answers `noindex`). Questions are ordinary customer questions, never adversarial.
- **Sign-up:** the report's account card emails a one-time link (`evals.request_self_serve_signup`; only its sha256 is stored, two days). `/workspace/signup` lets the person set a name and password; `evals.enroll_self_serve` creates the verified account, a workspace with the person as owner and a free-plan entitlement (`plan = free`: one system, 50 tests per set, three runs a month, one active run, no schedules, local DGX models only), and the demo is imported as a project, evaluation, system (without its key) and website source. The limits are database triggers on `evals.target`, `evals.run` and `evals.generation_job`, so no code path can skip them. With `SIGNUP_TERMS_REQUIRED=true`, enrollment also requires Terms and Privacy acceptance and records it in the same transaction (below).
- **Direct sign-up (launch L-05, migration 085, `SELF_SERVE_DIRECT_SIGNUP`):** `/workspace/start` (EN/ES, platform kit) asks for a work email and the company name and calls `POST /api/evals/v1/signup/request`, which stores the same kind of link through `evals.request_self_serve_signup` with source `direct` and no demo run, and finishes on `/workspace/signup` with the same enrollment, terms acceptance and free plan. `lib/evals/signup.ts` holds both paths (the demo's is unchanged). `lib/evals/signup-domains.ts` refuses personal free-mail (`WORK_EMAIL_REQUIRED`, the page points to the demo), disposable and reserved domains; ops add blocked domains in `SELF_SERVE_SIGNUP_BLOCKED_DOMAINS` and exceptions (addresses or domains) in `SELF_SERVE_SIGNUP_EXCEPTIONS`. One self-serve workspace per registrable email domain: `evals.self_serve_signup` records `signup_source`, `email_domain` (indexed), `domain_rule` and the request's sanitized first touch; the request function returns `domain_taken` while a live self-serve workspace (demo or direct, any plan) exists for the domain, and enrollment re-checks under a per-domain advisory lock (`SIGNUP_DOMAIN_TAKEN`), so two links for one company cannot both create one. Exceptions and demo links skip the rule; a deleted workspace frees the domain. Enumeration safety: every accepted request answers `{sent: true}` and emails the address exactly once (link, "you already have an account", or "your company already has a workspace, ask its owner to invite you"); the per-address limit counts every request, and a database link limit answers the same. Limits (`consumeRateLimit`): 5 an hour per hashed visitor, 5 a day per domain, 3 a day per address (HMAC). `account_created` carries acquisition `direct` and the stored first touch; refusals record `limit_hit` (`signup_free_mail`, `signup_disposable`, `signup_rate`, `signup_domain_taken`). The sign-in page shows "New here? Create a free account" while the flag is on. The rollback refuses while direct sign-ups exist.
- **Terms acceptance (launch L-01, migration 081):** `evals.terms_acceptance` is an append-only record (user, workspace, document, version, context, locale, request id, time; a trigger refuses UPDATE, DELETE and TRUNCATE). Rows are written only by `evals.record_terms_acceptance()`, which records for the transaction's actor, checks workspace membership and is idempotent per request id. Members read their workspace's rows under RLS. Sign-up uses context `signup`; checkout (L-12) and the DPA click-through (L-30) reuse it with `checkout` and `dpa`. Document versions are in `lib/legal/versions.ts`.
- **Front door (launch L-04, `DEMO_PUBLIC`):** one runtime flag, read on the server (`lib/public/front-door.ts`; the spec's `NEXT_PUBLIC_DEMO_PUBLIC` could not change at runtime), switches together: the header pill ("Try it free") and a "Sign in" link to the app in the header and footer; the hero, sector, hub and closing CTAs to `/{locale}/demo` (the manual diagnostic stays at `/contact?offer=reality-check`); indexing of the demo page (canonical, hreflang, its own share image), its sitemap, `llms.txt` and agent-markdown entries; and the report's account card (optional company, then Book a readout to `/call`, then Send to a colleague). The `[locale]` layout passes it to client components through `FrontDoorProvider` and revalidates every 300 s, so prerendered pages follow a change a few minutes after the app restarts; `/demo` renders per request so its robots tag never lags the flag. Off, the demo is reachable by direct link and `noindex`.
- **Send to a colleague (L-04):** `POST /api/demo/runs/:id/share` with a JSON body `{email, consent: true, key}` (same origin, the run's token, a finished run, the flag on). One email per accepted request to one deliverable address (reserved and disposable domains refused), at most 5 a day per hashed visitor and 3 per run; the sender's consent is recorded first as `demo_report_shared {channel: email, consent: true}` (hashed run, never the address; written even with `ANALYTICS_EVENTS_V2` off), and nothing is sent without that record. The email (Resend, idempotency key per send, the run's language) carries the private link and the deletion date; the address is never stored or logged. Without a body the route keeps acknowledging "Copy private link" (L-02).
- **Flags:** `DEMO_PUBLIC` (web, default off; L-04), `DEMO_ENABLED`, `DEMO_BROWSER_ENABLED` (web) and `EVALS_BROWSER_DEMO_ENABLED` (browser worker); `DEMO_QUEUE_ENABLED`, `DEMO_FALLBACK_ENABLED` and `DEMO_FALLBACK_FORCE` (web, default off); optional `DEMO_SECRET` (otherwise derived from `BETTER_AUTH_SECRET`), `DEMO_RUNS_PER_VISITOR`, `DEMO_RUNS_PER_SITE`, `DEMO_MAX_ACTIVE`, `DEMO_MAX_ACTIVE_WEBSITE`, `DEMO_QUEUE_MAX`, `DEMO_QUEUE_MAX_WAIT_MINUTES`, `DEMO_FALLBACK_*`, `DEMO_APP_ORIGIN`; `SELF_SERVE_DIRECT_SIGNUP` (web, default off) with `SELF_SERVE_SIGNUP_EXCEPTIONS` and `SELF_SERVE_SIGNUP_BLOCKED_DOMAINS`. With the queue and the fallback off the demo behaves as before L-03.


## Product analytics and growth (launch L-02)

`ANALYTICS_EVENTS_V2` is a runtime app/worker flag. `/api/analytics/config` exposes only its boolean. `/api/analytics/track` accepts the client catalogue only, after explicit consent, with same-origin and bounded-payload checks. The client waits for consent before accessing optional storage or sending/mirroring events. Withdrawal clears that storage. Umami receives sanitized custom events; its automatic page tracking is disabled.

`lib/analytics/events.ts` owns names, sources and scalar property allowlists. `public.product_analytics_event` stores route templates, workspace UUIDs, hashed run/revision/retry keys, scalar metadata and sanitized attribution. It does not store email, raw IP, customer URLs, question/answer text or user identity. Migration 082 enforces operator-only reads; server roles use a bounded append-only function for retry-safe writes without granting row visibility. Transactional emitters preserve domain rollback, using savepoints so analytics failures cannot break product actions. Existing L-03 demo lifecycle collection remains available with the v2 flag off.

| Events | Sole source / current owner |
| --- | --- |
| `page_view`, `demo_viewed` | Client root tracker after consent; route templates, locale, hostname-only referrer |
| `pilot_requested`, `readout_link_clicked` | Client navigation to contact/call, with source surface |
| `demo_started`, `demo_finished` | Server demo lifecycle; queue wait, target kind, model, score, duration/outcome |
| `demo_signup_requested`, `demo_report_shared` | Server signup-link creation and authorized report-copy acknowledgement; hashed run |
| `account_created` | Server enrollment; acquisition (`demo`, `direct`, `invite`, later `partner`) and known plan |
| `evaluation_created`, `test_set_ready`, `run_started`, `sources_added`, `schedule_created` | Server idempotent domain creation; known connection/count/duration/type properties |
| `run_finished` | Server terminal finalization; questions, frozen model count, duration/outcome; unknown estimates/credits remain null until L-10/L-11 |
| `report_viewed`, `report_shared`, `export_downloaded` | Server authorized report/share/download operations. First view once per revision; downloads once per artifact/revision/format; polling is not counted as repeated activation |
| `api_token_created`, `webhook_created` | Server creation transactions; destination type only |
| `scan_detected`, `context_confirmed` | Server discovery completion/context answers; count and field names, never content |
| `limit_hit` | Server demo limits and known product limit errors |
| `example_viewed` | Client root tracker after consent: `surface` `workspace` (`/workspace/example`), `public` (the sample report page) or `pdf` (a sample-report PDF link) (L-33) |
| `expert_review_requested` | Client catalogue reserved for L-26; its real emitter lands with that feature |
| `readout_presented`, `readout_exported`, `report_question_asked` | Server catalogue reserved for L-35/L-36; their real emitters land with those features |

The first consented touch saves UTM/ref/partner labels and the existing opaque Leads journey identifiers in `caudals_attribution_v2`, a 90-day optional first-party cookie shared by `caudals.com` and `app.caudals.com`. The snapshot travels to `demo.run.attribution`, then `evals.workspace.acquisition_attribution`; L-12 will copy it to the first payment. Cookie Policy version 2026-10-12 documents storage and withdrawal. Attribution never enrolls contacts or bypasses Leads' identity/revenue rules.

`/ops/growth` requires platform operator/admin identity, repeats the role check in SQL, and relies on SELECT RLS. Its indexed eight-week query has a 1.5-second statement timeout. Weekly funnel counts are event counts (views are consented only), source breakdowns count acquisitions/activation, and cohorts count workspaces that start runs or first view reports. Future cohort weeks display a dash. Data begins when enabled; no historical events are synthesized. The full non-billing event acceptance remains a cross-package check as L-26/L-33/L-35/L-36 ship.

## Example evaluation and sample report (launch L-33)

One synthetic evaluation of a fictitious insurer's home-policy assistant ("Hogarel", product "Hogar Completo") shows what a finished evaluation looks like (spec P-55). It exists only as versioned fixtures, never as database rows:

- **Source and fixtures.** `lib/evals/example/source/*` holds the bilingual source (five synthetic documents, 48 questions with one recorded answer per run, reviewed findings, improvements, takeaways). `scripts/evals/build-example-fixtures.ts` builds `lib/evals/example/fixtures/{en,es}.json` with the product's own scoring (`aggregateRun`, `groupFindings`, `pairedComparison`): three monthly runs (August–October 2026) as full `reportSnapshotSchema` snapshots, the October one reviewed-style, plus the trend and the September → October comparison. `lib/evals/example/index.ts` is the browser-safe loader.
- **Release gate.** `lib/evals/example/example.test.ts` (also run in the image build, `Dockerfile`) checks that the fixtures are the builder's output, parse and keep their content hashes, have 40–60 results with transcripts and excerpts, cite only existing results from every takeaway and finding, name no real company and make no certification claim, and that the committed PDFs match the fixtures.
- **In the app.** `/workspace/example` renders the reviewed snapshot with `ReportView` (trend and comparison at the top of Overview) in the person's interface language. Entry points (`components/evals/example-evaluation-links.tsx`): a card below the evaluations list, a link in the empty states, a Settings → General row; `ExampleEvaluationLink`/`useExampleEvaluation` are for Home (L-22) and the onboarding checklist (L-06). Owners hide it per workspace on their device (localStorage `caudals.example-hidden`); a per-workspace server setting belongs in L-06's onboarding state.
- **Public.** `/{locale}/sample-report` (`/es/informe-de-ejemplo`) is a server-rendered Paper page of the same snapshot. The PDFs are rendered by the document worker's renderer (`renderReportPdf` with `{ sample: true }`: an "Example" banner on the cover and a header line on every page) through `scripts/evals/render-example-pdfs.ts`, committed in `content/sample-report` with a manifest, and served by `app/sample-report/[file]/route.ts`.
- **Read-only by construction.** Every identifier starts with `example-` and is not a UUID, so no API route accepts it and no `uuid` column can store it; no API route, repository, worker, billing or analytics query imports the fixtures (`tests/evals/example-evaluation-guard.test.ts`, `tests/evals/example-evaluation-db.test.ts`). It never counts towards plan limits, credits, product metrics or activation.
- **Flags.** `EXAMPLE_EVALUATION_ENABLED` (app runtime, default off) gates the in-app example, its entry points, the public page and the PDFs (404 when off). `SAMPLE_REPORT_INDEXED` (default off) is the founder's go-ahead: until then the public page is `noindex` and stays out of `/page-sitemap.xml` and `/llms.txt` (which revalidates hourly).

## Email: branded templates and lifecycle sequence (launch L-07)

Every Caudals email is one typed template in `lib/email/templates.tsx` (EN and ES copy in `lib/email/copy.ts`, typed so the two catalogues cannot drift). Templates are data laid out by one React frame (`lib/email/layout.tsx`: the Paper language, table markup, one ink pill, no images) and rendered to HTML plus a plain-text alternative by `lib/email/render.ts`. The renderer is a small static serialiser, not `@react-email/render`: the evals workers and scheduler run under Node's `react-server` condition (needed by `server-only`), where `react-dom/server` throws. Tests check its output against `react-dom/server` for every template. Templates live under `lib/` because the worker images ship only `lib/` and `services/`.

| Category | Templates | Footer |
| --- | --- | --- |
| Essential | sign-up link (demo path with a one-line score summary), account exists, domain taken, password reset, invitation, payment receipt, demo report and "send to a colleague" | Why it was sent; nothing to switch off |
| Notification (opt-in per category) | test set ready, results ready or updated, run failed, input required, export failed, generation, website and document failures | Link to Settings → Notifications |
| Billing (owners, default on) | low balance, auto-recharge done/failed, credits expiring, cap reached (prepared here; L-12, L-15 and L-18 trigger them) | Link to Settings → Notifications |
| Lifecycle (non-essential) | welcome (D0), D1 test set, D3 run, D7 setup call, first report, D21 re-run, D30 win-back | Unsubscribe link plus RFC 8058 `List-Unsubscribe` / `List-Unsubscribe-Post` headers |

- **Switches (server-read, app credentials; the evals deploy copies them to the scheduler):** `BRANDED_EMAILS_ENABLED` swaps the plain-text emails users already received for the branded templates (sign-up, password reset in the requesting page's language, workspace notifications in each recipient's email language, demo report and share emails) and starts emailing new workspace invitations to the invitee (the private link still shows in the dialog). With the switch on, a bare `RESEND_FROM_EMAIL` gets the display name "Caudals". `LIFECYCLE_EMAILS_ENABLED` (default `false`) runs the sequence; `LIFECYCLE_EMAIL_STEPS` picks steps (default D0–D7: `d0_welcome,d1_test_set,d3_run,d7_report`; `all` for every step). `CALCOM_LINK` (slug or https URL) is the setup-call and readout link.
- **Email categories (migration 087):** `evals.notification_preference` gains one email column per category for each person and workspace (`email_completion`, `email_required_input`, `email_failure`, `email_billing`, `email_regressions`); existing choices carried over as old switch AND category, and the old `email` column stays in step. `evals.email_preference` (one row per person, RLS to the person) holds the email language, the lifecycle category and an unsubscribe token that the runtime role cannot read. `evals.notification_email_recipients` returns each recipient's language (the person's choice, else their sign-up language, else English); billing kinds go to owners unless they switched billing email off.
- **Lifecycle job (`lib/evals/operations/lifecycle-email.ts`, every five minutes in the evals scheduler):** the cohort is owners of live free self-serve workspaces who signed up in the last 45 days, are not platform staff and did not unsubscribe (`evals.lifecycle_email_candidates`, executable only by `evals_scheduler`). Facts come from real state: a test set (generation job ready for review or a frozen suite, or any run), a run, a published report, a share or invitation, runs after the first report, and the latest activity (runs, evaluations, generation jobs, sign-ins). Days are calendar days in Europe/Madrid; every step after D0 goes out in Madrid working hours (Mon–Fri 09:00–18:00), each has a sending window after which it is skipped, a step whose goal is met is skipped as converted, and a person gets at most one lifecycle email per 20 hours. `evals.lifecycle_email` holds one row per (person, step): a step is claimed before the provider call, sent with the idempotency key `lifecycle-<user>-<step>`, retried at most three times, and never sent twice. Lifecycle mail never touches the newsletter (Caudals Ops) or outreach (Warmbly) lists.
- **Unsubscribe:** emails link `/workspace/unsubscribe#<token>` (public page, token kept in the fragment and removed from the address bar, confirm button) and carry the one-click URL `POST /api/evals/v1/email/unsubscribe?token=…`. A `GET` there only redirects to the page, so link scanners change nothing. `evals.email_unsubscribe` is idempotent and switches only lifecycle email off; the person can switch it back on in Settings → Notifications.
- **Rollback:** `db/rollbacks/087_evals_lifecycle_email_down.sql` refuses once a lifecycle email is recorded or anyone has unsubscribed; repair forward.

## Billing: Credit Ledger

Self-serve usage is paid in credits (launch spec v2 §6). **1 credit = €0.01 excl. VAT**; the ledger stores micro-credits (1 credit = 1,000,000 µcr) as `bigint` (`*_ucr` columns, `lib/billing/units.ts` for exact maths). Credits sit on top of the euro budgets in `lib/evals/budget/ledger.ts`, which remain Caudals' own cost guardrails. Package status: the ledger core (L-09, migration 084) is deployed dark; the price book, €0 model guard and run estimator (L-10, migration 088) are live (estimates behind a flag); engine holds and captures (L-11), Stripe (L-12) and the billing screens (L-15, L-16) build on them.

- **Data (schema `billing`, migration 084):** `credit_account` (one per workspace: `billing_mode` free/credits/contract, `available_ucr`, `held_ucr`, `frozen_reason`, `version`), `credit_lot` (one per purchase, grant, allowance or bonus: source, granted/remaining/held/expired µcr, euro unit price paid, expiry, order), `credit_hold` (one per key: held → captured, released or expired) and `ledger_entry` (append-only: a trigger rejects UPDATE, DELETE and TRUNCATE). Each entry records the signed change of available + held (`amount_ucr`), both bucket deltas, the balances after it, the lots it touched, a per-workspace idempotency key and request fingerprint, references (run, attempt, case unit, price-book revision, Stripe/ref ids), the actor and its kind, reason and request id. `verification_run` keeps the nightly verifier's results.
- **Writes** go only through `SECURITY DEFINER` functions, each idempotent by key and writing the entries and balances in the caller's transaction: `billing.grant`, `hold`, `capture` (capped at the hold, rest released), `release`, `charge_action`, `adjust`, `reverse`, `refund_run`, `expire_due`, `verify_account`, `record_verification`. A replay returns the original entry; a replay with different values raises `IDEMPOTENCY_CONFLICT`. Corrections are reversal entries. Typed wrappers and error classes (`BillingError`, `CreditsExhausted`) are in `lib/billing/ledger.ts`.
- **Access:** RLS by `org_id`; `evals_runtime` (web and scheduler) and the worker roles (`evals_worker`, `evals_browser`, `evals_document`) can only read their scoped workspace's rows. Tenant functions act only on the transaction's `evals.org_id`. Holds, captures, releases, platform charges and per-account verification are granted to the runtime and every worker role; credit creation, corrections, run refunds, expiry and the platform-wide verifier are granted only to `evals_runtime` and, inside it, accepted only from platform admins (with a required, audited reason) or `service:`/`system:` identities. Workers never create credits.
- **Lots:** holds and spends take the unheld part of unexpired lots oldest-expiring first (never-expiring last); a capture consumes the hold's own lots in that order. Expiry removes only the unheld part of a lot; any spend expires due lots of its account first, so expired credit is never spent. Defaults (D-10, `lib/billing/config.ts`, configurable): purchases and their bonus 24 months, promos and ops grants 30 days, the monthly allowance at UTC month end, contract allowances at the contract end supplied by the caller. Default periods end at the end of their last UTC day so a retried request replays.
- **Lock order:** provider account → workspace and run budgets → `billing.credit_account` → lots and holds. Every billing function locks the workspace's account row first and never touches the evals budget rows, so per-workspace billing writes serialise on that row and cannot form a cycle with `reserve()`/`settle()`. Call billing functions after the budget locks in the same transaction.
- **Accounts:** the migration backfilled one zero-balance account per workspace (plan `managed` → `contract`, `free` → `free`); a trigger on `evals.workspace_entitlement` creates the account for new workspaces and keeps `billing_mode` in step with the plan (other plans → `credits`).
- **Invariants (§6.9), checked by `billing.verify_account`:** available ≥ 0 and held ≥ 0; Σ entry deltas = balances; the last entry's running balance = the account; Σ lot remaining = available + held; Σ lot held = held = Σ open holds; every lot's remaining and held part equals the sum of the entries' allocations on it; captures never exceed holds; no lot goes negative or beyond its grant; a replay never creates a second entry (unique key per workspace).
- **Jobs (evals scheduler, `lib/billing/jobs.ts`):** the verifier runs at scheduler start and in the 03:00 UTC hour, records a `billing.verification_run`, and logs `billing_verified` or `billing_drift` (workspace ids and issue codes only). Expiry (`expire_due`, hold expiry after 24 h by default and lot expiry) runs hourly when `BILLING_CREDITS_ENABLED=true`.
- **Flags (server-side, app credentials; the evals deploy copies them to the worker, scheduler, browser and document services):** `BILLING_CREDITS_ENABLED` (default `false`) and `BILLING_ENFORCE` (`shadow` default, or `enforce`; turning enforcement off returns runs to the entitlement and euro-budget checks). `BILLING_STRIPE_MODE` arrives with L-12.
- **Rollback:** `db/rollbacks/084_billing_core_down.sql` refuses once any entry, lot or hold exists or an account has a balance or freeze; repair forward.

### Price book, €0 guard and run estimates (L-10, migration 088)

- **Price book:** `billing.price_book_revision` moves draft → scheduled → active → retired. Each revision carries `model_rate` rows (µcr per 1M input, output and optional cached tokens, keyed by provider, model id and a prompt-size tier, with a cost snapshot: USD list price, FX, routing fee, the EUR cost and its source) and `action_rate` rows (the six §6.3 meters). Rates are editable only on drafts; triggers reject changes to scheduled, active and retired revisions (only lifecycle columns move) and any TRUNCATE. The database enforces the §6.4 grid: every rate is a multiple of 5 credits per 1M with a 10-credit floor. The arithmetic (cost × FX × fee × multiplier 1.5 × 100, rounded up) is in `lib/billing/price-book.ts` and reproduces the §6.4 table exactly.
- **Which revision applies:** `billing.price_book_at(t)` is the non-draft revision with the latest `effective_at` at or before `t`, so a scheduled revision applies exactly on its date; the scheduler's hourly `activate_due_price_books()` only relabels statuses and audits. Seed: revision 1 (in effect from 2026-10-11, the §6.4 table and meters, ECB 1.1605 USD/EUR) and revision 2 (scheduled 2027-01-01: Google's announced Gemini 3.8 Flash increase). L-11 freezes the revision id into runs; `ledger_entry` and `credit_hold` now reference it.
- **Changes:** `billing.create_price_book_draft` (from the revision in effect, recomputing list prices at the latest recorded FX, then applying per-model changes), `schedule_price_book` (needs every meter and the local rate, must follow every other scheduled revision, keeps every current customer route priced, and refuses an increase with less than 30 days' notice), `cancel_price_book` (before it takes effect) and `activate_price_book` (brings a non-increase forward to now). Platform admins (recent sign-in, `Idempotency-Key`) through `/api/evals/v1/billing/admin/price-book/revisions[/:id[/schedule|/activate|/cancel]]`; every step writes `evals.audit_event`. Notices for increases are sent by L-16.
- **€0 guard (G9):** a trigger on `platform_model_route`, `generation_provider_route` and `evaluation_model_route` refuses a model whose cost price is €0 (`MODEL_PRICE_ZERO`; the DGX is capacity-priced and exempt) or that has no credit rate in the revision in effect or any scheduled one (`MODEL_RATE_MISSING`), unless its provider revision is an explicit `free_model` (fixed at registration; registered OpenRouter `:free` models were flagged by the migration). `billing.route_price_issues()` lists every route's status. Settings → AI models and Providers & models show each model's credit rate, a "€0 price · not for customers" warning and the free-model choice. Local stays the default route (D-09).
- **Estimates (§6.7):** `lib/billing/estimate.ts`. Questions × repetitions by connection kind are metered exactly (website 5, API 2, imported answer 1 credit; pages 1 and 0.5; web searches 2). Engine tokens per role use platform-wide aggregates from `billing.estimate_stats` (SECURITY DEFINER, aggregates only) over 60 days: per role and model from 20 samples, else per role, else the §6.7 seeds. The median of a run is n × mean per call and its p90 adds 1.2816 × sd × √n. Output: p50/p90 credits and euros, the largest single hold (rate × the p90 token bound), an ETA from seconds per question of completed runs (below 20 measured runs the tail is capped at twice the median), and the credits to add (none for `contract` workspaces, which run without holds). `POST /api/evals/v1/billing/estimates` serves editors (owner, editor, operator) and CI tokens (`runs:read`), with an `Idempotency-Key`; `BILLING_ESTIMATES_ENABLED` = `operators` (platform staff and workspace operators only) or `true` (everyone), anything else 404. Enforcement is L-11.
- **Prices over time:** the scheduler runs a weekly provider-price check (OpenRouter's public models API; Google-direct rows compared with OpenRouter's listing of the same model) into `billing.price_check` and logs `billing_price_check_changes` when a listing moved; it records the ECB USD rate monthly (`billing.fx_rate`). Rates whose cost moved more than 3 % (price or FX) are flagged for a new revision. `scripts/billing/check-provider-prices.ts` prints the same diff; `scripts/billing/backtest-estimates.ts` measures estimate accuracy on read-only production aggregates.
- **Rollback:** `db/rollbacks/088_billing_price_book_down.sql` refuses once a ledger entry or hold references a revision, an operator revision, FX rate or price check exists; repair forward.

## Earlier Evaluation Architecture Sketch (superseded)

This sketch predates the staged implementation above. Its `/proof`, `/e/[projectId]`, and `lib/eval` paths are not the current evaluation-product contract. The product specification and `docs/evals/AGENTS.md` take precedence.

### Phase 0 — manual delivery

- Suite in a spreadsheet, exported as CSV.
- A runner script of roughly 150 lines calls the target and writes results JSONL.
- Grading: deterministic checks, an LLM judge and two human reviewers.
- Analysis in spreadsheet pivots (cause × topic × tier); the report is written as HTML and rendered to PDF with brand tokens.
- Expert work runs in shared spreadsheets under documented provenance and access rules.

### Phase 1 — in-app product

```
app/(eval)/proof/              public self-serve demo, no signup
app/(eval)/e/[projectId]/      customer dashboard (magic link): runs, cases, report
app/(evaluation)/(authenticated)/  workspace, operations and expert pages in a persistent shell
lib/eval/targets/              adapters: http, openai-compatible, widget, manual, self-run import
lib/eval/graders/              deterministic checks, LLM judge, human queue
lib/eval/runner.ts             queue consumer
lib/eval/report.ts             report data assembly
```

Eight domain tables in the existing PostgreSQL, with RLS by `org_id`, plus an `eval_job` queue table:

| Table | Purpose |
| --- | --- |
| `eval_project` | Customer engagement: org, sector, locale, status |
| `eval_target` | System under test: kind (`http`, `openai`, `widget`, `manual`, `self_run`), config, auth reference, rate limit, label |
| `eval_case` | Versioned case: source, tier, scope, author, reviewer, sign-off |
| `eval_run` | One execution: target, suite version, timings, model fingerprint, summary |
| `eval_result` | One row per case per run: response, retrieved context, latency, tokens, cost, score, grounded/confident/refused, grader, rationale, cause |
| `eval_review` | Human override of a result; always wins |
| `eval_finding` | Report finding: severity, category, body, linked cases |
| `eval_report` | Report version, PDF object key, publish time, share token |

Invariants:

- `eval_result` rows are immutable once a run completes; corrections go to `eval_review`.
- Suite versions are frozen per run; judge model versions are pinned per suite version.
- Every run stores a `model_fingerprint`.
- Customer content is redacted at ingest and processed on EU infrastructure.

Runner and integrations:

- One Node worker on the VPS consumes `eval_job` with `FOR UPDATE SKIP LOCKED`. It deliberately does not use Temporal or Dagster: a run is a few hundred HTTP calls.
- Per-target rate limits (default 6 requests/minute with jitter against third-party production), three retries with exponential backoff, timeouts recorded as results.
- Self-run probe: a packaged CLI/container that executes a frozen suite inside the customer's network and emits a signed results JSONL for import, so Caudals never holds production credentials.
- Provider layer: at least two model providers behind a thin abstraction (judge ensembling, vendor-swap detection); tokens and cost logged per result.
- Case deduplication by embedding similarity uses pgvector in the existing database; no separate vector service.

`/proof` demo: a public documentation URL or PDF (≤10 MB, 30 pages) → 12 cited test questions → answers from the visitor's endpoint, pasted manually, or from a baseline model → scorecard with failing cases → offer of a Reality Check. IP rate limits, 24-hour content retention, daily model-spend cap.

Reports are assembled from run data, rendered HTML → PDF, and stored in object storage with run archives and JSONL exports.

Expert work: freelance domain experts get restricted accounts to author and review cases and dataset items. Access is scoped to the redacted material of their assigned tasks, and every item records author, reviewer and guideline version. Expert, task and dataset-item tables are added when custom dataset builds move in-app.

## Runtime Routing and Hostname Behavior

- App hostnames: `NEXT_PUBLIC_APP_HOSTNAMES`
- Marketing hostnames: `NEXT_PUBLIC_MARKETING_HOSTNAMES`
- The public page surface is `/`, `/sectors`, `/sectors/*` (Spanish slugs under
  `/es/sectores/*`), `/contact`, `/call`, `/blog`, `/blog/*`,
  `/newsletter`, `/newsletter/*` and `/legal/*`;
  `/auth/*`, `/api/auth/*`, `/api/user/role`, the funnel APIs and
  evaluation routes (`/ops`, `/workspace`, `/review`, `/evaluation-entry`, `/share`), their APIs and required metadata/assets are separate private surfaces.
- Removed legacy self-serve route groups return `404`: `/browse`,
  `/contributor`, `/dashboard` (app-host root requests are rewritten to `/evaluation-entry`), `/pwa`
  (the manifest links public surfaces only), `/requester`, `/admin` and all
  `/admin/*` subroutes. The legacy dashboard UI and its navigation are deleted;
  historical data and frozen CLI/domain tooling remain retained.
- `/contact` is the general contact and intake path for evaluation requests.
  Submissions create `contact`, `buyer_opportunity` and `evaluation_request`
  rows under the Caudals tenant (system type, stage, sector, owner role, what
  the system answers, requested offer, URLs), emit `audit_event` state
  transitions for the opportunity and the request, and send the operator
  notification email. `PUBLIC_BUYER_BRIEF_INTAKE_ENABLED=false`
  keeps it email-only.
- `/call` is the public meeting-booking surface. It embeds the Cal.com inline scheduler (`@calcom/embed-react`) and is treated as demand capture alongside `/contact`. The booking link is read server-side from the `CALCOM_LINK` env var (with a `NEXT_PUBLIC_CALCOM_LINK` build-time fallback); the inline embed needs only the public Cal link, no API key or OAuth. `/call` stays out of the primary landing navigation and is cross-linked from `/contact`.
- `/sitemap.xml` is the public sitemap index and points to post and page subsitemaps. `/llms.txt` is the curated public AI-readable index. Neither may expose private routes, authenticated workspaces, direct-route surfaces or operational APIs.
- `/api/auth/*` is the Better Auth operator identity endpoint, used with `/auth/*` for Operator Console sign-in.

## Infrastructure and Deployment

- Production runtime is self-hosted across two VPS nodes connected over Tailscale:
  - **`atlantic`** (formerly `caudals-1`, Hetzner `168.119.49.95`, Tailscale `100.118.70.90`): Primary application and data platform host. Runs `caudals.com`, `ops.caudals.com`, `caudals-postgres`, evaluation platform, `caudals-growth_social`, MinIO, and internal Tailscale dashboards. Dokploy Traefik terminates TLS (Let's Encrypt) and routes to local apps and private stacks on `dokploy-network`. Cutover from DigitalOcean completed on 2026-06-30.
  - **`arctic`** (or `artic`, AWS `51.102.90.206`, Tailscale `100.93.226.39`): Dedicated cold-outreach host running the Warmbly Swarm stack (`out.caudals.com`, `out-admin.caudals.com`, `out-track.caudals.com`, `out-forms.caudals.com`) with isolated storage and enrichment services.
- DigitalOcean and HAProxy references describe the June migration rollback, not a verified current recovery target. Current rollback uses compatible retained immutable Swarm images and database forward repair; check `VPS_RUNTIME.md` and evals runbooks before recovery.
- Repository deploy scripts manage Swarm services; the retained Dokploy Traefik handles ingress.
- App Docker images are built in GitHub Actions
  (`.github/workflows/deploy.yml`), published to Docker Hub with immutable
  tags and rolled out to the `caudals-app` Swarm stack over Tailscale SSH. The
  workflow no longer builds or deploys the legacy Dagster image.
- Deployment pipeline supports push-to-`main` and manual dispatch execution.
- `Dockerfile` uses multi-stage build (`deps` -> `build` -> `runtime`).

## PostgreSQL Runtime

- VPS SSH endpoints:
  - `atlantic`: `caudals@atlantic` (or `caudals@caudals-1`, Hetzner Tailscale host `100.118.70.90`).
  - `arctic`: `caudals@arctic` (AWS Tailscale host `100.93.226.39`).
  - Public SSH on external IPs is disabled/not an operations path.
- PostgreSQL runtime: private `caudals-postgres` swarm service on `dokploy-network`
- Runtime image: `caudals-postgres:16-pgvector-cron`, built from `infra/postgres/Dockerfile`
- App runtime: Swarm service `caudals-app_app` (stack `caudals-app`,
  `infra/app-stack.yml`) on `dokploy-network`, receiving its runtime env as the
  `app_runtime_env_<digest>` Docker secret (no plaintext secret env names on
  the service; stale Supabase runtime envs removed)
- Required extensions: `pgcrypto`, `citext`, `pg_stat_statements`, `vector`, `pg_trgm`, `pg_cron`
- Migration files: `db/migrations/*`
- Rollback files: `db/rollbacks/*`
- Better Auth identity tables use `auth_*` names so they do not collide with operator-domain tables.
- Admin two-factor authentication (launch L-08, spec P-43): platform admins,
  platform operators and workspace operators must use TOTP when
  `EVALS_ADMIN_MFA_REQUIRED=true` (off until every staff account has
  enrolled). `requireIdentity` then refuses staff sessions without TOTP
  (`MFA_ENROLMENT_REQUIRED`; pages redirect to `/workspace/security`, where
  anyone can set up TOTP with single-use recovery codes). Staff cannot turn it
  off while it is required. Better-auth's account lockout uses the columns
  added by migration 107. Sensitive actions require a sign-in from the last 15
  minutes (`requireRecentSignIn`; platform changes today, billing actions from
  L-12/L-16), confirmed in place by `components/evals/reauth.tsx`.
- Auth requests pass `lib/auth/request-guard.ts` first: the request is
  labelled with the visitor's proven address (Cloudflare's header only from a
  Cloudflare peer), so better-auth's limits are per visitor, and durable
  PostgreSQL limits apply to sign-in (20 per visitor, 10 per account per 15
  minutes), two-factor checks and password resets. JIT elevation and Postgres
  RLS remain the load-bearing admin controls.
- Vulnerability management runs through weekly Dependabot checks for npm,
  GitHub Actions, and Dockerfile base images plus Docker Scout image scans in
  the Docker publish workflow. A quarterly scheduled GitHub workflow opens or
  updates the penetration-test tracker issue for Security/CTO execution.
- Public routing contract:
  - PostgreSQL has no public ingress.
  - Application access goes through server-side typed DB clients and operator-scoped RLS settings.
  - Public `22/tcp` is closed in the completed production posture; during the
    Hetzner bootstrap window, temporary key-only public SSH must be removed as
    soon as Tailscale `caudals@atlantic` access is verified.
  - Raw database ports are not intended to be reachable from the public internet.

Legacy Supabase containers, images, volumes, and host filesystem tree were removed after verified encrypted backups were written under `/root/.caudals/backups`.

Use `docs/TOOLS.md` for approved tunnel/CLI/MCP workflows.

## Observability

- Sentry initialization is registered through Next.js instrumentation for server,
  edge, and client runtime errors.
- Sentry is disabled until `SENTRY_DSN` or the server-only
  `SENTRY_DSN_FILE` Docker secret fallback is configured. Default sampling is
  `0` for traces/profiles unless environment variables raise it.
- Production mounts the DSN as a versioned Docker secret on the web app and
  the worker, scheduler and document services (the browser executor has no
  direct egress and does not report). `lib/observability/sentry-scrub.mjs`
  removes personal data from every event; `SENTRY_RELEASE` is the deployed
  commit and `SENTRY_SERVICE` names the process. Unexpected API failures are
  captured with the request id that also appears in the logs.
- `GET /api/evals/v1/health/webhooks` (app host, unauthenticated) answers 200
  or 503 with the state of each webhook dependency and no details; checks are
  registered in `lib/observability/webhook-health.ts`, which L-12 extends with
  the Stripe webhook. The external uptime check polls it every minute.
- The private Docker Swarm observability stack is defined in
  `infra/observability/docker-stack.yml`; if reactivated, it runs on `dokploy-network` without
  public ingress. It was not present in the 2026-09-28 live service inventory.
- OpenTelemetry spans emitted by the app export over OTLP HTTP when
  `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` is set. The retained stack target is
  `http://caudals-observability-tempo:4318/v1/traces`.
- When the observability stack is enabled, Docker runtime logs are scraped through Promtail and written to Loki with
  `service_name`, `container_name`, `container_id`, `stack`, and `stream`
  labels.
- When enabled, Prometheus scrapes Alertmanager, Tempo, Loki, Promtail, cAdvisor, and itself
  for platform metrics and evaluates private Alertmanager-routed rules for
  scrape failures, host disk pressure, and rule/config health. Grafana is
  provisioned internally with Prometheus, Loki, and Tempo datasources.
- OpenTelemetry stdout export remains opt-in via `OTEL_STDOUT_ENABLED=true`
  for bounded diagnostics; it should not be enabled permanently if logs may
  contain sensitive operational context.

## Object Storage

- Caudals uses an S3-compatible object store for evaluation reports, run
  archives, JSONL exports, custom datasets, customer document uploads and
  existing legacy artifacts. The single-node runtime deploys a private MinIO
  service on `dokploy-network`; DigitalOcean Spaces remains the external
  managed-store target for hosted environments.
- The private object-storage stack is defined in
  `infra/object-storage/docker-stack.yml` and runs MinIO without public ingress.
  `scripts/deploy-object-storage-stack.sh` creates root-only generated access
  credentials under `/root/.caudals/object-storage/`, stores them as Docker
  secrets, creates the configured bucket, and wires the app service to
  `DO_SPACES_*_FILE` secret fallbacks.
- The application reads object-storage configuration through direct env vars or
  Docker secret-file fallbacks for `DO_SPACES_ACCESS_KEY_ID_FILE` and
  `DO_SPACES_SECRET_ACCESS_KEY_FILE`; plaintext access-key env vars are blocked
  by the completion gate.
- `scripts/probe-object-storage.ts` validates any externally reachable
  S3-compatible configuration by writing, reading, and deleting a short private
  probe object without printing credentials. `scripts/probe-object-storage-stack.sh`
  performs the same write/read/delete check from inside the private Docker
  network and verifies the stack has no published ports.

## Legacy Private Stacks

Eight legacy dataset-build stacks were deployed as private Swarm stacks on
`dokploy-network`: Dagster (`infra/orchestration/`), Temporal
(`infra/workflow/`), Label Studio and CVAT (`infra/labeling/`), lakeFS
(`infra/lakehouse/`), Qdrant (`infra/vector/`), Redis (`infra/cache/`) and
Marquez (`infra/operations/`). Their dataset-build scope remains frozen:

- On 2026-09-28, Temporal and its UI are running. Dagster, Label Studio, CVAT, lakeFS, Qdrant, the legacy cache and Marquez were not observed as services. Social Redis belongs to the active Postiz stack, not the frozen cache. Do not infer current image/volume deletion from an older shutdown record. Restored stacks must remain private.
- The live public funnel does not call them, and new evaluation code must not
  depend on them. App-code references are limited to Operator Console snapshot
  data, the legacy CLI and frozen operator/supplier modules.
- Dagster, Temporal, Marquez and lakeFS keep dedicated databases inside
  `caudals-postgres`; those databases, the stacks' named volumes and their
  Docker secrets are retained.
- `npm run platform:completion-status` checks their readiness and the legacy
  dataset-build evidence only with `CAUDALS_LEGACY_STACKS_GATE_ENABLED=true`.
  CI no longer builds or deploys Dagster. Deploy scripts remain one-command
  restores.

Runbook details, secrets and dashboard ports are in `docs/TOOLS.md` → Legacy Private Stacks.

## Data and Storage Domains

Current:

- lead capture: `contact`, `buyer_opportunity` and `evaluation_request` records from `/contact`; newsletter
  subscribers live in the Leads CRM behind `/api/newsletter`
- content: bundled blog fallback and marketing metadata; newly approved blog
  posts are read from the narrow public Leads archive API with 60-second
  server-side revalidation, so publication does not rebuild this application
- operations: Operator Console records, platform settings, audit notes and `audit_event`
- legacy domains (frozen): buyer and supplier organisations and workspaces,
  supplier assets, dataset-build operations, labelling batches, release
  documentation, delivery and subscription records

Evaluation and dataset domains:

- projects and targets
- versioned cases and sector-generic case libraries
- runs and immutable results, human reviews
- findings and reports
- freelance experts, scoped tasks, immutable item reviews and sample-aware QA metrics for custom datasets
- customer uploads, run archives, golden-set exports and custom datasets in object storage

## Security and Reliability Anchors

- RLS-first access model with scoped service-role usage
- Durable abuse controls on public APIs
- Webhook replay/idempotency protections when payment code is active
- Upload/path validation guardrails
- Provenance and auditability for every case, run, review, report and dataset item; results are immutable
- Customer content: PII redacted at ingest, EU processing, named sub-processors, retention and deletion per data handling policies
- Freelance experts: least-privilege access to redacted task material only
- No adversarial inputs against any system without its owner's written authorisation
- Error capture and opt-in stdout tracing without default PII transmission
- CI quality gates for release confidence

## Core Lifecycle Flows

1. Demand capture: a visitor reads the landing page, blog or newsletter → contacts us, books a call or runs the free `/demo` (and may open a free account from it) → operators qualify the opportunity in the Leads CRM.
2. Reality Check: operators pick a qualifying public system → run a 40-case probe under the rules of engagement → send a teaser → deliver the free report and readout.
3. Pilot or Full Evaluation: kickoff → documents, real questions and expert session → suite authored and signed off → runs (hosted, self-run or output-only) → grading and review → report, live readout and JSONL export.
4. Subscription: monthly (or weekly) runs → new cases and new data, including expert-authored cases → regression report.
5. Custom dataset build: coverage gaps and failure causes scope the dataset → freelance domain experts build it under Caudals guidelines and double review → dataset with provenance and QA scorecard → a re-run proves the score moved.

## Maturity and Drift Watchlist

Mature current areas:

- landing/contact/blog public surface
- public/private hostname and route separation
- public intake APIs
- private infrastructure access controls, operational health timers and DGX telemetry

Active drift risks:

- public copy, `/contact` intake fields, `/llms.txt`, agent markdown and SEO
  metadata must stay aligned with the evaluation positioning and read prices
  from `lib/public/evaluation-offers.ts`
- MinIO is running; the retained dedicated observability stack was not observed on 2026-09-28. Keep actual runtime, gate configuration and documented guarantees aligned; off-host backup remains deferred by founder decision
- existing private evaluation and operator surfaces must enforce auth, authorization, RLS, rate limits and audit; removed marketplace routes must not be restored inadvertently
- evaluation code must not grow on frozen marketplace modules or legacy stacks

## Linked References

- `product-specs/overview.md`
- `TOOLS.md`
- [Caudals Leads architecture](https://github.com/Caudals/leads/blob/main/docs/ARCHITECTURE.md) — the
  separate Leads CRM runtime, which shares private `caudals-postgres` and
  `dokploy-network` conventions but owns its dedicated `caudals_leads` database
  and application schema.
