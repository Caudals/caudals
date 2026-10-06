# Caudals Architecture

## System Overview

Caudals evaluates companies' AI systems and builds custom datasets with freelance domain experts (`product-specs/overview.md`). Production includes the public marketing funnel and deployed invite-only evaluation product. Customer rollout remains subject to workspace entitlements, target readiness and the remaining release gates; see `product-specs/evals-platform-implementation-spec.md` and `evals/work-packages/WP-08.md`–`WP-15.md`.

Current production scope:

- Public marketing, authority and demand capture: `/`, `/sectors`, `/sectors/*`, `/contact`, `/call`, `/blog`, `/blog/*`, `/newsletter`, `/newsletter/*`, `/legal/*`
- Public APIs for that funnel: `/api/contact`, `/api/newsletter`, `/api/analytics/track`, `/api/demo/*`
- Public demo: `/demo` (soft launch); self-serve sign-up from it at `/workspace/signup`
- Private operator access: `/auth/*`, `/api/auth/*` (retained internal-account auth)
- Evaluation: `/ops`, `/workspace`, `/review`, `/evaluation-entry`, `/share` and scoped `/api/evals/v1` APIs

The pre-pivot marketplace surfaces (`/buyer`, `/supplier`, `/v1/*`, `/security`, `/pricing`, `/docs`, `/about`, `/careers`, `/catalogue`) and Stripe billing were deleted; they return `404`. There is no landing-mode flag: the routes above define the public and private product boundaries.

## Application Stack

- Framework: Next.js App Router (`next@16`), React 19, TypeScript
- UI: Tailwind CSS v4, Radix UI, shadcn/ui, custom primitives
- Data/Auth: self-hosted PostgreSQL + Better Auth + Postgres RLS
- Storage: S3-compatible object storage — private MinIO on the VPS, with DigitalOcean Spaces as the external managed target (`DO_SPACES_*` variable names serve both)
- Email: Resend
- Payments: marketplace Stripe checkout/billing was removed; historical tooling references do not expose a current payment product
- Observability: Sentry/OTLP instrumentation is configurable; the retained Tempo/Loki/Prometheus/Grafana stack is not observed running on 2026-09-28. Evals host health/backup timers and DGX telemetry are installed; see `VPS_RUNTIME.md`
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

Schema notes: `audit_event`, `signing_key`, operator record notes, escalation runbooks (`runbook`, `escalation_case`) and `security_review_artifact` are platform infrastructure. `/contact` writes `contact`, `buyer_opportunity` and `evaluation_request` rows (migration 030) with `audit_event` transitions for the opportunity and the request; it no longer writes `dataset_brief`; the former `/v1` brief intake is not a live route. `evaluation_request` holds the structured intake while the sales pipeline stays on `buyer_opportunity`; the intake records remain retained after removal of the legacy dashboard. Legacy build tables (`label_batch`, `modality_contract`, `release_documentation_bundle`, `compliance_control_scope`, `cost_entry` and related) are frozen: keep them migrating cleanly, do not build on them.

## Evaluation Product Implementation (feature-gated)

The current evaluation implementation uses `app/(evaluation)` for separate `/ops`, `/workspace` and assignment-scoped `/review` routes, `/api/evals/v1` for scoped APIs, `lib/evals` for typed evidence and execution, the `evals` PostgreSQL schema with additive migrations, and separate general, document, scheduler and browser workers. Workspace membership is verified server-side; tenant queries run under a non-owner, NOBYPASSRLS role. Stage C keeps registration invite-only, except self-serve free-plan sign-up from the public demo (see Public Demo). Website recipes are declarative and require validation before use; the deployed browser worker has a private egress gateway and DB relay, with synthetic acceptance recorded and customer recipes/authorizations checked per target. Stage D adds a customer-side outbound private runner and a separate gated scheduler service. Stage E adds redacted expert assignments, immutable submissions/reviews and privately delivered signed improvement datasets with family-aware splits and observational follow-up evidence. Stage E is disabled unless `EVALS_EXPERT_WORK_ENABLED=true` and the migration, role, trigger and Ed25519 release checks pass. See `evals/work-packages/WP-09.md`–`WP-15.md` for precise status and remaining release checks.

Engine models and lifecycle (migrations 063–064):

- **Website context.** The browser reader follows the submitted page's public HTTPS redirects and uses the first captured page's final origin for its bounded crawl. Excerpts cite the resolved URL, including query parameters supplied by a redirect; linked pages stay on that final origin. The isolated HTTPS egress proxy validates and pins every destination connection, including intermediate redirect hops.
- **Model routes.** Each internal engine role (`context_analyzer`, `generator`, `judge`, `report_writer`) resolves to a workspace route (`evals.generation_provider_route`) or, failing that, the platform default (`evals.platform_model_route`); see `lib/evals/repositories/model-routes.ts`. Platform administrators choose models in Settings → AI models (`/api/evals/v1/engine/*`, `lib/evals/repositories/engine-settings.ts`), from the DGX Spark (Ollama tags) or any OpenAI-compatible API. DGX work stays `local_only`; commercial revisions run through the approved-provider path with the account's key from `evals.provider_connection` (an envelope bound to the nil tenant, readable only by the inference worker). Choosing a model registers an immutable provider revision and price revision, so every call stays budgeted and attributed. Source material is fitted round-robin to the model's context window; the workspace budget is created from the entitlement on first use.
- **Evaluation queue.** Valid run requests and resumes enter a durable FIFO per workspace. General and browser workers take the same tenant advisory lock before claiming a run slot, bounded by the immutable `max_active_runs` entitlement. Waiting steps retry through the outbox without attempts or reservations; completion, cancellation or a fully drained pause frees capacity. Private runner polling and signed bundle downloads use the same admission check. Missing/disabled entitlements, exhausted budgets and unready connections remain denied. Migration 073 adds `queued_at` and read-only worker allowance grants; resume joins the end of the queue.
- **Worker scope.** The general, document, scheduler and browser workers serve their deploy-time `EVALS_*_ORG_IDS` plus every live workspace from `evals.worker_workspace_ids()`, refreshed every 30 s, so new clients need no redeploy. Every job still runs inside its own tenant scope under RLS.
- **Lifecycle.** Evaluations, systems, test sets, reports and reference material can be renamed and deleted (`/api/evals/v1/items/:kind/:id`). Delete archives (`archived_at`): the item leaves every list, share links of deleted reports are revoked, schedules pause, and immutable evidence follows the retention policy. Workspaces are renamed through `evals.rename_workspace()`; deleting a workspace remains the audited deletion workflow.
- **Report exports.** PDF (document worker), editable Word (`lib/evals/reports/docx.ts`), CSV results and the CEF evidence bundle.

