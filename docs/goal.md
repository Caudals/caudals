# Caudals blueprint implementation

Implement the Caudals platform end-to-end as specified in `docs/blueprints/caudals-platform-blueprint.md`. Phase 1 (Operator Console, Postgres + Better Auth migration) is shipped; resume at M2 and drive through to M3. Work autonomously, one slice at a time, until the whole blueprint is live in production.

## Mandatory Read Order (every iteration)

1. `AGENTS.md`
2. `docs/blueprints/caudals-platform-blueprint.md` — the canonical spec; all sections are load-bearing
3. `docs/product-specs/overview.md`
4. `docs/ARCHITECTURE.md`, `docs/DESIGN.md`, `docs/FRONTEND.md`, `docs/TOOLS.md`
5. `docs/index.md`
6. `PHASE_1_REPORT.md` and any prior `PHASE_*_REPORT.md` — known gaps feed the next slice
7. `docs/blueprints/deviations.md`

If you find a better choice than the blueprint specifies, deviate, ship it, and log briefly the deviation in `docs/blueprints/deviations.md`. Do not block to ask.

## Environment

You are inside the DigitalOcean VPS that hosts Caudals. Shell access to Docker, Dokploy, self-hosted Postgres, Spaces (S3), Tailscale, GitHub, Stripe sandbox, Resend. Treat the VPS as dev/integration. You may install MCPs, CLIs, toolchains, system packages, Docker images, DB extensions; pick current stable versions. You may spin up containers via Dokploy or `docker compose`, create databases, roles, schemas, migrations, modify any repo file, run builds, lint, typecheck, restart services.

## Top-Level Goal

Bring the blueprint to life. The platform is "done" when every section of the blueprint is implemented, observable in production, and exercised by either live operators, live suppliers, live buyers, or scheduled jobs.

## Sequencing

Follow the blueprint's roadmap §30. Treat each milestone as a goal of its own; finish it before starting the next. Within a milestone, sequence slices so the operations spine stays load-bearing first, then catalogue depth, then self-serve surfaces.

- **M2 — Catalogue & modalities** (§30 M2): pick this up first.
- **M3 — Self-service & commercial** (§30 M3).

<<<<<<< HEAD
Each slice maps to a §section. Wire it to real data, real schema, real auth, real RLS. No mocks past the slice boundary.
=======
- Stand up Postgres on the VPS via Dokploy with the extensions needed by §28 (vector search, partitioning, scheduled jobs, full-text, statistics).
- Re-implement RLS policies in plain Postgres so org-scoped tenancy from §28 holds without Supabase.
- Re-implement the canonical schema from §28 with ULID-prefixed text PKs.
- Migrate existing data: dump → transform → load; verify row counts and a sampled diff; preserve `created_at`/`updated_at`. Produce a written migration report at `docs/migrations/supabase-to-postgres.md`.
- Replace Supabase Storage usage with DO Spaces via the S3 SDK directly.
- Replace Supabase Realtime (if used) with `LISTEN`/`NOTIFY` plus a thin SSE gateway, or remove if unused.
>>>>>>> 83329242ba0f3dbb85122780a7362a5e5864926b

## What "Done" Means for a Slice

<<<<<<< HEAD
A slice is done when:
=======
- Adopt Better Auth with the Postgres adapter and an org/team plugin; scaffold SSO but keep it off until Phase 3.
- Sessions cookie-based, httpOnly, SameSite=Lax, rotating, refresh-on-use.
- TOTP and WebAuthn wired as optional operator hardening. Password-only Better Auth login is allowed for Phase 1 operators unless `OPERATOR_CONSOLE_REQUIRE_SECURITY_ENROLLMENT=true` is explicitly enabled later.
- Migrate existing accounts: map `auth.users` → `operator` + identity tables, preserve emails, force password reset on first login (email via Resend), preserve roles.
- Replace every Supabase auth call site with the Better Auth equivalent and delete the old auth helpers — no dual code paths.
- Wire the JIT-elevation hook for production DB access required by §25 (audit-logged, time-bounded).
>>>>>>> 83329242ba0f3dbb85122780a7362a5e5864926b

1. Server actions / tRPC routes with input validation are in place.
2. Queries respect RLS and the §28 schema; migrations are append-only with a rollback.
3. UI follows `docs/DESIGN.md` and reuses existing primitives.
4. State transitions emit `audit_event` per §23.
5. OpenTelemetry traces, Sentry errors and feature flags are wired.
6. The slice is reachable in the running deployment on the VPS, exercised once end-to-end.
7. Minimal tests cover the business-logic edge that would silently break in prod — nothing more.

## Acceptance Criteria — Platform done = all of these

