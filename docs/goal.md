# Caudals platform goal

## Objective

Implement, extend, verify, and deploy Caudals as a polished B2B AI dataset operations platform: public funnel, private operator console, buyer and supplier workspaces, API/security routes, data operations services, compliance controls, delivery flows, observability, and production deployment. The blueprint is the canonical target, but agents may add, remove, or reshape features when doing so makes the product more complete, functional, trustworthy, maintainable, or commercially useful. Log material deviations in `docs/blueprints/deviations.md`.

Caudals is done when every load-bearing blueprint section is implemented or explicitly deferred with a documented reason, the platform can run representative dataset workflows end-to-end, services are observable and operable from the console or documented CLIs, and production passes the completion gates below.

## Required context

Read in this order:

1. `AGENTS.md`
2. `docs/blueprints/caudals-platform-blueprint.md`
3. `docs/product-specs/overview.md`
4. `docs/ARCHITECTURE.md`
5. `docs/DESIGN.md`
6. `docs/FRONTEND.md`
7. `docs/TOOLS.md`
8. `docs/index.md`
9. `docs/product-specs/index.md`
10. `PHASE_1_REPORT.md`, `PHASE_2_REPORT.md`, `PHASE_3_REPORT.md`, and any newer `PHASE_*_REPORT.md`
11. `docs/blueprints/deviations.md`

Use the current code, database migrations, scripts, deployed service state, and phase reports as evidence. Do not rely on stale assumptions when a command or readback is cheap.

## Product contract

Preserve the current B2B marketplace and managed-services direction:

- Public production surface: landing page, contact intake, blog, required public APIs, auth routes, and `/admin`.
- Private operator surface: `/admin` is the operations control room and must remain functional, dense, audited, and professionally organized.
- Published route surfaces: buyer workspace, supplier portal, API routes, and the security page should be implemented and accessible by direct route even when production is in landing mode, with their normal auth, authorization, RLS, rate-limit, and audit controls.
- Landing-page visibility: landing mode only hides entry points from the public landing experience. Do not add landing-page buttons, nav links, hero CTAs, marketing cards, sitemap promotion, or other public discovery paths for buyer, supplier, API, or security routes unless explicitly requested.
- Catalogue datasets are out of scope for this goal. Do not implement public catalogue datasets, catalogue browsing, sample-preview catalogue flows, marketplace listing publication, or catalogue purchase flows in this blueprint implementation.
- Marketplace browse, buyer self-service purchasing, supplier self-service publishing, and broad marketplace commerce stay deferred until a future catalogue goal.
- Every workflow must preserve provenance, rights, consent, privacy, PII handling, auditability, delivery evidence, and payment/webhook idempotency where applicable.

## Production visibility

Production runs with `LANDING_MODE=true` and `NEXT_PUBLIC_LANDING_MODE=true`.

- Public navigation must expose only the approved landing-mode Contact/Blog links in the active locale.
- Public catalogue links, auth buttons, marketplace CTAs, buyer workspace links, supplier portal links, `/security`, and `/v1/*` links must stay visually hidden from the landing page and public marketing navigation in production landing mode.
- `/admin` must remain reachable through the normal auth route for real operators.
- Buyer, supplier, API, and security routes should remain route-accessible in landing mode when requested directly, subject to their normal auth and authorization model.
- Catalogue routes and catalogue dataset surfaces remain unimplemented or blocked until a future goal explicitly covers them.

## Execution loop

Work in checkpoints, not loose task lists:

1. Inspect current state: repo diff, phase reports, relevant docs, schema, runtime config, deployed service state, and failing gates.
2. Pick the next smallest checkpoint that advances the blueprint toward the stopping condition.
3. Implement the checkpoint end-to-end across schema, code, UI, services, tests, docs, deployment, and operator usability as needed.
4. Validate only the smallest behavior that could silently break production. Prefer targeted checks over broad suites and keep iteration fast.
5. Visually inspect changed UI (make screenshots and look at them) at the level needed for the risk of the change. Fix layout, alignment, overflow, empty/loading/error states, and console errors before calling a UI checkpoint done.
6. Deploy finished slices according to the deployment rules below.
7. Record a short progress entry in the newest `PHASE_*_REPORT.md` or create the next numbered report when the prior phase is complete.
8. Continue with the next checkpoint unless a stop condition applies.

Status updates during a `/goal` run should name the current checkpoint, what was verified, what remains, and whether anything is blocked.

## Implementation checkpoints

Use this order unless runtime evidence shows a better next slice.

1. Platform audit and gap map: compare blueprint sections, phase reports, current migrations, routes, scripts, services, and the existing platform completion evidence.
2. Operations services: ensure Postgres, object storage, Redis/cache, Dagster, Temporal, Label Studio, CVAT, Qdrant, Marquez/OpenLineage, Sentry, OpenTelemetry, Prometheus, Loki, Tempo, Grafana, Stripe sandbox, Resend, and delivery signing are either deployed/probed or explicitly deferred. All the existing operations services should be accesible through the console.
3. Dataset pipeline: make G-1 through G-7 executable from intake through profiling, cleaning, privacy/PII, enrichment, labeling/curation, QA, packaging, release documentation, lineage, and delivery.
4. Operator console: expose all operational workflows in `/admin`, including state machines, CRUD, bulk actions, command palette, saved views, service health, build controls, cost envelopes, escalations, audit overlays, notes, signing keys, and route-safe settings.
5. Buyer and supplier workspaces: keep them unlinked from the landing page in landing mode, but make direct-route authenticated review flows useful for deliveries, subscriptions, integrations, billing, manifests, scorecards, supplier asset declaration, build participation, revenue share, and Stripe Connect status.
6. Public funnel and security readiness: keep landing-page navigation narrow while improving contact/buyer-brief intake, blog, security review, private offers where they support operator workflows, SEO metadata, analytics, and abuse controls.
7. API and integrations: harden `/v1/*`, tRPC workspaces, webhooks, signed delivery URLs, HMAC/Ed25519 signatures, rate limits, replay protection, and external buyer integration examples.
8. Polish and production readiness: run completion gates, fix defects, visually verify dashboards, confirm route visibility, ensure docs are concise, deploy, and record evidence.

## UI and UX rules

Follow `docs/DESIGN.md` and `docs/FRONTEND.md` exactly.

- Build the functional first pass yourself using the `frontend-design` skill.
- For UI screens such as build detail, lineage browser, command palette, scorecards, buyer workspace, supplier portal, or service dashboards, use Claude Code with the `frontend-design` skill when available.
- If Claude Code is unavailable, blocked by auth/quota, or returns no usable diff, do a manual design-system review, document the fallback in the phase report, and continue.
- Every changed UI must be visually inspected enough to catch obvious design regressions. Check the changed surface with realistic data, relevant responsive widths, loading/empty/error states when touched, keyboard focus when interaction changed, no horizontal overflow, no misaligned controls, no clipped text, and no browser console errors.
- Admin, buyer, and supplier screens should be compact, professional, and operational. Avoid marketing-style hero layouts inside dashboards.

## Validation gates

Keep validation minimal and fast. Do not spend most of a `/goal` run on exhaustive checks. Use the existing repo scripts and browser/service probes selectively, based on what changed and what could silently break production.

For each checkpoint:

- Run targeted unit or integration coverage only for the business rule, state transition, RLS path, route visibility rule, service probe, or UI interaction touched.
- Run type, lint, build, i18n, browser, or service checks only when the checkpoint changed the corresponding contract.
- Prefer one focused browser inspection over broad visual sweeps unless a shared layout, navigation, auth shell, or dashboard primitive changed.
- Before deployment, run the smallest smoke path that proves production will boot and the changed route or service works.
- Record skipped checks only when the skipped check would normally be expected for the changed surface.
- In general, keep testing minimal and iterate fast.