## Public Demo

A no-signup, eight-question test of a visitor's AI system (founder decision 2026-10-05). It is deliberately separate from the tenant engine: no workspace, RLS, budget ledger or queue, so it stays fast and its abuse surface stays small.

- **Code:** `lib/demo/*` (engine), `app/(app)/api/demo/*` (API), `components/demo/*` and `app/[locale]/demo` (page), `services/evals-browser/demo-worker.ts` (website work), `app/api/evals/v1/signup` + `components/evals/self-serve-signup.tsx` (account).
- **Data:** schema `demo` (migration 075): `demo.run` (one row per test: pages read, questions, answers, verdicts, summary; deleted seven days after creation), `demo.llm_usage` (model calls per UTC day), `demo.challenge_use` (spent proof-of-work challenges). Never a credential: API keys and curl headers live only in the web process's memory and are dropped when the run ends.
- **Flow:** the web process runs each run through `reading` (pinned HTTPS fetch of up to six same-site pages, robots.txt honoured, ranked toward help/pricing/conditions) → `writing` (one streamed call writes eight questions with answer, key facts and a verbatim quote; each is accepted only when the quote is found in the cited excerpt) → `asking` (APIs called from the web process, one per second; website chats asked by the browser worker in fresh contexts) → `grading` (one batch judge call, grading engine v2 semantics, deterministic pre-checks and a lexical fallback) → `done`. A 45-second lease lets a restarted process resume unfinished runs; the client polls `GET /api/demo/runs/:id` with an ETag.
- **Website chats:** the browser worker (`EVALS_BROWSER_DEMO_ENABLED=true`) finds the chat as soon as the run exists, using the connector's auto-detection, and the engine writes questions only after the chat is found, so a missing chat costs no model quota. The demo loop runs beside the platform's browser slot (one demo at a time, `EVALS_BROWSER_DEMO_PARALLEL` questions at once) and never blocks customer jobs. Pages that need a browser to render are read there too. The worker's role has column-level grants on `demo.run`.
- **Models:** DeepSeek V4 Flash on the DGX Spark (`DEMO_MODELS`, default `bluehawana/deepseek-v4-flash:iq2_m` via Ollama on the private network endpoint `http://192.168.70.19:11434/v1`), about two calls per demo. Local private inference runs with zero external cost or provider rate limits; `DEMO_DAILY_MODEL_CALLS` (default 200) bounds daily execution. OpenRouter free models (`DEMO_OPENROUTER_API_KEY`) remain supported as an optional external fallback or override. Platform administrators choose the preferred model in Settings → AI models → Public demo (`/api/evals/v1/engine/demo`), from the configured demo provider's live model catalog (free models only on OpenRouter). The audited choice is saved in `demo.model_setting` (migration 076), bound to the provider endpoint's hash. The web runtime can read it; only the configuration-admin role can write it. Each completion resolves the preference without a restart, then retains the `DEMO_MODELS` fallback chain. With no saved preference, the environment/default model order applies.
- **Abuse controls:** a self-hosted proof of work (18 bits, signed, bound to the visitor, single use) instead of a CAPTCHA; the visitor key is an HMAC of their IP (`cf-connecting-ip` only when the peer is a Cloudflare edge, IPv6 per /64), never the raw address; one successful test per visitor a day and six attempts; three a day per tested site and per documentation site; three at a time overall; public HTTPS destinations only, DNS pinned and every redirect re-checked; byte and time limits everywhere; same-origin checks on writes; private `noindex` capability links. Questions are ordinary customer questions, never adversarial.
- **Sign-up:** the report's account card emails a one-time link (`evals.request_self_serve_signup`; only its sha256 is stored, two days). `/workspace/signup` lets the person set a name and password; `evals.enroll_self_serve` creates the verified account, a workspace with the person as owner and a free-plan entitlement (`plan = free`: one system, 50 tests per set, three runs a month, one active run, no schedules, local DGX models only), and the demo is imported as a project, evaluation, system (without its key) and website source. The limits are database triggers on `evals.target`, `evals.run` and `evals.generation_job`, so no code path can skip them.
- **Flags:** `DEMO_ENABLED`, `DEMO_BROWSER_ENABLED` (web) and `EVALS_BROWSER_DEMO_ENABLED` (browser worker); optional `DEMO_SECRET` (otherwise derived from `BETTER_AUTH_SECRET`), `DEMO_RUNS_PER_VISITOR`, `DEMO_RUNS_PER_SITE`, `DEMO_MAX_ACTIVE`, `DEMO_APP_ORIGIN`.

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
- Production operator login allows password-only Better Auth sessions by
  policy. TOTP and passkeys remain available as optional hardening, while JIT
  elevation and Postgres RLS remain the load-bearing admin controls.
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
