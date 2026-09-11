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
- `docs/product-specs/evals.md`: how an evaluation is built, graded and delivered, and the quality rules for expert-built data.
- `docs/product-specs/go-to-market.md`: how customers are found and won, including the rules for probing third-party systems.

Current deployment scope is intentionally narrow:

- public landing page, contact form, meeting booking, blog, newsletter, team and legal pages,
- private Operator Console (`/admin`) and its sign-in (`/auth/*`).

There is no landing-mode flag. The pre-pivot marketplace surfaces (`/buyer`, `/supplier`, `/v1/*`, `/security`, `/pricing`, `/docs`, `/about`, `/careers`, `/catalogue`) and Stripe billing were deleted; do not reintroduce them.

## Frozen Scope

Maintain these so they keep working; do not extend or market them:

- non-text modalities (image, video, audio, geospatial, sensor),
- the legacy dataset-build Operator Console modules and CLI,
- legacy private stacks (Dagster, Temporal, Label Studio, CVAT, lakeFS, Qdrant, Redis, Marquez). New evaluation code must not depend on them.

## Sibling Repository — Caudals Leads

`../leads` (github.com/Caudals/leads) is the satellite repo for the internal B2B
Leads CRM: companies/contacts, cold-outreach sequences, AI prospecting intake,
social publishing, the *The Data Gap* newsletter, and the blog pipeline that
publishes to this site. It runs on the same Hetzner host (`caudals-1`) and the
same `dokploy-network`, with its own `caudals_leads` database inside the shared
`caudals-postgres` service, plus the private `growth-social` execution service.

- This repo owns the platform: VPS, `caudals-postgres`, Docker secrets, Swarm
  stack conventions, Postiz, and the frozen legacy stacks.
- `../leads` owns the CRM schema and behaviour, and holds no platform contract.
- Start there at `../leads/AGENTS.md`; it indexes its own docs.
- Read it before changing shared infrastructure, the newsletter public archive,
  the blog content path, or anything that consumes `leads.caudals.com`.

## Read Order Before Non-Trivial Work

1. `AGENTS.md`
2. `docs/product-specs/overview.md`
3. `docs/product-specs/evals.md` for evaluation and dataset work; `docs/product-specs/go-to-market.md` for marketing, content and outreach work
4. `docs/index.md`
5. `docs/ARCHITECTURE.md`
6. `docs/DESIGN.md`, `docs/FRONTEND.md`
7. `docs/TOOLS.md`

## Source-of-Truth Files

- `docs/product-specs/overview.md`: canonical product brief. Read it first to understand what Caudals sells, to whom, and what is in scope.
- `docs/product-specs/evals.md`: evaluation method, deliverable contract and expert-built data rules.
- `docs/product-specs/go-to-market.md`: acquisition playbook and rules of engagement.
- `docs/index.md`: documentation map and update ownership.
- `docs/ARCHITECTURE.md`: technical system contract, runtime model and planned evaluation architecture.
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

1. Sell before building: the first three pilots are delivered manually; do not build evaluation platform code ahead of that unless asked.
2. Keep the public funnel fast, credible and easy to contact. Lead with evidence, never hype.
3. Build operator workflows (case authoring, grading, expert review, reporting) before customer self-service.
4. Keep every result and dataset item reproducible and traceable: item → source → author → reviewer → run → score.
5. Treat the freelance expert roster as core infrastructure: guidelines, gold items and review come before volume.
6. Favour what compounds: sector-generic cases, reusable rubrics, the published methodology.
7. Run polish passes after core behaviour is reliable.

## Tooling and Skills

- PostgreSQL (`psql`, disposable containers): schema checks, migrations and runtime inspection — see `docs/TOOLS.md`.
- Stripe MCP/CLI: payment and webhook diagnostics when payment code is touched.
- GitHub MCP and `gh`: issue/PR workflows and CI triage.
- Browser/devtools tooling: UI inspection and interaction checks.
- Terminal tooling: build, lint, static analysis and repository diagnostics.
- UI work must follow `docs/DESIGN.md` and the local `frontend-design` skill.

## Non-Negotiables

- Preserve strict separation between public pages, internal admin operations and authenticated direct-route surfaces.
- Preserve payment/webhook consistency and idempotency when payment code is touched.
- Preserve provenance, consent, PII redaction and auditability for every case, run, report and dataset item.
- Freelance experts see only the redacted material their task needs and work under confidentiality, data-processing and IP-assignment terms.
- Never publish or expose a named company's evaluation results without its written consent.
- Never build or run adversarial tests (prompt injection, jailbreaks, prompt extraction) against a system without its owner's written authorisation.
- Never describe Caudals as certifying AI systems or making anyone AI Act compliant; we produce evidence, not conformity assessments.
- Never leak secrets in code, command output, documentation or captured media.
- Avoid destructive operations unless explicitly required and documented in the user-facing response.

## Stop Conditions

Pause only when:

- required credentials/access are missing,
- conflicting requirements cannot be resolved from repo context,
- the next action is irreversible and high risk.
