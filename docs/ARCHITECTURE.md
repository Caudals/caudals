# Caudals Architecture

## System Overview

Caudals evaluates companies' AI systems and builds custom datasets with freelance domain experts (`product-specs/overview.md`). Production remains a public marketing and demand-capture site plus the private Operator Console. An invite-only evaluation product is implemented in this repository but has not passed its production release gates; see `product-specs/evals-platform-implementation-spec.md` and `evals/work-packages/WP-08.md`–`WP-13.md`.

Current production scope:

- Public marketing, authority and demand capture: `/`, `/contact`, `/call`, `/blog`, `/blog/*`, `/newsletter`, `/newsletter/*`, `/legal/*`
- Public APIs for that funnel: `/api/contact`, `/api/newsletter`, `/api/analytics/track`
- Private operator access: `/auth/*`, `/api/auth/*`, `/admin` (Operator Console)

The pre-pivot marketplace surfaces (`/buyer`, `/supplier`, `/v1/*`, `/security`, `/pricing`, `/docs`, `/about`, `/careers`, `/catalogue`) and Stripe billing were deleted; they return `404`. There is no landing-mode flag: the routes above are the whole app.

## Application Stack

- Framework: Next.js App Router (`next@16`), React 19, TypeScript
- UI: Tailwind CSS v4, Radix UI, shadcn/ui, custom primitives
- Data/Auth: self-hosted PostgreSQL + Better Auth + Postgres RLS
- Storage: S3-compatible object storage — private MinIO on the VPS, with DigitalOcean Spaces as the external managed target (`DO_SPACES_*` variable names serve both)
- Email: Resend
- Payments: Stripe is present in the codebase but not part of the current public deployment
- Observability: Sentry for Next.js error capture, OpenTelemetry OTLP traces to private Tempo, Docker logs to Loki through Promtail, Prometheus metrics with Alertmanager rules, internal Grafana
- CI/CD: GitHub Actions → Docker Hub → Dokploy on the Hetzner VPS
- Legacy private stacks (Dagster, Temporal, Label Studio, CVAT, lakeFS, Qdrant, Redis, Marquez) are frozen and shut down; see "Legacy Private Stacks".

## Code Topology

- `app/(home)/*`: marketing/public routes
- `app/(auth)/*`: sign-in/callback/reset flows for existing internal accounts
- `app/(app)/*`: hidden authenticated app, Operator Console (`/admin`) and APIs
- `app/(app)/api/auth/[...all]`: Better Auth endpoint for operator email/password, reset-password, organization/team, and optional TOTP/passkey hardening
- `components/*`: shared and domain UI modules
- `lib/actions/*`: server action business logic
- `lib/public/*`: public funnel logic: the `/contact` evaluation-request intake (`evaluation-request-intake.ts`) and the published offers (`evaluation-offers.ts`)
- `lib/security/*`: public API abuse controls (rate limiting)
- `lib/operator/*`: Operator Console domain modules. Record CRUD and the console repository are shared infrastructure; the dataset-build modules (dataset operations, active learning, cleanlab, license composition, modality contracts, release documentation, sample-preview gating, subscription delivery, compliance controls) are frozen.
- `app/(buyer)/*`, `app/(supplier)/*`, `lib/buyer/*`, `lib/supplier/*`, `lib/api/v1.ts`: legacy direct-route surfaces (frozen)
- `lib/cli/*`, `scripts/caudals.ts`, `bin/caudals.mjs`: legacy operations CLI (frozen)
- `db/migrations/*` and `db/rollbacks/*`: PostgreSQL schema history; every migration ships a rollback
- Planned: `app/(eval)/*`, `app/(app)/admin/eval/*`, `lib/eval/*`

Schema notes: `audit_event`, `signing_key`, operator record notes, escalation runbooks (`runbook`, `escalation_case`) and `security_review_artifact` are platform infrastructure. `/contact` writes `contact`, `buyer_opportunity` and `evaluation_request` rows (migration 030) with `audit_event` transitions for the opportunity and the request; it no longer writes `dataset_brief`, which only the frozen `/v1` brief intake still creates. `evaluation_request` holds the structured intake while the sales pipeline stays on `buyer_opportunity`; the Operator Console lists requests read-only under Leads. Legacy build tables (`label_batch`, `modality_contract`, `release_documentation_bundle`, `compliance_control_scope`, `cost_entry` and related) are frozen: keep them migrating cleanly, do not build on them.

## Evaluation Product Implementation (not yet released)

The current evaluation implementation uses `app/(evaluation)` for separate `/ops` and `/workspace` routes, `/api/evals/v1` for scoped APIs, `lib/evals` for typed evidence and execution, `evals` PostgreSQL tables from migrations 031–041, and separate general, document, and browser workers. Workspace membership is verified server-side; tenant queries run under a non-owner, NOBYPASSRLS role. Stage C keeps registration invite-only. Website recipes are declarative and require validation before use; the browser worker is disabled by default and still needs a policy-enforced deployment egress boundary and authorized real-widget evidence. Stage D adds a customer-side outbound private runner and a gated schedule loop in the general worker. The loop creates at most one latest missed dispatch, compares frozen runs with coverage guards, and separately retries signed HTTPS webhook delivery. See `evals/work-packages/WP-09.md`–`WP-13.md` for precise status and remaining release checks.

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
app/(app)/admin/eval/          operator console: authoring, grading queue, expert review, run control
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
- The public page surface is `/`, `/contact`, `/call`, `/blog`, `/blog/*`,
  `/newsletter`, `/newsletter/*` and `/legal/*`;
  `/auth/*`, `/api/auth/*`, `/api/user/role`, `/admin`, the funnel APIs and
  required metadata/assets are the only other routes.
