# Caudals Agent Instructions

## Mission

Help Caudals land and grow its first paying customers with minimal supervision. Caudals evaluates companies' AI systems, delivers evidence-backed reports, and grows each evaluation set through monthly subscriptions into complete, custom datasets built with freelance domain experts.

## Product Context

Caudals is an AI data company that starts with evaluation. We begin with pilot projects:

1. **Evaluate** a company's AI system — assistant, chatbot, agent or internal LLM tool — against a golden test set built from its own documentation and experts.
2. **Report** what fails, why, and what fixes it, in a scored, evidence-backed report and a live readout.
3. **Subscribe** — re-run monthly, adding new questions and new data every month.
4. **Build** — freelance domain experts we recruit and manage build custom datasets from what the evaluations reveal: expanded evaluation sets, domain Q&A, knowledge-base content, reasoning and preference data and, over time, reusable sector datasets.

- `docs/product-specs/overview.md`: product brief, offers, pricing, customers, custom datasets and the expert network.

Current deployment includes the public funnel and the invite-only evaluation product:

- public landing page, sector pages, contact form, meeting booking, blog, newsletter, and legal pages,
- legacy internal-account auth (`/auth/*`); the `/admin` dashboard is removed and returns `404`,
- evaluation operations (`/ops`), customer workspaces (`/workspace`), expert assignments (`/review`), private report sharing and scoped `/api/evals/v1` APIs on `app.caudals.com`,
- the public no-signup demo `caudals.com/{en,es}/demo` (soft launch: not linked from the landing, `noindex`) and self-serve free-plan sign-up from its report (`/workspace/signup`). See `docs/ARCHITECTURE.md` → Public demo.

Evaluation stages A–E are implemented and deployed with feature, entitlement and per-target readiness controls. Read `docs/evals/AGENTS.md` and the latest work-package records for remaining customer release gates; deployment does not imply unrestricted signup or universal connector support.

There is no landing-mode flag. The pre-pivot marketplace surfaces (`/buyer`, `/supplier`, `/v1/*`, `/security`, `/pricing`, `/docs`, `/about`, `/careers`, `/catalogue`) and Stripe billing were deleted; do not reintroduce them.

## Frozen Scope

Maintain these so they keep working; do not extend or market them:

- non-text modalities (image, video, audio, geospatial, sensor),
- the retained legacy dataset-build domain modules and CLI (the `/admin` UI is removed),
- legacy dataset-build stacks (Dagster, Temporal, Label Studio, CVAT, lakeFS, Qdrant, the legacy cache and Marquez). New evaluation code must not depend on them. Frozen scope is not runtime status: Temporal and the separate social Redis are running as of 2026-09-28; see `docs/VPS_RUNTIME.md`.

## VPS Infrastructure Fleet

Caudals operates across two production VPS nodes connected via Tailscale:

1. **`atlantic`** (formerly referred to as `caudals-1`):
   - **Provider / IP**: Hetzner, `168.119.49.95` (Tailscale `100.118.70.90`, user `caudals`).
   - **Role**: Primary application and platform host. Runs the public site (`caudals.com`), internal Ops app (`ops.caudals.com`), shared `caudals-postgres`, evaluation platform, MinIO, and internal Tailscale dashboards.
2. **`arctic`** (or `artic`):
   - **Provider / IP**: AWS, `51.102.90.206` (Tailscale `100.93.226.39`, user `caudals`).
   - **Role**: Dedicated outreach and growth host. Runs Postiz/Temporal (`caudals-social`), Growth/HyperFrames (`caudals-growth`), Umami, and the Warmbly suite (`caudals-warmbly`), serving `out.caudals.com`, `out-admin.caudals.com`, `out-track.caudals.com`, and `out-forms.caudals.com` with isolated databases and enrichment workers.

## Sibling Repository — Caudals Leads / Ops

`../leads` (github.com/Caudals/leads) is the satellite repo for the internal operations
engine: Caudals Ops (`ops.caudals.com`), Content Suite, social
publishing, the *The Data Gap* newsletter, Hermes strategic prospecting, and the blog
pipeline that publishes to this site. It runs on `atlantic` on the same `dokploy-network`,
with its own `caudals_leads` database inside the shared `caudals-postgres` service.
Since 2026-10-06 the private `growth-social` execution service runs on arctic,
connected to Ops through private Tailscale relays.

- This repo owns the platform: VPS nodes (`atlantic` and `arctic`), `caudals-postgres`, Docker secrets, Swarm
  stack conventions, Postiz, and the frozen legacy stacks.
- `../leads` owns the Ops schema and behaviour, and holds no platform contract.
- Start there at `../leads/AGENTS.md`; it indexes its own docs.
- Read it before changing shared infrastructure, the newsletter public archive,
  the blog content path, or anything that consumes `ops.caudals.com`.

## Read Order Before Non-Trivial Work

1. `AGENTS.md`
2. `docs/product-specs/overview.md`
3. `docs/index.md`
4. `docs/ARCHITECTURE.md`
5. `docs/DESIGN.md`, `docs/FRONTEND.md`
6. `docs/TOOLS.md`

## Source-of-Truth Files

- `docs/product-specs/overview.md`: canonical product brief. Read it first to understand what Caudals sells, to whom, and what is in scope.
- `docs/index.md`: documentation map and update ownership.
- `docs/ARCHITECTURE.md`: technical system contract, runtime model and deployed evaluation architecture.
- `docs/DESIGN.md`: design system and UI governance.
- `docs/FRONTEND.md`: frontend implementation contract.
- `docs/TOOLS.md`: operational tooling, setup commands and troubleshooting.

