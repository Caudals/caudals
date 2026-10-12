# Launch build progress (spec v2)

The founder approved `docs/product-specs/spec-v2.md` on 2026-10-11. The latest instruction (2026-10-12) is to implement every phase, deploy after each phase, **use no subagents**, and resume after usage-limit resets. Continue packages serially, preserving existing worktrees. Follow `docs/launch/AGENT-BRIEF.md` except its superseded parallel-agent and attribution instructions. This file is the source of truth for resuming.

## 1. How to resume

1. Read this file, then `git log --oneline -15` and `git worktree list` in `/home/caudals/caudals`.
2. `scripts/launch/merge-lock.sh status`. A lock held by a package whose agent is no longer running is released with `release <owner>` after you check that package's state.
3. For each package marked **in progress**: if `.worktrees/launch-L-xx` exists, inspect and resume it in the current agent; if it merged but the handoff is missing, finish verification and the handoff. Do not spawn agents.
4. Continue the next package whose dependencies have landed (§2), one at a time.

## 2. Packages

Status: `todo` · `in progress` · `merged` (on `main`, deploy pending or verifying) · `done` (deployed, verified, handoff written) · `blocked` (reason in notes).

| Phase | ID | Title | Depends on | Migration | Status | Commit | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | L-01 | Trust and legal pages, terms acceptance | — | 081 `evals_terms_acceptance` | in progress | | |
| 1 | L-02 | Funnel events and growth dashboard v1 | — | 082 `analytics_event_dimensions` (if needed) | todo | | |
| 1 | L-03 | Demo queue, capacity and fallback model | — | 083 `demo_queue` | in progress | | |
| 1 | L-08 | Observability, alerting and admin MFA | — | — | todo | | |
| 1 | L-09 | Billing core: credit ledger | — | 084 `billing_core` | done | 35b462a | App, migration and workers verified; seven accounts, zero drift. Billing off/shadow. Worker CI disabled; recovery deployment documented in L-09.md. |
| 2 | L-04 | Front door: demo linked, indexed, CTAs | L-01, L-02, L-03 | — | todo | | |
| 2 | L-05 | Direct work-email sign-up | L-01 | 085 `evals_signup_domains` | todo | | |
| 2 | L-06 | First-run onboarding and activation | L-02 | 086 `evals_onboarding` | todo | | |
| 2 | L-07 | Branded EN/ES emails and lifecycle sequence | L-02 (L-06 soft) | 087 `evals_lifecycle_email` | todo | | |
| 2 | L-10 | Price book, model guard and estimator | L-09 | 088 `billing_price_book` | todo | | |
| 2 | L-33 | Example evaluation and public sample report | L-02 | — | todo | | |
| 3 | L-11 | Engine integration: holds, captures, refunds | L-09, L-10 | 089 `billing_engine_hooks` | todo | | |
| 3 | L-21 | Prospect snapshot and ops growth v2 | L-02 | 090 `evals_prospect_snapshots` | todo | | |
| 3 | L-12 | Stripe top-ups, auto-recharge and webhooks | L-09, L-01 | 091 `billing_payments` | todo | | |
| 3 | L-13 | Invoicing and IVA | L-12 | 092 `billing_invoices` | todo | | |
| 3 | L-14 | Plans and limits v2, upgrade moments | L-09, L-12 | 093 `evals_plans_v2` | todo | | |
| 4 | L-15 | Billing and usage screens, run estimate dialog | L-10, L-11, L-12, L-14 | — | todo | | |
| 4 | L-16 | Ops billing console and reconciliation | L-09, L-10, L-12, L-13 | 094 `billing_approvals` | todo | | |
| 4 | L-17 | Report v2 and share page | L-02, L-04 | — | todo | | |
| 5 | L-29 | AI-disclosure check (Art. 50 evidence) | L-03 | — | todo | | |
| 5 | L-30 | Public site refresh, DPA acceptance UI | L-01, L-04 | — | todo | | |
| 7 | L-18 | Schedules, re-run and compare, regression alerts | L-11, L-14, L-15, L-07 | 095 `evals_schedule_credits` | todo | | |
| 7 | L-19 | Integrations: CI trigger, Slack/Teams/email | L-11, L-18 | 096 `evals_integrations_v2` | todo | | |
| 7 | L-20 | Help centre, API reference, methodology page | — | — | todo | | |
| 7 | L-22 | Workspace home, systems health, faster review | L-06 | — | todo | | |
| 7 | L-23 | EN/ES parity guard and sweep | L-07, L-17 | — | todo | | |
| 7 | L-24 | Accessibility and performance budgets | L-04, L-15, L-17 | 097 `perf_indexes` (if needed) | todo | | |
| 7 | L-34 | Better document intake | L-06, L-14 | 098 `evals_intake_v2` | todo | | |
| 7 | L-35 | Readout (presentation) mode | L-17 | 099 `evals_readout_decks` | todo | | |
| 7 | L-25 | Sector packs v1 and monthly new questions | L-22 | 100 `evals_sector_packs` | todo | | |
| 7 | L-26 | Expert review: request to reviewed report | L-17 | 101 `evals_review_orders` | todo | | |
| 7 | L-27 | Bring your own provider key | L-11, L-15 | 102 `billing_byok` | todo | | |
| 7 | L-28 | Partner workspaces and referral codes | L-02, L-14, L-17 | 103 `evals_partners` | todo | | |
| 7 | L-31 | Opt-in public results page, anonymous index | L-17, L-21 | 104 `evals_publication_consent` | todo | | |
| 7 | L-32 | Data controls: retention and export | — | 105 `evals_retention_setting` | todo | | |
| 7 | L-36 | "Pregunta a tu informe" (Ask your report) | L-11, L-17, L-33 | 106 `evals_report_questions` | todo | | |