- Removed legacy self-serve route groups return `404`: `/browse`,
  `/contributor`, `/dashboard` (app-host root requests go to `/admin`), `/pwa`
  (the manifest links public surfaces only) and `/requester`. Legacy `/admin/*`
  subroutes are removed; `/admin` is the Operator Console.
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

- Production runtime is self-hosted on the Hetzner cost-optimized VPS at
  `168.119.49.95` (`caudals-1`). Cutover from DigitalOcean completed on
  2026-06-30: Cloudflare proxies the production hostnames to Hetzner, where the
  Dokploy Traefik terminates TLS (Let's Encrypt) and routes to the local app,
  Umami, and private stacks on `dokploy-network`.
- The DigitalOcean VPS remains online and untouched as the rollback origin (app
  service `1/1`, verified backups retained under `/root/.caudals/backups`).
  Rollback is a Hetzner-local revert (remove Dokploy Traefik, start HAProxy) and
  needs no Cloudflare/DNS change.
- Dokploy manages runtime/deployment.
- App Docker images are built in GitHub Actions
  (`.github/workflows/deploy.yml`), published to Docker Hub with immutable
  tags and rolled out to the `caudals-app` Swarm stack over Tailscale SSH. The
  workflow no longer builds or deploys the legacy Dagster image.
- Deployment pipeline supports push-to-`main` and manual dispatch execution.
- `Dockerfile` uses multi-stage build (`deps` -> `build` -> `runtime`).

## PostgreSQL Runtime

- VPS SSH endpoint: `caudals@caudals-1` (Hetzner Tailscale host `100.118.70.90`). Public SSH on `168.119.49.95` is not an operations path.
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
    soon as Tailscale `caudals@caudals-1` access is verified.
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
  `infra/observability/docker-stack.yml` and runs on `dokploy-network` without
  public ingress.
- OpenTelemetry spans emitted by the app export over OTLP HTTP when
  `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` is set. The production target is
  `http://caudals-observability-tempo:4318/v1/traces`.
- Docker runtime logs are scraped through Promtail and written to Loki with
  `service_name`, `container_name`, `container_id`, `stack`, and `stream`
  labels.
- Prometheus scrapes Alertmanager, Tempo, Loki, Promtail, cAdvisor, and itself
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
Marquez (`infra/operations/`). They are frozen and shut down:

- None is deployed on `caudals-1` (the Dagster services were removed on
  2026-09-10) and their images were pruned on 2026-09-11. If one is restored,
  it must not publish ports.
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

Planned evaluation and dataset domains:

- projects and targets
- versioned cases and sector-generic case libraries
- runs and immutable results, human reviews
- findings and reports
- freelance experts, tasks, item reviews and QA metrics for custom datasets
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

1. Demand capture: a visitor reads the landing page, blog or newsletter → contacts us, books a call or (planned) tries `/proof` → operators qualify the opportunity in the Leads CRM.
2. Reality Check: operators pick a qualifying public system → run a 40-case probe under the rules of engagement → send a teaser → deliver the free report and readout.
3. Pilot or Full Evaluation: kickoff → documents, real questions and expert session → suite authored and signed off → runs (hosted, self-run or output-only) → grading and review → report, live readout and JSONL export.
4. Subscription: monthly (or weekly) runs → new cases and new data, including expert-authored cases → regression report.
5. Custom dataset build: coverage gaps and failure causes scope the dataset → freelance domain experts build it under Caudals guidelines and double review → dataset with provenance and QA scorecard → a re-run proves the score moved.

## Maturity and Drift Watchlist

Mature current areas:

- landing/contact/blog public surface
- landing-mode landing-page/navigation restriction
- public intake APIs
- private infrastructure access hardening and observability

Active drift risks:

- public copy, `/contact` intake fields, `/llms.txt`, agent markdown and SEO
  metadata must stay aligned with the evaluation positioning and read prices
  from `lib/public/evaluation-offers.ts`
- the observability and object-storage stacks are not deployed on `caudals-1`
  (as of 2026-09-11); the completion gate reports them until they are
  redeployed or explicitly waived
- legacy direct-route surfaces must stay protected by auth, authorization, RLS,
  rate limits and audit rather than landing-page obscurity
- evaluation code must not grow on frozen marketplace modules or legacy stacks

## Linked References

- `product-specs/overview.md`
- `TOOLS.md`
- [Caudals Leads architecture](https://github.com/Caudals/leads/blob/main/docs/ARCHITECTURE.md) — the
  separate Leads CRM runtime, which shares private `caudals-postgres` and
  `dokploy-network` conventions but owns its dedicated `caudals_leads` database
  and application schema.