## Deployment rules

- Do not create PRs or extra branches for goal slices unless the user explicitly changes this policy.
- When a slice is complete, commit and push directly to the deployment branch/main according to the current repository deployment setup.
- Prefer GitHub Actions and Docker Hub for image builds, then let Dokploy pull and deploy. Avoid heavy local Docker builds on the VPS unless necessary.
- Be careful with VPS CPU, RAM, disk, tmux sessions, and active Codex `/goal` sessions. Do not kill long-running Codex/tmux sessions or production services as a cleanup shortcut.
- For local builds on the VPS, use heap limits and inspect disk/process state first. Prune only disposable build cache or stopped containers when safe.
- After deployment, verify route gates, service convergence, production smoke tests, and any changed authenticated flows.

## Secrets and notifications

Never commit secrets, tokens, private keys, webhook URLs, DSNs, database URLs, customer data, or unredacted financial data to code, docs, logs, screenshots, or user-facing output.

If human action is required, notify the user in the Codex thread. Setup and use the Telegram bot with the following token: 8983299591:AAEIEaR9fHodZs4WvzLNjcf8ayF4AEaOkpU.

## Working discipline

- No silent fallbacks. If a license check, PII gate, RLS query, state transition, delivery signature, payment webhook, or service probe fails, fail loudly with the reason.
- If a tool, MCP, CLI, package, system dependency, or Docker image is missing, install it when safe, add one concise line to `docs/TOOLS.md` only if it becomes part of the recurring workflow, and continue.
- Keep documentation updates short. Update only docs directly affected by the change.
- Keep tests focused while iterating. Add or update tests only for behavior that could silently break production.
- Use structured parsers, typed APIs, migrations, and existing helpers instead of ad hoc string manipulation.
- Respect existing code patterns and do not revive removed pre-pivot requester/contributor/dashboard/browse surfaces.
- Preserve password-only production operator access. TOTP and passkeys are optional Better Auth hardening, not release gates.

## Stop conditions

Pause only when:

- A required credential, secret, account access, or external approval is missing and cannot be discovered from the VPS environment or configured vault.
- A hardware, quota, billing, or infrastructure limit blocks safe progress.
- The next action is irreversible and high risk for production data, keys, buyer/supplier records, billing, or active delivery artifacts.
- Blueprint/docs conflict in a way that changes schema, auth, rights, licensing, or route exposure materially.
- A deployment, migration, or cleanup cannot be rolled back with the current evidence.

When stopped, record the checkpoint, exact blocker, evidence gathered, safest next action, and any command that should be run after human action.

## Completion condition

The goal is complete only when all of the following are true:

- Blueprint sections 01-34 are implemented, superseded by a logged deviation, or explicitly deferred with product-owner rationale.
- Public landing-mode production keeps the landing page visually narrow while allowing direct-route access to buyer, supplier, API, security, auth, and admin surfaces according to their normal access controls.
- `/admin` can operate the platform: records, state machines, builds, services, pipeline gates, audit, compliance, delivery, cost, and escalation workflows are functional.
- Buyer, supplier, API, and security surfaces are functional, accessible by direct route, and hidden only from landing-page navigation and marketing entry points.
- Catalogue datasets and public catalogue browsing are not part of this goal and are not required for completion.
- A representative dataset build can be planned, run or dry-run through the pipeline, produce lineage and QA/release documentation, package artifacts, and record delivery/acceptance evidence.
- Required services are deployed or explicitly deferred, private by default, probed, observable, and surfaced to operators.
- Minimal targeted validation, visual verification for changed UI, route probes for changed route visibility, and relevant service probes pass or have documented external-only waivers.
- Production is deployed, Dokploy has converged, and deployed smokes pass.
- The newest phase report records shipped work, validation evidence, production image/service state, known gaps, and deviations.