1. Every blueprint section §01–§29 has a corresponding implementation reachable in the deployed product.
2. §30 milestones M2, M3 are each closed out with a short `PHASE_N_REPORT.md` at the repo root listing what shipped, deviations, and known gaps for the next phase.
3. §23 state machines for every entity (`buyer_opportunity`, `supplier_opportunity`, `build`, `run`, `label_batch`, `contract`, `delivery`, `dsar`, plus any added in later milestones) are persisted, validated server-side, and audited.
4. §17 license composition algebra runs live on every build planner and blocks non-composable license combinations.
5. §25 security posture is real: MFA on operator accounts, JIT elevation audited, Ed25519 signing keys generated and encrypted at rest, secrets never in code.
6. §26 observability is real: OTel → Tempo, logs → Loki, metrics → Prom (or the deviation you picked, logged).
7. §29 public REST surface `/v1/*` is live, versioned, rate-limited, and documented inline.
8. Buyer workspace (§20), supplier portal (§21) and public marketing/catalogue (§22, §15) are reachable for their respective audiences; AGENTS.md separation between public, admin, supplier and buyer surfaces is preserved.
9. Typecheck, lint, the minimal test suite and the Playwright smoke pass on CI; production build runs on the VPS via Dokploy at the existing hostnames.
10. AGENTS.md non-negotiables intact: payments idempotent, no secrets leaked, no destructive op without explicit user confirmation.
    
## Design Delegation

Follow `docs/DESIGN.md` exactly. For any non-trivial UI screen (build detail, lineage browser, command palette, scorecard view), produce a first pass yourself, then delegate a UX polish pass to Claude Code with the `frontend-design` skill:

claude --model claude-opus-4-7 --thinking-budget xhigh --skill frontend-design \
  "Polish; match docs/DESIGN.md; preserve all data + handlers; return only the diff"

<<<<<<< HEAD
=======
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

>>>>>>> 83329242ba0f3dbb85122780a7362a5e5864926b
## Working Discipline

- Plan before coding each slice: write the slice plan as the commit body of the first commit of that slice.
- Migrations are append-only; never edit a shipped migration. Generate a rollback for each.
- No silent fallbacks. If a license check, PII gate, RLS query or state-machine transition fails, fail loudly with the reason.
- Conventional-commit style; one commit per coherent slice; reference the §section it implements.
<<<<<<< HEAD
- If a tool / MCP / CLI is missing, install it, record it in one line in `docs/TOOLS.md`, continue.
- **Keep docs concise, brief, and short.** Do not spend time or tokens writing extensive documentation; one paragraph per change is plenty.
- **Keep tests and validations minimal and short.** Test only what would silently break production. Iterate fast.
- **Push directly to the deployment branch when a slice is finished. Do not open PRs.** Commits land straight; Dokploy redeploys.
- Use claude code with frontend-design skill for UI UX design. Make sure the dashboards are professional, polished, and verify the interface visually.
=======
- Run typecheck + lint + unit tests after every slice; do not move on with red CI.
- If a tool / MCP / CLI is missing, install it, record it in `docs/TOOLS.md`, continue.
- Keep docs concise, brief and short. Do not spend time and tokens writing extensive documentation.
- You can skip the 48 hours of db use requisite we had previously set and migrate directly. When migrated, delete all Supabase containers, images, instances etc to clear disk space.
>>>>>>> 83329242ba0f3dbb85122780a7362a5e5864926b

## Stop and Ask Only If

- A credential, secret or API key is required and not present in the VPS env or vault.
- A hardware, quota or billing limit blocks progress (GPU pool, Spaces quota, DO plan, etc).
- A non-reversible decision affects production data outside the current slice (e.g. dropping a tenant's volume, rotating signing keys in active deliveries).
- Two parts of the blueprint give conflicting instructions and the ambiguity is load-bearing for schema, auth or licensing.

Otherwise proceed autonomously. Do not stop for routine implementation choices, refactors, dependency installs or design polish.

<<<<<<< HEAD
## Out of Scope (until explicitly scheduled)

- Anything contradicting AGENTS.md non-negotiables.
- Stripe live keys, real money flow with external buyers until §25 / §32 controls are signed off.
- M4
- SOC 2 Type II audit work (planned for M4; build the controls, don't drive the audit itself).
- Cross-region delivery infrastructure until M4.
=======
## Out of Scope for This Goal

Buyer workspace, supplier portal, public catalogue, public `/v1` REST surface, real Dagster/Temporal pipeline workers, lakeFS, Iceberg / Lance, GPU pool, SOC 2 controls implementation, HF mirror, Stripe live keys, real DSAR propagation engine, marketing-site rework. These come in later `/goal` sessions and depend on the operator console being load-bearing first.
>>>>>>> 83329242ba0f3dbb85122780a7362a5e5864926b
