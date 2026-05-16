# Caudals platform implementation

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

## Production Deployment Visibility (LANDING_MODE)

Production runs with `LANDING_MODE=true` (and `NEXT_PUBLIC_LANDING_MODE=true`). The only publicly reachable surfaces in production are:

- the landing page (`/`),
- the contact form (`/contact`),
- the blog (`/blog` and `/blog/*`),
- the internal admin/auth surfaces (`/admin`, `/auth/*`, `/api/auth/*`),
- the minimum public API needed by the public surfaces (`/api/analytics/track`, `/api/contact`, `/api/waitlist`).

The public top navbar in production MUST contain exactly **Contacto** and **Blog** — nothing else. This is enforced by `landingModePublicNavigationLinks` in `lib/landing-mode.ts` and the conditional render in `components/ui/header.tsx`.

Every other surface — buyer workspace (§20), supplier portal (§21), public catalogue (§22, §15), security review page, pricing, trust, docs, the public `/v1` REST surface (§29), self-serve auth flows, marketplace browse, payments UI, etc. — must still be implemented end-to-end per the blueprint, but **must stay hidden in production until each is explicitly cleared for public exposure**. Implementation is not gated by visibility; visibility is gated separately.

When you add a new public-facing surface:

1. Build it end-to-end per the blueprint as if it were going live (real data, real schema, real auth, real RLS, real audit, real tests).
2. Do **not** add its route to `LANDING_MODE_ALLOWED_PAGE_PATHS`/`LANDING_MODE_ALLOWED_PAGE_PREFIXES` (or the private equivalents) in `lib/landing-mode.ts`. The middleware must continue to 404/redirect it when `LANDING_MODE=true`.
3. Do **not** add it to `landingModePublicNavigationLinks` or any other public nav surface.
4. Do **not** relax the landing-mode gate, the middleware, or the navbar conditional as a shortcut to "preview" the feature.
5. Verify the surface is reachable with `LANDING_MODE=false` (local/dev/staging) and unreachable + invisible with `LANDING_MODE=true` (production).
6. Update `e2e/public-routes.spec.ts`: add the new route to the `landingModeEnabled` `blockedRoutes` list so we catch any regression that re-exposes it.

A feature can only be unhidden by an explicit, separate request that names the surface and confirms its readiness. Until then, it ships behind the gate.

## Sequencing

Follow the blueprint's roadmap §30. Treat each milestone as a goal of its own; finish it before starting the next. Within a milestone, sequence slices so the operations spine stays load-bearing first, then catalogue depth, then self-serve surfaces.

- **M2 — Catalogue & modalities** (§30 M2): pick this up first.
- **M3 — Self-service & commercial** (§30 M3).

Each slice maps to a §section. Wire it to real data, real schema, real auth, real RLS. No mocks past the slice boundary.

## What "Done" Means for a Slice

A slice is done when:

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

## Working Discipline

- Plan before coding each slice: write the slice plan as the commit body of the first commit of that slice.
- Migrations are append-only; never edit a shipped migration. Generate a rollback for each.
- No silent fallbacks. If a license check, PII gate, RLS query or state-machine transition fails, fail loudly with the reason.
- Conventional-commit style; one commit per coherent slice; reference the §section it implements.
- If a tool / MCP / CLI is missing, install it, record it in one line in `docs/TOOLS.md`, continue.
- **Keep docs concise, brief, and short.** Do not spend time or tokens writing extensive documentation; one paragraph per change is plenty.
- **Keep tests and validations minimal and short.** Test only what would silently break production. Iterate fast.
- **Push directly to the deployment branch when a slice is finished. Do not open PRs.** Commits land straight; Dokploy redeploys.
- Use claude code with frontend-design skill for UI UX design. Make sure the dashboards are professional, polished, and verify the interface visually.
- Inspect visually the dashboards/consoles once you build them. Make sure every page has a professional UI UX and there are no design bugs. Make sure the design is correct, the elements are not misaligned on the page, and the dashboards are generally user-friendly.
- **Keep the /catalog route and top nav bar element hidden** (ignore the blueprint). Develop all the logic for the catalog, but keep it hidden in the top menu bar of the page. Remember that LANDING_MODE=true in the deployment.

## Stop and Ask Only If

- A credential, secret or API key is required and not present in the VPS env or vault.
- A hardware, quota or billing limit blocks progress (GPU pool, Spaces quota, DO plan, etc).
- A non-reversible decision affects production data outside the current slice (e.g. dropping a tenant's volume, rotating signing keys in active deliveries).
- Two parts of the blueprint give conflicting instructions and the ambiguity is load-bearing for schema, auth or licensing.

Otherwise proceed autonomously. Do not stop for routine implementation choices, refactors, dependency installs or design polish.

## Out of Scope (until explicitly scheduled)

- Anything contradicting AGENTS.md non-negotiables.
- Stripe live keys, real money flow with external buyers until §25 / §32 controls are signed off.
- M4
- SOC 2 Type II audit work (planned for M4; build the controls, don't drive the audit itself).
- Cross-region delivery infrastructure until M4.
