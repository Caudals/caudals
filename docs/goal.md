Build a production-grade Operator Console end-to-end on this VPS, matching §19 of the platform blueprint and meeting the M1 milestone in §30. Subsequent phases (pipeline workers, supplier portal, buyer workspace, catalogue, public REST) will be assigned in later `/goal` sessions — do not start them.

## Mandatory Read Order (every iteration)

1. `AGENTS.md`
2. `docs/blueprints/caudals-platform-blueprint.md` — §03, §04, §05, §17, §19, §23, §25, §28, §29, §30 are load-bearing for this phase
3. `docs/product-specs/overview.md`
4. `docs/ARCHITECTURE.md`, `docs/DESIGN.md`, `docs/FRONTEND.md`, `docs/TOOLS.md`
5. `docs/index.md`

If you find a better choice than the blueprint specifies, you may deviate and improve the implementation.

## Environment

You are running inside the DigitalOcean VPS that already hosts Caudals. You have shell access to Docker, Dokploy, the existing Postgres-capable host, Spaces (S3), Tailscale, GitHub, the Stripe sandbox, and Resend. Treat the VPS as your dev/integration environment for this phase.

### You may

- Install MCP servers, CLIs, language toolchains, system packages, Docker images, DB extensions — pick versions yourself; default to current stable.
- Spin up containers/services via Dokploy or `docker compose`.
- Create new databases, roles, schemas, migrations.
- Modify repo files, add tests, run builds, run lint, run typecheck, restart services.

## Hard Migrations (must complete inside Phase 1)

These are one-time platform changes that retire pre-pivot infrastructure. The blueprint must reflect the new state when you are done (see *Blueprint Update* below).

### M-A · Replace Supabase with self-hosted PostgreSQL

- Stand up Postgres on the VPS via Dokploy with the extensions needed by §28 (vector search, partitioning, scheduled jobs, full-text, statistics).
- Re-implement RLS policies in plain Postgres so org-scoped tenancy from §28 holds without Supabase.
- Re-implement the canonical schema from §28 with ULID-prefixed text PKs.
- Migrate existing data: dump → transform → load; verify row counts and a sampled diff; preserve `created_at`/`updated_at`. Produce a written migration report at `docs/migrations/supabase-to-postgres.md`.
- Replace Supabase Storage usage with DO Spaces via the S3 SDK directly.
- Replace Supabase Realtime (if used) with `LISTEN`/`NOTIFY` plus a thin SSE gateway, or remove if unused.

### M-B · Replace Supabase Auth with Better Auth

- Adopt Better Auth with the Postgres adapter and an org/team plugin; scaffold SSO but keep it off until Phase 3.
- Sessions cookie-based, httpOnly, SameSite=Lax, rotating, refresh-on-use.
- TOTP and WebAuthn wired as optional operator hardening. Password-only Better Auth login is allowed for Phase 1 operators unless `OPERATOR_CONSOLE_REQUIRE_SECURITY_ENROLLMENT=true` is explicitly enabled later.
- Migrate existing accounts: map `auth.users` → `operator` + identity tables, preserve emails, force password reset on first login (email via Resend), preserve roles.
- Replace every Supabase auth call site with the Better Auth equivalent and delete the old auth helpers — no dual code paths.
- Wire the JIT-elevation hook for production DB access required by §25 (audit-logged, time-bounded).

### Blueprint update (part of this goal)

Update `docs/blueprints/caudals-platform-blueprint.md` so that all references to Supabase Auth and Supabase-as-OLTP are replaced with self-hosted Postgres + Better Auth. Touch §05 (stack), §25 (identity & access), §28 (schema preamble) and any other section that mentions `supabase`. Bump the document revision in §00 with a one-line changelog. Do not rewrite blueprint content beyond what the migration requires.

## Phase 1 Scope — Operator Console only

Build §19 in full. Each module is "done" when it has: server actions / tRPC routes with input validation, RLS-correct queries, optimistic UI, unit tests for business logic, and a Playwright smoke test.

### Build order

1. Pipeline / Home triage dashboard
2. Leads & Opportunities
3. Suppliers (org, contacts, contracts, asset registry, license-clause vault)
4. Buyers (org, contacts, briefs, deliveries placeholder)
5. Builds (with the §19 build-detail screen as the reference UI; gates G-1..G-7 visualised; license composition from §17 shown live in the planner)
6. Datasets (read OpenLineage events from a Marquez-shaped table; full lineage backend lands in Phase 2)
7. Quality
8. Privacy & Rights
9. Catalogue & Offers (operator-managed only; no public exposure yet)
10. Commercials (Stripe Connect in test mode)
11. Operations (job queue, cost ledger, alerts)
12. Audit
13. Settings (roles, integrations, signing keys with Ed25519 generation, encrypted-at-rest)

### Foundations

- Next.js App Router, React, TypeScript strict; Tailwind + the existing design tokens; shadcn/Radix primitives.
- Server Actions for the operator console; scaffold tRPC for future buyer/supplier surfaces.
- One typed DB client.

