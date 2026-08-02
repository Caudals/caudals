# Caudals Agent Instructions

## Mission

Agents in this repository must help move Caudals toward a polished, market-ready B2B AI data product with minimal supervision.

## Product Context

Caudals is a B2B marketplace and managed services layer for AI training datasets.

The product connects:

- companies that want to monetize proprietary or hard-to-access data,
- companies that want to buy ML-ready datasets to train or evaluate AI models,
- Caudals operators who source, license, preprocess, clean, curate, label, package, and publish datasets.

Company data intake, dataset build operations, the internal admin dashboard, and route-accessible buyer/supplier/API/security surfaces are the non-public workflow surfaces to preserve or extend in the near term.

Current deployment scope is intentionally narrow:

- public landing page,
- public contact form,
- public blog,
- private/internal admin dashboard,
- direct-route buyer workspace, supplier portal, API, and security surfaces when protected by their normal auth, authorization, RLS, rate-limit, and audit controls.

`LANDING_MODE=true` is a landing-page visibility rule, not a route-publication ban. Buyer, supplier, API, and security routes may be published and accessible by direct URL in landing mode, but the landing page must not expose buttons, nav links, hero CTAs, marketing cards, sitemap promotion, or other public discovery paths to those routes unless explicitly requested.

Marketplace browse, catalogue datasets, catalogue purchase flows, and broad marketplace commerce remain deferred until a future catalogue goal.

## Sibling Repository — Caudals Leads

`../leads` (github.com/Caudals/leads) is the satellite repo for the internal B2B
Leads CRM: companies/contacts, cold-outreach sequences, AI prospecting intake,
social publishing, the *The Data Gap* newsletter, and the blog pipeline that
commits into this repo. It runs on the same Hetzner host (`caudals-1`) and the
same `dokploy-network`, with its own `caudals_leads` database inside the shared
`caudals-postgres` service, plus the private `growth-social` execution service.

- This repo owns the platform: VPS, `caudals-postgres`, Docker secrets, Swarm
  stack conventions, Postiz, Temporal, Dagster.
- `../leads` owns the CRM schema and behaviour, and holds no platform contract.
- Start there at `../leads/AGENTS.md`; it indexes its own docs.
- Read it before changing shared infrastructure, the newsletter public archive,
  the blog content path, or anything that consumes `leads.caudals.com`.

## Read Order Before Non-Trivial Work

1. `AGENTS.md`
2. `docs/product-specs/overview.md`
3. `docs/index.md`
4. `docs/ARCHITECTURE.md`
5. `docs/DESIGN.md`, `docs/FRONTEND.md`
6. `docs/product-specs/index.md`
7. `docs/TOOLS.md`

## Source-of-Truth Files

- `docs/product-specs/overview.md`: portable product brief and startup context. AI agents should read this first to understand how Caudals works, who it serves, and what product surfaces are in scope.
- `docs/index.md`: documentation map and update ownership.
- `docs/ARCHITECTURE.md`: technical system contract and deployment/runtime model.
- `docs/DESIGN.md`: design system and UI governance.
- `docs/FRONTEND.md`: frontend implementation contract.
- `docs/TOOLS.md`: operational tooling, setup commands, and troubleshooting.

## Delivery Expectations

1. Prefer the current B2B marketplace and managed-services direction from `docs/product-specs/overview.md`.
2. Implement requested work end-to-end when the scope is clear.
3. Preserve existing production behavior unless the request explicitly changes it.
4. Use local checks and runtime inspection appropriate to the risk of the change.
5. Update only the docs that are directly affected by the change.

## Product Prioritization Heuristics

1. Keep the public funnel fast, credible, and easy to contact.
2. Build admin/operator workflows before exposing marketplace self-service.
3. De-risk data rights, provenance, PII handling, licensing, and buyer trust early.
4. Prioritize supplier onboarding and buyer demand capture that can produce sellable datasets.
5. Run polish passes after core operational behavior is reliable.

## Tooling and Skills

- Supabase MCP/CLI: schema checks, migrations, and runtime data inspection.
- Stripe MCP/CLI: payment and webhook diagnostics when payment code is touched.
- GitHub MCP and `gh`: issue/PR workflows and CI triage.
- Browser/devtools tooling: UI inspection and interaction checks.
- Terminal tooling: build, lint, static analysis, and repository diagnostics.
- UI work must follow `docs/DESIGN.md` and the local `frontend-design` skill.

## Non-Negotiables

- Preserve strict separation between public pages, internal admin operations, future supplier intake, and future buyer access.
- Preserve payment/webhook consistency and idempotency when payment code is touched.
- Preserve dataset provenance, licensing, consent, PII redaction, and auditability.
- Never leak secrets in code, command output, documentation, or captured media.
- Avoid destructive operations unless explicitly required and documented in the user-facing response.

## Stop Conditions

Pause only when:

- required credentials/access are missing,
- conflicting requirements cannot be resolved from repo context,
- the next action is irreversible and high risk.