Migration numbers are reserved up front so parallel packages never collide. An unused number (a package that needs no migration) stays a gap.

## 3. Phase deploys

A phase is deployed when every package in it is `done`. Phase 6 (launch week) has no packages; it is the founder's launch.

| Phase | Packages | Status |
| --- | --- | --- |
| 1 · Foundations | L-01, L-02, L-03, L-08, L-09 | in progress |
| 2 · Open the funnel (Gate A) | L-04, L-05, L-06, L-07, L-10, L-33 | todo |
| 3 · Billing build | L-11, L-21, L-12, L-13, L-14 | todo |
| 4 · Take money (Gate B) | L-15, L-16, L-17 | todo |
| 5 · Launch prep | L-29, L-30 | todo |
| 7 · Build the rest | L-18…L-28, L-31, L-32, L-34, L-35, L-36 | todo |

## 4. Implementation decisions (for questions the spec leaves to the build)

| # | Topic | Decision |
| --- | --- | --- |
| I-1 | Legal entity data (D-01) | The real data isn't available. Entity fields are read at runtime from `LEGAL_ENTITY_NAME`, `LEGAL_ENTITY_NIF`, `LEGAL_ENTITY_ADDRESS` and `LEGAL_ENTITY_REGISTRY`. When they are unset, the legal notice names the trade name "Caudals" and states that the company details will be published on registration, with the contact address. The §3.2 placeholders are allowed only in tests and development fixtures, and CI fails if they appear in `content/legal/*`, Stripe settings or invoice templates |
| I-2 | Lawyer review | Legal texts ship as version `2026-10-11`, flagged "pending legal review" in code and in the handoff. Gate B stays open until the founder records the review |
| I-3 | Stripe | Test mode only (`BILLING_STRIPE_MODE=test`). The test-mode webhook endpoint is created through the Stripe API with the test key, and its signing secret is stored under a new key. Live mode is a founder action |
| I-4 | Invoicing vendor (D-04) | Not chosen. L-13 builds the adapter interface, the `manual` adapter and the monthly accountant export, with `BILLING_INVOICING_PROVIDER=manual` |
| I-5 | Uptime checks (L-08) | External checks run from `arctic` (a different host and provider) on a systemd timer, alerting through the existing alert routing. No paid service |
| I-6 | Admin MFA (L-08) | TOTP is built and deployed; `EVALS_ADMIN_MFA_REQUIRED` stays off until the founder and operators have enrolled |
| I-7 | Expert-written content (L-25, L-26) | The tooling ships. Pack questions are drafts until an expert reviews them; nothing is labelled expert-reviewed without a recorded reviewer |
| I-8 | Time-based rollout steps | Steps that need calendar time or founder action (the billing shadow week, three clean reconciliation days, the €20 live purchase, design partners, lawyer review) are recorded under §5 rather than simulated |
| I-9 | Flags | Each package switches its flag on after its production checks when the spec says so. Flags that expose money, send lifecycle email to real users, or depend on a founder action stay off and are listed in §5 |

## 5. Founder actions

Things only the founder can do. Agents add to this list; they never do these themselves.

- [ ] Provide the SL's real legal data and store it with `sudo scripts/set-app-credentials.sh LEGAL_ENTITY_NAME` (and `_NIF`, `_ADDRESS`, `_REGISTRY`) — once L-01 lands.
- [ ] Book the lawyer review of Terms, Privacy, DPA, sub-processors, security and the AI-disclosure wording (before Gate B).
- [ ] Choose the invoicing provider with the gestor (D-04) and confirm IVA treatment.
- [ ] Complete Stripe account activation for the SL; switch `BILLING_STRIPE_MODE=live` at Gate B and make the €20 purchase.
- [ ] Enrol TOTP on every operator and platform-admin account, then switch `EVALS_ADMIN_MFA_REQUIRED=true`.

## 6. Session log

| Date | Event |
| --- | --- |
| 2026-10-11 | Spec approved for implementation. Brief, tracker and launch scripts (`scripts/launch/*`) added. Phase 1 started |
| 2026-10-11 | Resume mechanism: an hourly session cron (:17) re-enters this file while the orchestrating session is idle; it expires after 7 days (renew by 2026-10-18). Agents started for L-09, L-01 and L-03 |
| 2026-10-12 | Codex resumed serially with an active persisted goal after reading spec v2 end to end. L-01 and L-03 drafts are committed in their worktrees; no dirty files. L-09 app and migration are live, but its workers were never built because `evals-images.yml` is manually disabled. All 24 billing tests, typecheck, changed-file lint and i18n parity pass; production read-only verifier: 7 accounts, zero drift. |
| 2026-10-12 | The prior session cron is historical and has not been verified for this Codex chat. This session exposes no automation or usage-reset scheduling tool. Keep the goal active and checkpoints current; automatic wake-up after a usage reset cannot be configured or guaranteed from these tools. |