### Power-user behaviours from §19

Command palette (⌘K), saved views, bulk actions with row-count confirmation, inline editing with optimistic UI and conflict detection, keyboard-first grid navigation, audit overlays inline on every record.

### Cross-cutting

OpenTelemetry to stdout for now (full Loki/Tempo/Prom can land in Phase 2 if not already up). Sentry for errors. Feature flags via env-driven gate. The existing `en` + `es` translation pipeline must keep working — do not regress translations.

## Reuse Policy for Pre-Pivot Code

The repo contains UI/dashboards from previous startup iterations. For each module, route or component:

- **Keep** if it serves a B2B operator use case in §19 *or* is a primitive used by the foundations (forms, tables, modals, design tokens, layout shell).
- **Adapt** if it is structurally close to a target module — port it onto the new schema and Better Auth; do not leave dual code paths.
- **Delete** if it served the pre-pivot product (consumer marketplace, supplier self-serve, buyer self-serve, end-user payments, etc.). Delete decisively — no `// removed` comments, no `_deprecated` shadows, no re-exports for nothing. Run typecheck + build + tests after each removal.

One commit per module deletion so the change is reviewable.

## Design Delegation

Follow `docs/DESIGN.md` exactly. For any non-trivial UI screen (build detail, lineage browser, command palette, scorecard view), produce a first pass yourself, then delegate a UX polish pass to Claude Code with the `frontend-design` skill:

claude --model claude-opus-4-7 --thinking-budget xhigh --skill frontend-design \
  "Polish; match docs/DESIGN.md; preserve all data + handlers; return only the diff"

Read the returned diff before applying it. Do not delegate trivial styling.

## Acceptance Criteria — Phase 1 done = all of these

1. Postgres is the only OLTP. Supabase containers/images/volumes are gone from the VPS; `@supabase/*` is absent from `package.json`.
2. Better Auth is the only auth. All operator accounts log in via the new flow with password-only access allowed; optional MFA/passkey setup, sessions, password reset and JIT elevation work end-to-end.
3. The console renders all 13 §19 modules wired to real (not mocked) data on the new schema, with RLS enforced.
4. The §23 state machines for `buyer_opportunity`, `supplier_opportunity`, `build`, `run`, `label_batch`, `contract`, `delivery`, `dsar` are persisted, validated server-side and emit `audit_event` on every transition.
5. Five concurrent demo builds progress through G-1..G-7 with seed data and full audit trail (the §30 M1 north-star milestone, simulated).
6. Typecheck, lint, unit tests and Playwright smoke pass in CI; production build runs on the VPS via Dokploy at the existing internal hostname.
7. AGENTS.md non-negotiables are intact: only public + admin surfaces are reachable, no secrets leaked, no destructive op happened without explicit confirmation, payments idempotent.
8. Docs updated, but still brief and concise: `docs/ARCHITECTURE.md`, `docs/TOOLS.md`, `docs/blueprints/caudals-platform-blueprint.md` (Supabase → Postgres + Better Auth, revision bumped), `docs/migrations/supabase-to-postgres.md` (new), `docs/blueprints/deviations.md` (if any deviation taken).
9. A `PHASE_1_REPORT.md` at the repo root summarises what shipped, deviations, known gaps to feed Phase 2.

## Working Discipline

- Plan before coding each slice: write the slice plan into the PR description before the first commit of that slice.
- Migrations are append-only; never edit a shipped migration. Generate a rollback for each.
- No silent fallbacks. If a license check, PII gate or RLS query fails, fail loudly with the reason.
- Conventional-commit style; one commit per coherent slice; reference the §section it implements.
- Run typecheck + lint + unit tests after every slice; do not move on with red CI.
- If a tool / MCP / CLI is missing, install it, record it in `docs/TOOLS.md`, continue.
- Keep docs concise, brief and short. Do not spend time and tokens writing extensive documentation.
- You can skip the 48 hours of db use requisite we had previously set and migrate directly. When migrated, delete all Supabase containers, images, instances etc to clear disk space.

## Stop and Ask Only If

- A credential, secret or API key is required and not present in the VPS env or vault.
- A hardware, quota or billing limit blocks progress (GPU, Spaces quota, DO plan, Stripe live keys, Resend domain verification).
- A non-reversible decision affects production data outside this phase (e.g. final deletion of Supabase volumes — confirm before destroying the last backup).
- Two parts of the blueprint give conflicting instructions and the ambiguity is load-bearing for the schema or auth model.

Otherwise proceed autonomously. Do not stop for routine implementation choices, refactors, dependency installs or design polish. Log judgement calls in `PHASE_1_REPORT.md` instead of asking.

## Out of Scope for This Goal

Buyer workspace, supplier portal, public catalogue, public `/v1` REST surface, real Dagster/Temporal pipeline workers, lakeFS, Iceberg / Lance, GPU pool, SOC 2 controls implementation, HF mirror, Stripe live keys, real DSAR propagation engine, marketing-site rework. These come in later `/goal` sessions and depend on the operator console being load-bearing first.