## Delivery Expectations

1. Follow the evaluation and custom-dataset direction in `docs/product-specs/overview.md`.
2. Implement requested work end-to-end when the scope is clear.
3. Preserve existing production behaviour unless the request explicitly changes it.
4. Use local checks and runtime inspection appropriate to the risk of the change.
5. Update only the docs directly affected by the change.

## Product Prioritization Heuristics

1. Prioritize paid pilot learning and delivery over speculative scope. The founder authorized evaluation stages A–E and they are deployed; the earlier three-manual-pilot prerequisite no longer blocks their maintenance or completion. Neither current prospecting experiment is a definitive ICP; the founder reports better results with España · Producto de IA than Caudals CyL v1.
2. Keep the public funnel fast, credible and easy to contact. Lead with evidence, never hype.
3. Build operator workflows (case authoring, grading, expert review, reporting) before customer self-service.
4. Keep every result and dataset item reproducible and traceable: item → source → author → reviewer → run → score.
5. Treat the freelance expert roster as core infrastructure: guidelines, gold items and review come before volume.
6. Favour what compounds: sector-generic cases, reusable rubrics, the published methodology.
7. Run polish passes after core behaviour is reliable.

## Tooling and Skills

- Read [docs/TOOLS.md](docs/TOOLS.md) for the verified CLI/MCP inventory, skill locations, authentication, command examples and host differences. Installed tools do not imply authenticated access; use command help and read-only status checks first.
- Postiz: use the `postiz:postiz` skill and `postiz` CLI for social integrations, drafts, media uploads and analytics at `postiz.caudals.com` on `arctic`. Set `POSTIZ_API_URL=https://postiz.caudals.com/api`; upload media before attaching it. Publishing or scheduling requires the user's authorization; preserve Ops content review gates.
- Warmbly: use the `warmbly-cli` skill and `warmbly` customer CLI for campaigns, contacts, mailboxes, inbox and CRM at `out.caudals.com` on `arctic`. Use `warmblyctl` only for explicitly scoped instance recovery/account administration; it accesses the database directly. Keep campaigns draft unless launch is authorized, and run preflight before an authorized start.
- Warmbly enrichment: use the `warmbly-apollo` and `warmbly-rocketreach` skills with their matching CLIs/MCPs. Repo guides live in `infra/warmbly/{apollo,rocketreach}/`. Paid calls require authorized scope, explicit spend and stable idempotency keys; imports preserve opt-outs and never activate campaigns.
- Cloudflare: the installed CLI is `cf` (alias `cloudflare`), with task discovery through `cf cli search` and request inspection through `cf schema`. Keep discovery queries anonymous. Inspect DNS/edge configuration first; obtain explicit authorization for DNS/mail, security policy and paid-resource changes.
- Tailscale, SSH and Docker/Swarm: private access to `atlantic` and `arctic`, service inspection and repository deployment scripts. `cf` on `atlantic` may require `~/.local/bin/cf`; do not assume local CLI installations or credentials exist on either VPS.
- PostgreSQL (`psql`, disposable containers) and the `caudals-evals` private runner: schema/RLS checks, migrations and approved customer-side evaluation execution. The retained `caudals` dataset-build CLI remains frozen.
- GitHub MCP and `gh`: issue/PR/review workflows and CI/deploy diagnostics. Browser tooling includes Chrome DevTools MCP, Playwright, unified computer use and Node REPL when exposed by the active session.
- Hermes: host/service diagnostics and strategic-prospecting operations owned by `../leads`; read its prospecting and operations docs before changing schedules. Installed agent CLIs do not authorize child sessions or delegation; the no-subagent rule below still applies.
- Artifact tooling: document/PDF/spreadsheet/presentation skills, connected Google Drive skills, image generation, Remotion, FFmpeg/ImageMagick, live Word MCP, Blender MCP and the installed Notion CLI (`ntn`) when the task needs them. Confirm session availability, credentials and scope before using external services.
- Terminal tooling: Node/npm, Python/`uv`, `rg`, `jq`, Git, `curl`, `dig` and OpenSSL for build, file, API, DNS and repository diagnostics. Keep credential values out of output.
- Stripe CLI/MCP: only for explicitly scoped historical billing work; Stripe checkout and marketplace billing are not current product surfaces. Disabled or retained MCP configurations do not establish live access.
- UI work must follow `docs/DESIGN.md` and the local `frontend-design` skill.

## Non-Negotiables

- Preserve strict separation between public pages, internal admin operations and authenticated direct-route surfaces.
- Preserve webhook consistency and idempotency; do not reintroduce removed payment flows as part of evaluation work.
- Preserve provenance, consent, PII redaction and auditability for every case, run, report and dataset item.
- Freelance experts see only the redacted material their task needs and work under confidentiality, data-processing and IP-assignment terms.
- Never build or run adversarial tests (prompt injection, jailbreaks, prompt extraction) against a system without its owner's written authorisation.
- Never describe Caudals as certifying AI systems or making anyone AI Act compliant; we produce evidence, not conformity assessments.
- Never use subagents: perform all research, inspection, file edits, and tool calls directly in your primary session; do not invoke subagent tools or spawn child sessions.
- Never leak secrets in code, command output, documentation or captured media.
- Avoid destructive operations unless explicitly required and documented in the user-facing response.

## Stop Conditions

Pause only when:

- required credentials/access are missing,
- conflicting requirements cannot be resolved from repo context,
- the next action is irreversible and high risk.
