# Caudals Product Project Tracker (For LLM/AI Agents)

Last updated: 2026-03-01  
Primary sources: `docs/caudals-context.md`, `docs/design-system.md`, repository audit (code + routes + actions + migrations)

## 1) Purpose

This file is the single execution source of truth for Caudals.  
Treat it like a project board and delivery tracker (Linear/Jira/Notion style) for autonomous agent execution.

Use it to know:

- what is done, in progress, blocked, or next,
- what the acceptance criteria are for each task,
- what validations were executed,
- and what follow-up work is required for market-ready quality.

## 2) Agent Operating Rules (Autonomous Mode)

- Start with user-requested tasks first.
- After completing requested tasks, continue autonomously with the most logical related unchecked tasks.
- Prefer dependency order and topical continuity:
  - same task family first,
  - then same stage,
  - then nearest downstream stage tasks that unlock delivery.
- Continue execution loop without waiting for new prompts while there are relevant unchecked tasks and no hard blocker.
- Only pause when:
  - credentials/access are missing,
  - destructive or irreversible operations need explicit confirmation,
  - or requirements conflict and cannot be resolved from repo context.
- For each task started, append `IN PROGRESS - <agent/date>`.
- For each completed task, switch to `[x]` and remove `IN PROGRESS`.
- For blocked tasks, keep `[ ]` and append `BLOCKED - <reason>`.
- Always run validations after implementation (`typecheck`, tests, lint, and flow-specific checks).
- Record validation results in `Completion Notes`.
- If implementation reveals missing scope, add follow-up tasks in the most relevant stage:
  - use deterministic IDs like `Sx-Tnn-F1`, `Sx-Tnn-F2` for follow-ups,
  - include clear acceptance criteria and file ownership.
- If a stage is complete but quality is not market-ready, add explicit hardening tasks (tests, UX polish, reliability, security, observability).
- If a stage is complete, design, plan and implement follow-up tasks to add new features and improvements to the product, keeping the product roadmap coherent and aligned with the product vision. To do this, first think about the state of the product and what is missing. Remember, the objective is to have a market-ready, polished, complete platform.
- Do not delete historical completed tasks or notes.
- Do not create parallel tracker files; update this tracker only.

## 3) Task State and Workflow

### 3.1 Checkbox States

- `[x]` completed and verified
- `[ ]` not done

### 3.2 Inline State Tags

- `IN PROGRESS - <agent/date>`
- `BLOCKED - <reason>`
- `NEEDS FOLLOW-UP - <short gap>`

### 3.3 Execution Cycle (Mandatory)

1. Pick highest-priority eligible task.
2. Implement end-to-end.
3. Validate with automated checks and targeted manual verification.
4. Update task status and `Completion Notes`.
5. Add follow-up tasks if quality gaps are discovered.
6. Repeat until no eligible tasks remain.

## 4) Global Non-Negotiables

- Preserve role isolation: `requester`, `contributor`, `admin`.
- Preserve payment and webhook consistency rules.
- Do not expose secrets in code, logs, or docs.
- Do not add dark mode in this phase.
- PWA refactor is out of scope for the design-system phase.
- Requester IA target remains `/requester/*` (legacy `/dashboard/*` requester workspace is deprecated).

## 5) Current Reality Snapshot (Confirmed)

### 5.1 Implemented Foundations

- App has role-based surfaces and route families: marketing, auth, requester, contributor, admin.
- Middleware supports app/marketing host split and `LANDING_MODE` behavior.
- Stripe payment + payout infrastructure exists (`payment-actions`, Stripe webhook route).
- DigitalOcean Spaces upload/delete API exists (`/api/upload`).
- Waitlist and collaborations intake APIs exist with Resend integration.
- Supabase migrations exist through `020_requester_overhaul.sql`.
- Docker multi-stage build and CI image push workflow are in place.
- Canonical requester routes under `/requester/*` exist.

### 5.2 Critical Gaps Blocking “Market-Ready”

- `lib/actions/requester-actions.ts` is largely placeholder logic returning empty/default values.
- `lib/actions/admin-actions.ts` has placeholder implementations for activity/waitlist actions.
- `lib/actions/wallet-actions.ts` still assumes wallets table removal, but wallets were recreated in migration `013`.
- Dataset export flow is not fully orchestrated around `dataset_exports` lifecycle.
- Notification center + command palette trigger wiring are incomplete.
- Multiple admin analytics/payment components still rely on mock client-side data.
- Test coverage is minimal (only one unit test file exists).
- Missing public pages linked from footer (`/pricing`, `/docs`, `/about`, `/contact`, `/legal/*`).
- Security hardening is incomplete (rate limiting, upload guardrails, stronger headers/CSP, abuse controls).

## 6) Priority Ladder

- P0: mandatory for functional production reliability and safe launch.
- P1: mandatory for polished product readiness and operational confidence.
- P2: high-value improvements after P0/P1 closure.

### 6.1) Prioritization and Queueing Rules

- Select next work in this order:
  1. User-requested tasks.
  2. In-progress tasks.
  3. P0 tasks that unblock other tasks.
  4. P1 tasks in active stage.
  5. P2 tasks and backlog improvements.
- Prefer tasks that:
  - reduce production risk,
  - unlock multiple downstream tasks,
  - replace placeholders/mocks with real behavior,
  - or improve quality gates (tests, observability, security).
- If two tasks are equal priority, choose the one with clearer acceptance criteria and faster verification path.

---

## Stage 0 - Delivery System and Project Hygiene (P0)

Exit criteria: Agents can execute work predictably with clear env contracts, release checks, and documentation.

- [x] **S0-T01 (P0)** Create `.env.example` with all required variables grouped by domain. | Files: `.env.example`, `README.md` | Done when: new developer/agent can run app without guessing env keys.
- [x] **S0-T02 (P0)** Replace low-signal `README.md` with setup, architecture summary, scripts, and troubleshooting. | Files: `README.md` | Done when: README documents local run, build, test, migrations, deployment.
- [x] **S0-T03 (P0)** Add `docs/execution-rules.md` with strict update protocol for this project tracker file. | Files: `docs/execution-rules.md` | Done when: every agent run follows same checklist discipline.
- [x] **S0-T04 (P1)** Add release checklist doc for pre-prod and prod. | Files: `docs/release-checklist.md` | Done when: repeatable go/no-go process exists.
- [x] **S0-T05 (P1)** Add architectural map doc linking routes -> components -> actions -> DB tables. | Files: `docs/architecture-map.md` | Done when: each critical flow has traceable ownership path.

## Stage 1 - Backend Truth Alignment and Domain Completion (P0)

Exit criteria: Placeholder business logic is replaced by real DB-backed, role-safe server actions.

- [x] **S1-T01 (P0)** Implement `getRequesterDatasets` with real filtering, search, pagination, and quick filters. | Files: `lib/actions/requester-actions.ts`, `app/(app)/requester/datasets/page.tsx` | Done when: requester list reflects real dataset states and counts.
- [x] **S1-T02 (P0)** Implement `updateDatasetStatus` with ownership checks, valid transitions, activity logging, and revalidation. | Files: `lib/actions/requester-actions.ts`, `supabase` policies if needed | Done when: status updates are persisted and auditable.
- [x] **S1-T03 (P0)** Implement `duplicateDataset` as draft clone with safe field copy policy. | Files: `lib/actions/requester-actions.ts` | Done when: duplicate creates new draft request and appears in requester list.
- [x] **S1-T04 (P0)** Implement `requestDatasetExport` + `generateSignedExportUrl` around `dataset_exports` table and DO Spaces links. | Files: `lib/actions/requester-actions.ts`, export helpers | Done when: export requests create tracked jobs and download URLs are valid.
- [x] **S1-T05 (P0)** Implement `getDatasetExports` by requester ownership and status sorting. | Files: `lib/actions/requester-actions.ts` | Done when: requester files page shows real exports.
- [x] **S1-T06 (P0)** Implement `saveAutomationConfig` and audit trail in `dataset_activity`. | Files: `lib/actions/requester-actions.ts` | Done when: automation config persists and can be retrieved.
- [x] **S1-T07 (P0)** Implement `getRequesterAnalytics` with real aggregation from datasets/submissions. | Files: `lib/actions/requester-actions.ts` | Done when: analytics page shows production metrics, not zeros.
- [x] **S1-T08 (P0)** Implement onboarding persistence (`getRequesterOnboarding`, `updateOnboardingStep`) using `requester_onboarding_progress`. | Files: `lib/actions/requester-actions.ts` | Done when: step state survives reload/session changes.
- [x] **S1-T09 (P0)** Implement org settings CRUD using `requester_org_settings`. | Files: `lib/actions/requester-actions.ts`, requester settings components | Done when: requester org settings are stored and editable.
- [x] **S1-T10 (P0)** Implement requester API key lifecycle with secure key generation + hashed storage + revoke flow. | Files: `lib/actions/requester-actions.ts`, DB table `requester_api_keys` | Done when: plaintext key shown once; hashed key persisted; revocation works.
- [x] **S1-T11 (P0)** Implement support ticket CRUD for requester (`support_tickets` table). | Files: `lib/actions/requester-actions.ts`, requester support components | Done when: ticket creation/listing works end-to-end.
- [x] **S1-T12 (P0)** Implement `getRequesterDashboardData` from real stats + actionable notifications. | Files: `lib/actions/requester-actions.ts` | Done when: dashboard KPIs/chart/actions match current DB state.
- [x] **S1-T13 (P0)** Replace placeholder admin activity/waitlist actions with real data access and updates. | Files: `lib/actions/admin-actions.ts` | Done when: `/admin/activity` and waitlist controls are functional.
- [x] **S1-T14 (P0)** Fix `wallet-actions` to align with wallets table recreated in migration `013`. | Files: `lib/actions/wallet-actions.ts`, payment actions | Done when: no mock wallet behavior remains.
- [x] **S1-T15 (P0)** Standardize currency units and naming conventions (cents vs dollars) across payment/requester/admin actions. | Files: `lib/actions/payment-actions.ts`, `lib/actions/requester-actions.ts`, admin pages | Done when: no inconsistent currency math in UI/business logic.
- [x] **S1-T16 (P1)** Add server-side zod validation and typed error envelopes for requester/admin action inputs. | Files: `lib/actions/`*, `lib/validators/*` | Done when: invalid inputs fail predictably with typed messages.

## Stage 2 - Requester Product Completion (P0)

Exit criteria: Requester workspace is fully usable for real operations without placeholder UX.

- [x] **S2-T01 (P0)** Replace placeholder dataset builder with full dataset creation/edit flow. | Files: `components/requester/datasets/dataset-builder.tsx`, dataset actions | Done when: requester can create valid dataset requests from UI.
- [x] **S2-T02 (P0)** Ensure `/requester/datasets/[id]` uses requester-native components rather than legacy dashboard coupling where feasible. | Files: `app/(app)/requester/datasets/[id]/page.tsx`, components | Done when: route architecture matches requester-first IA contract.
- [x] **S2-T03 (P0)** Complete export panel UX states (`pending/preparing/ready/failed/expired`) with retry and error visibility. | Files: `components/requester/datasets/export-panel.tsx` | Done when: users can understand and recover from export failures.
- [x] **S2-T04 (P0)** Wire onboarding page actions to persisted onboarding data and progress. | Files: `components/requester/onboarding/onboarding-steps.tsx` | Done when: onboarding interactions update stored progress.
- [x] **S2-T05 (P0)** Complete settings page with real profile/org/api key integration and robust form feedback. | Files: requester settings components | Done when: settings saves are validated and reflected immediately.
- [x] **S2-T06 (P0)** Complete support page with ticket details, statuses, and threaded updates model. | Files: requester support components, actions | Done when: support workflow is operational.
- [x] **S2-T07 (P1)** Add requester files filters/search and retention metadata (size, expiry, type). | Files: `/requester/files` page/components | Done when: large export histories are manageable.
- [x] **S2-T08 (P1)** Add requester notification feed from real events (`review_backlog`, `low_budget`, `export_ready`). | Files: requester dashboard + notification infrastructure | Done when: dashboard notifications are data-driven.

## Stage 3 - Admin Operations Completion (P0)

Exit criteria: Admin can moderate platform with complete data, auditability, and no mock dashboards.

- [x] **S3-T01 (P0)** Fully implement `/admin/activity` filters (action/target/date/admin) and pagination. | Files: admin actions + activity page | Done when: admins can audit events efficiently.
- [x] **S3-T02 (P0)** Fully implement `/admin/support` waitlist management with persistent status/notes and activity log writes. | Files: admin support page + actions | Done when: waitlist pipeline is operational.
- [x] **S3-T03 (P0)** Ensure all moderation actions write consistent `admin_activity_log` entries. | Files: `lib/actions/admin-actions.ts` | Done when: approvals/rejections/edits/role changes are auditable.
- [x] **S3-T04 (P0)** Replace any mock analytics/payment widgets used in admin-facing flows with server data. | Files: `components/admin/`*, admin pages | Done when: admin insights reflect real DB metrics.
- [x] **S3-T05 (P1)** Add bulk moderation safeguards (confirmation, rollback strategy, partial failure reporting). | Files: admin dataset/submission components/actions | Done when: bulk operations are safe and transparent.
- [x] **S3-T06 (P1)** Add admin queue views for payout failures and transfer reconciliation actions. | Files: admin payments views/actions | Done when: failed transfers can be identified and resolved fast.
- [x] **S3-T07 (P1)** Add admin-level support ticket triage UI (`open/in_progress/resolved/closed`). | Files: admin support page/actions | Done when: support workflow can be managed centrally.

## Stage 4 - Contributor Experience and Payout Reliability (P1)

Exit criteria: Contributor journey from discovery to payout is clear, consistent, and trustworthy.

- [x] **S4-T01 (P1)** Replace generic contributor settings forms with contributor-specific persisted settings. | Files: `components/dashboard/settings-forms.tsx`, contributor settings route | Done when: contributor settings are real, not static defaults.
- [x] **S4-T02 (P1)** Improve contributions list with status filters and clear reviewer feedback visibility. | Files: contributor pages/components/actions | Done when: contributors can act on `needs_changes` quickly.
- [x] **S4-T03 (P1)** Add payout timeline visibility (approved -> transfer created -> settled/failed). | Files: contributor earnings page + payment actions | Done when: payout status ambiguity is removed.
- [x] **S4-T04 (P1)** Enforce role correctness in contributor routes and remove requester-oriented leakage. | Files: contributor pages + middleware checks | Done when: contributor IA is role-clean.
- [x] **S4-T05 (P2)** Add contributor portfolio/profile quality indicators for requester trust scoring. | Files: contributor profile schema/UI | Done when: profile quality can be surfaced to requesters/admin.

## Stage 5 - Design System and IA Conformance (P1)

Exit criteria: Web app and marketing surfaces match design-system contract and feel production-polished.

- [x] **S5-T01 (P1)** Enforce design tokens contract in global CSS and remove drift values outside token system. | Files: `app/globals.css`, UI primitives | Done when: color/radius/spacing align with `design-system.md`.
- [x] **S5-T02 (P1)** Remove dark-mode scaffolding from this phase (`.dark` token duplication, theme drift). | Files: `app/globals.css`, theme-related code | Done when: light-only contract is explicit and consistent.
- [x] **S5-T03 (P1)** Ensure sidebar strictly follows top/middle/bottom zoning across roles. | Files: `components/app/app-sidebar.tsx`, sidebar primitives | Done when: shell contract is satisfied for requester/contributor/admin.
- [x] **S5-T04 (P1)** Complete command palette integration (button wiring + keyboard + role-aware results). | Files: `components/app/command-palette*.tsx`, app shell/layout | Done when: palette is discoverable and functional.
- [x] **S5-T05 (P1)** Complete notification bell integration with real unread counts/events. | Files: `components/app/notification-bell.tsx`, data hooks/actions | Done when: notification center is operational.
- [x] **S5-T06 (P1)** Remove or refactor legacy/duplicate `components/dashboard/`* patterns that conflict with requester-first IA. | Files: `components/dashboard/*`, requester components | Done when: no confusing parallel component system remains.
- [x] **S5-T07 (P1)** Keep requester IA canonical under `/requester/`*; ensure deprecated `/dashboard/*` requester subroutes are not reintroduced. | Files: route configs/navigation constants | Done when: navigation uses canonical requester paths only.
- [x] **S5-T08 (P1)** Validate responsive behavior across desktop/tablet/mobile for shell + key pages. | Files: app shell, role pages | Done when: no broken layout states in major breakpoints.
- [x] **S5-T09 (P2)** Polish marketing/auth visual consistency against design references and conversion focus. | Files: landing/auth components | Done when: public funnels visually match target quality bar.

## Stage 6 - Quality Engineering and Test Coverage (P0)

Exit criteria: Critical business flows have automated coverage and CI quality gates.

- [x] **S6-T01 (P0)** Add unit tests for requester/admin action logic (filters, permissions, transitions). | Files: `lib/actions/*.test.ts` | Done when: core action edge cases are covered.
- [x] **S6-T02 (P0)** Add payment and webhook idempotency tests (`payment_intent.`*, `transfer.*`). | Files: webhook/payment tests | Done when: duplicate event handling is proven safe.
- [x] **S6-T03 (P0)** Add integration tests for dataset lifecycle (request -> approve -> fund -> submit -> approve). | Files: integration test suite | Done when: full lifecycle passes in test env.
- [x] **S6-T04 (P0)** Add Playwright E2E smoke suite for role-based critical paths. | Files: `playwright.config.`*, `e2e/*` | Done when: auth + requester + contributor + admin smoke tests run in CI.
- [x] **S6-T05 (P0)** Add PR CI workflow for `lint`, `typecheck`, `test`, and selected E2E smoke checks. | Files: `.github/workflows/`* | Done when: regressions are caught pre-merge.
- [x] **S6-T04-F1 (P1)** Expand Playwright smoke coverage to authenticated role journeys using deterministic fixture users (requester/contributor/admin) and post-auth route checks. | Files: `e2e/*`, seed fixtures | Done when: role-home, core list view, and key action entrypoints are validated after sign-in.
- [x] **S6-T06 (P1)** Add fixture/seeding strategy for deterministic local and CI tests. | Files: `scripts/seed-`*, test fixtures | Done when: tests are stable and reproducible.
- [x] **S6-T07 (P1)** Add performance budgets and Lighthouse checks for key public/app routes. | Files: CI scripts/docs | Done when: regressions in performance are detectable.

## Stage 7 - Security, Abuse Prevention, and Compliance (P0)

Exit criteria: Platform has baseline production safeguards for data, payments, and user-generated content.

- [x] **S7-T01 (P0)** Add request rate limiting and abuse controls for public form APIs (`waitlist`, `collaborations`). | Files: API middleware/routes | Done when: endpoints are protected from spam and burst abuse.
- [x] **S7-T02 (P0)** Harden upload API with file size/type checks, ownership checks, and safe bucket/path constraints. | Files: `app/(app)/api/upload/route.ts` | Done when: unsafe uploads and path abuse are blocked.
- [x] **S7-T03 (P0)** Add webhook event replay protection with persisted event IDs and safe retries. | Files: Stripe webhook route + DB table/migration | Done when: duplicate webhook effects are eliminated.
- [x] **S7-T04 (P0)** Add stronger security headers and CSP strategy for production. | Files: `next.config.js`, middleware | Done when: CSP/XSS/clickjacking baseline is documented and enforced.
- [x] **S7-T05 (P1)** Audit and minimize service-role usage surface area in server actions and APIs. | Files: `lib/supabase/admin.ts`, actions/api routes | Done when: least-privilege access is demonstrable.
- [x] **S7-T06 (P1)** Add structured logging with sensitive field redaction policy. | Files: logging helpers + action routes | Done when: logs are actionable and safe for production.
- [x] **S7-T07 (P1)** Add data retention and cleanup jobs for expired exports/temp artifacts. | Files: export lifecycle jobs/scripts | Done when: storage/privacy risks are controlled.
- [x] **S7-T08 (P1)** Prepare compliance notes for privacy/terms/cookie behavior and DSAR process baseline. | Files: legal docs + internal runbook | Done when: legal/ops baseline is publishable.

## Stage 8 - Public Surface and Market Readiness (P1)

Exit criteria: External-facing product is credible, complete, and aligned with conversion + trust requirements.

- [x] **S8-T01 (P1)** Implement missing routes linked in footer: `/pricing`, `/docs`, `/about`, `/contact`, `/legal/privacy`, `/legal/terms`, `/legal/cookies`. | Files: `app/(home)/`* | Done when: no broken core marketing/legal links remain.
- [x] **S8-T02 (P1)** Add consistent CTA flows from landing pages into auth/requester onboarding. | Files: landing components, auth pages | Done when: funnel path is clear and measurable.
- [x] **S8-T03 (P1)** Add product analytics events for key funnel actions (visit -> signup -> create dataset -> fund). | Files: analytics utilities/components | Done when: conversion reporting is available.
- [x] **S8-T04 (P1)** Add trust content: security, governance, payout transparency, support SLAs. | Files: docs/marketing pages | Done when: enterprise buyers can self-qualify trust posture.
- [x] **S8-T05 (P2)** Add multilingual completeness pass for all newly added pages (`en`, `es`). | Files: i18n dictionaries/pages | Done when: no major untranslated product strings remain.

## Stage 9 - Launch Operations and Post-Launch Reliability (P0)

Exit criteria: Team can launch safely, monitor health, and recover quickly from incidents.

- [x] **S9-T01 (P0)** Define staging environment parity checklist (env vars, Stripe mode, Supabase project, Spaces bucket). | Files: `docs/staging-parity-checklist.md` | Done when: staging is trustworthy for pre-prod validation.
- [x] **S9-T02 (P0)** Create DB migration runbook and rollback policy (including payment-affecting changes). | Files: `docs/db-runbook.md` | Done when: schema changes are operationally safe.

## Stage 10 - Cross-Role Dashboard UX/IA and Essential Feature Expansion (P1)

Exit criteria: Requester, contributor, and admin dashboards are intentionally designed, role-complete, and functionally coherent end-to-end. Design is aesthetic, coherent and aligned with the design system.

- [x] **S10-T01 (P0)** Produce role-specific UX discovery notes (jobs-to-be-done, failure modes, daily/weekly workflows) for requester/contributor/admin. | Files: `docs/ux-role-discovery.md` | Done when: dashboard decisions are grounded in explicit role workflows.
- [x] **S10-T02 (P0)** Define dashboard IA blueprints and interaction specs for all 3 roles (navigation zones, KPI hierarchy, action surfaces, empty/error states). | Files: `docs/dashboard-ia-spec.md` | Done when: each role has approved IA + UI behavior contract before coding.
- [x] **S10-T03 (P0)** Plan shared dashboard design primitives (cards, activity streams, alerts, queue tables, status chips) with accessibility and mobile constraints. | Files: `docs/dashboard-ui-spec.md`, UI components | Done when: reusable patterns reduce role dashboard drift.
- [x] **S10-T04 (P1)** Implement requester dashboard UX refinements from IA spec (clear action hierarchy, risk alerts, workload views, export/support shortcuts). | Files: requester dashboard/components | Done when: requester can operate core loops from one coherent dashboard.
- [x] **S10-T05 (P1)** Implement contributor dashboard essentials not yet explicitly planned (task inbox, feedback queue, payout forecast + blockers panel). | Files: contributor dashboard/components/actions | Done when: contributor can prioritize work and payout readiness at a glance.
- [x] **S10-T06 (P1)** Implement admin dashboard essentials not yet explicitly planned (operational SLA queues, anomaly detection cards, escalation shortcuts). | Files: admin dashboard/components/actions | Done when: admin can triage platform health and moderation risk quickly.
- [x] **S10-T07 (P1)** Add cross-role instrumentation and dashboard usability acceptance checks (critical task completion paths and time-to-action metrics). | Files: analytics/events + QA docs | Done when: dashboard effectiveness is measurable across roles.
- [x] **S10-T08 (P1)** Run multi-role dashboard QA pass (desktop/tablet/mobile, EN/ES string fit, loading and failure states). | Files: QA docs + role pages/components | Done when: all 3 role dashboards are functional and production-ready.

---

## 7) Immediate Critical Path (Do First)

These are the highest ROI items to unlock a functional product quickly.

- [x] **CP-01** Finish Stage 1 requester actions (`S1-T01` to `S1-T12`).
- [x] **CP-02** Replace admin placeholder actions (`S1-T13`) and verify admin pages.
- [x] **CP-03** Resolve wallet/actions drift (`S1-T14`, `S1-T15`).
- [x] **CP-04** Replace requester dataset builder placeholder (`S2-T01`).
- [x] **CP-05** Add minimum automated coverage for payments + lifecycle (`S6-T01` to `S6-T04`).
- [x] **CP-06** Add baseline security hardening (`S7-T01` to `S7-T04`).

## 8) Completion Notes

Use this section as a simple change log. Add newest entries at the top.

- 2026-03-01 - `S10-T08` - Ran multi-role dashboard QA pass with dedicated Playwright coverage (`e2e/dashboard-multirole-qa.spec.ts`) validating requester/contributor/admin dashboards across mobile/tablet/desktop and `en`/`es`, plus unauthenticated redirect failure-state checks and horizontal overflow guards. Added QA runbook notes in `docs/dashboard-qa-pass.md`. - Validated with `PLAYWRIGHT_AUTH_E2E=true PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 npx playwright test e2e/dashboard-multirole-qa.spec.ts --project=chromium`, `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 npx playwright test e2e/public-routes.spec.ts --project=chromium`.
- 2026-03-01 - `S10-T07` - Added cross-role dashboard instrumentation via `DashboardTelemetry` (`dashboard_view`, `dashboard_action_clicked`, `time_to_action_ms`) and wired action markers on requester/contributor/admin primary actions. Expanded admin analytics to report dashboard usability telemetry (visits/actions/avg TTA/action-to-view by role) and documented acceptance queries in `docs/dashboard-usability-checks.md`. - Validated with `npm run typecheck`, `npm test -- --run`, `npx eslint components/analytics/dashboard-telemetry.tsx app/(app)/requester/page.tsx app/(app)/contributor/page.tsx app/(app)/admin/page.tsx app/(app)/admin/analytics/page.tsx lib/actions/admin-actions.ts app/(app)/api/analytics/track/route.ts`.
- 2026-03-01 - `S8-T05` - Completed multilingual pass for newly added public/trust/legal/dashboard strings by extending `lib/i18n/es.json` coverage to include Stage 8 and Stage 10 copy (trust center, legal/docs pages, dashboard queue/forecast labels). - Validated with `node -e \"JSON.parse(require('fs').readFileSync('lib/i18n/es.json','utf8')); console.log('es.json OK')\"`, `PLAYWRIGHT_AUTH_E2E=true PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 npx playwright test e2e/dashboard-multirole-qa.spec.ts --project=chromium`.
- 2026-03-01 - `S7-T08` - Added compliance baseline notes covering privacy/terms/cookies publication state and DSAR intake/verification/fulfillment SLA process in `docs/compliance-baseline.md`. - Validated with docs review plus `npm run typecheck`.
- 2026-03-01 - `S7-T07` - Implemented retention cleanup job (`scripts/cleanup-expired-artifacts.ts`) for expired dataset exports and old temp storage prefixes with dry-run support and operational guide in `docs/data-retention.md`; added script entry `npm run cleanup:expired`. - Validated with `npm run typecheck`, `npx eslint scripts/cleanup-expired-artifacts.ts`.
- 2026-03-01 - `S7-T06` - Added structured logging with redaction (`lib/security/structured-logger.ts`), integrated into waitlist/collaboration/upload/webhook/analytics flows, and documented policy in `docs/logging-redaction-policy.md`. - Validated with `npm run typecheck`, `npm test -- --run`, `npx eslint lib/security/structured-logger.ts app/(app)/api/waitlist/route.ts app/(app)/api/collaborations/route.ts app/(app)/api/upload/route.ts app/(app)/api/webhooks/stripe/route.ts lib/analytics/funnel-events-server.ts`.
- 2026-03-01 - `S7-T05` - Completed service-role surface audit and minimization: introduced scoped admin client headers in `lib/supabase/admin.ts`, replaced unscoped service-role calls with explicit scopes across actions/APIs, and documented current privileged surface/justification in `docs/service-role-surface.md`. - Validated with `npm run typecheck`, `npx eslint lib/supabase/admin.ts lib/actions/payment-actions.ts lib/actions/admin-actions.ts lib/actions/wallet-actions.ts lib/actions/notification-actions.ts app/(app)/api/upload/route.ts app/(app)/api/waitlist/route.ts app/(app)/api/webhooks/stripe/route.ts`.
- 2026-03-01 - `S10-T06` - Upgraded admin dashboard operations panel with SLA queue visibility (review backlog, pending payouts, open support), anomaly detection cards (failed payouts, stale tickets, funnel conversion risk), and escalation shortcuts to payments/support/review/activity triage routes. - Validated with `npm run typecheck`, `npx eslint 'app/(app)/admin/page.tsx'`, `npm test -- --run`.
- 2026-03-01 - `S10-T05` - Implemented contributor dashboard essentials via new server aggregation (`getContributorDashboardEssentials`): prioritized task inbox, reviewer feedback queue, payout forecast (ready/pending/failed), and blocker summaries wired into the main contributor dashboard UX. - Validated with `npm run typecheck`, `npx eslint lib/actions/contributor-actions.ts 'app/(app)/contributor/page.tsx'`, `npm test -- --run`.
- 2026-03-01 - `S0-T01`, `S0-T02`, `S0-T03`, `S0-T04`, `S0-T05` - Completed project hygiene and delivery docs: added `.env.example` with grouped runtime keys, replaced `README.md` with full setup/testing/migration/deployment guidance, and added `docs/execution-rules.md`, `docs/release-checklist.md`, and `docs/architecture-map.md` for autonomous execution discipline and system traceability. - Validated with `npm run typecheck` and `npm test -- --run`.
- 2026-03-01 - `S9-T01`, `S9-T02` - Added production-grade launch operations docs: `docs/staging-parity-checklist.md` (staging parity gate covering env/routing/Supabase/Stripe/Spaces/security/analytics + sign-offs) and `docs/db-runbook.md` (migration preflight, staged rollout, payment-sensitive safeguards, rollback strategy, and incident handling). - Validated with doc review plus `npm run typecheck` and `npm test -- --run` (to ensure no regressions in codebase).
- 2026-03-01 - `S8-T04` - Implemented trust-center public surface with dedicated `/trust` page covering security baseline, governance controls, payout transparency, support SLA targets, and due-diligence links; wired discoverability through marketing header/footer and docs index. - Validated with `npm run typecheck`, `npx eslint 'app/(home)/trust/page.tsx' 'app/(home)/docs/page.tsx' components/marketing/footer.tsx components/ui/header.tsx`, `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 npx playwright test e2e/public-routes.spec.ts --project=chromium` (including new `/trust` route assertion).
- 2026-03-01 - `S8-T03` - Completed funnel analytics end-to-end: client/server event capture (`visit`, `signup`, `dataset_created`, `fund`), resilient analytics ingestion API, server-side funding event instrumentation in payment actions, and admin conversion reporting card with 30-day step + rate metrics. Added Vitest `server-only` shim so analytics server modules are test-safe in node. - Validated with `npm run typecheck`, `npm test -- --run`, `npx eslint lib/analytics/funnel-events-server.ts lib/actions/admin-actions.ts lib/actions/payment-actions.ts 'app/(app)/admin/analytics/page.tsx'` (warnings only in existing `payment-actions.ts`).
- 2026-03-01 - `S8-T02` - Standardized landing CTA flow into requester onboarding by routing hero/CTA actions to `auth/sign-up?role=requester&next=/requester/onboarding` and extending sign-up callback handling to preserve safe `role` + `next` query params for email/OAuth signup redirects. - Validated with `npm run typecheck`, `npx eslint components/landing/hero.tsx components/landing/cta.tsx app/(auth)/auth/sign-up/page.tsx`, `npx playwright test e2e/smoke.spec.ts --project=chromium`.
- 2026-03-01 - `S8-T01` - Implemented missing public/legal routes linked from footer (`/pricing`, `/docs`, `/about`, `/contact`, `/legal/privacy`, `/legal/terms`, `/legal/cookies`) with a reusable marketing page shell and added supplemental `blog`/`careers` placeholders to avoid dead-end company links. - Validated with `npm run typecheck`, `npx eslint app/(home)/* components/marketing/marketing-page-layout.tsx`, `npx playwright test e2e/public-routes.spec.ts --project=chromium`.
- 2026-03-01 - `S7-T01`, `S7-T02`, `S7-T03`, `S7-T04`, `CP-06` - Completed baseline security hardening: added reusable in-memory rate limiting + bot-trap controls for waitlist/collaboration APIs, hardened upload API (allowed buckets, MIME + size limits, role/dataset access checks, safe path constraints), implemented persisted Stripe webhook replay guard with new migration `023_stripe_webhook_events.sql`, and enforced stronger security headers/CSP in `next.config.js` with baseline documentation in `docs/security-baseline.md`. - Validated with `npm run typecheck`, `npm test -- --run`, `npm run lint` (warnings only).
- 2026-03-01 - `S6-T04-F1`, `S5-T08` - Expanded Playwright coverage to authenticated role journeys with deterministic fixture users and requester breakpoint checks (mobile/tablet/desktop) in `e2e/authenticated-role-smoke.spec.ts`; improved fixture seed determinism by resetting passwords for existing fixture users. - Validated with `npm run seed:test-fixtures`, `PLAYWRIGHT_AUTH_E2E=true npx playwright test e2e/authenticated-role-smoke.spec.ts --project=chromium`, `npx playwright test e2e/smoke.spec.ts --project=chromium`.
- 2026-03-01 - `S6-T07` - Finalized Lighthouse budget gate with CI-usable config + docs updates and successful local run across `/`, `/auth/sign-in`, `/browse`, `/requester` route set (with redirect behavior). - Validated with `npm run perf:lighthouse`.
- 2026-03-01 - `S6-T06` - Added deterministic fixture strategy with seed automation and docs: `scripts/seed-test-fixtures.ts`, `docs/testing-fixtures.md`, and `npm run seed:test-fixtures`. Fixture accounts, dataset, and submission IDs are stable to support reproducible local/CI role testing. - Validated with `npm run typecheck`, `npm test -- --run`, `npm run lint` (warnings only).
- 2026-03-01 - `S6-T03`, `CP-05` - Added deterministic in-memory lifecycle integration coverage (`lib/actions/dataset-lifecycle.integration.test.ts`) for request creation -> admin approval -> funding state -> contributor submission -> final approval across real server actions with mocked Supabase adapter. This closes the minimum coverage critical path (`S6-T01` to `S6-T04`). - Validated with `npm test -- --run lib/actions/dataset-lifecycle.integration.test.ts`, `npm test -- --run`, `npm run typecheck`, `npm run lint` (warnings only).
- 2026-03-01 - `S6-T04`, `S6-T05` - Added Playwright smoke harness (`playwright.config.ts`, `e2e/smoke.spec.ts`) and CI enforcement workflow (`.github/workflows/ci.yml`) running lint, typecheck, unit tests, and Chromium smoke E2E on PRs/main. Also hardened Vitest config to ignore E2E files and keep unit-test scope deterministic. - Validated with `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 npx playwright test e2e/smoke.spec.ts --project=chromium`, `npm test -- --run`, `npm run typecheck`, `npm run lint` (warnings only).
- 2026-03-01 - `S6-T02` - Added Stripe webhook/payment idempotency tests covering duplicate `payment_intent.succeeded` and `transfer.created` events in webhook handlers. Tests assert duplicate references short-circuit without inserting duplicate transactions. - Validated with `npm test -- --run app/(app)/api/webhooks/stripe/route.test.ts`, `npm test -- --run`, `npm run typecheck`, `npm run lint` (warnings only).
- 2026-03-01 - `S6-T01` - Added requester/admin action unit coverage with Supabase-chain mocks: status transition guard + happy-path activity logging for requester dataset status updates, duplicate-dataset draft cloning safeguards, requester quick-filter behavior (`pending_review`), and admin waitlist moderation status/metadata/activity behavior including forbidden role rejection. - Validated with `npm test -- --run lib/actions/requester-actions.test.ts lib/actions/admin-actions.test.ts`, `npm test -- --run`, `npm run typecheck`, `npm run lint` (warnings only).
- 2026-03-01 - `S5-T01` to `S5-T07`, `S5-T09` - Completed Stage 5 design-system and IA conformance pass: enforced light-only DS token contract in global/theme primitives, finalized sidebar zoning and command palette discoverability with role-aware search results, shipped data-driven notification center unread flows, migrated and removed legacy `components/dashboard/*` duplication into `components/app/*` and `components/contributor/*`, and standardized canonical requester IA links away from legacy `/dashboard` usage in user-facing navigation/auth redirects. Also polished auth visual consistency with upgraded sign-in/sign-up layouts aligned to DS references. Responsive smoke checks executed on auth + marketing surfaces via DevTools snapshots at mobile/tablet/desktop breakpoints. - Validated with `npm run typecheck`, `npm test -- --run`, `npm run lint` (warnings only), and manual breakpoint snapshots (`/auth/sign-in`, `/auth/sign-up`, `/`).
- 2026-03-01 - `S4-T01` to `S4-T05` - Completed contributor experience stage: added persisted contributor settings with new `contributor_settings` migration + actions/UI, improved contributions filtering with `needs_changes` + inline reviewer feedback visibility, added payout timeline states on earnings, enforced contributor-only route guard and removed requester redirect leakage, and introduced profile quality scoring indicators to guide trust/readiness improvements. - Validated with `npm run typecheck`, `npm test -- --run`, `npm run lint` (warnings only).
- 2026-03-01 - `S3-T01` to `S3-T07` - Completed admin operations stage: full `/admin/activity` filtering + pagination; operational waitlist management with filters and persistent notes; consistent admin activity logging across moderation/bulk/role/support flows; support ticket triage UI with status/priority/assignee/reply; payout failure + stale pending queues with reconciliation actions; and bulk moderation safeguards with confirmation dialogs and result reporting. - Validated with `npm run typecheck`, `npm test -- --run`, `npm run lint` (warnings only).
- 2026-03-01 - `CP-04`, `S2-T01` to `S2-T08` - Completed requester Stage 2 product surfaces: full create/edit builder + requester-native dataset workspace, full export lifecycle UX (retry/error/retention), settings feedback hardening, support threaded tickets with detail route, files filtering/search with retention metadata, and persisted onboarding/notification feed integration. - Validated with `npm run typecheck`, `npm test -- --run`, `npm run lint` (warnings only).
- 2026-03-01 - `S10-T01` to `S10-T04` - Added cross-role UX/IA/UI dashboard planning docs and implemented requester dashboard actionability improvements (functional “view all”, actionable notifications, and quick-ops shortcuts to datasets/review/files/support). - Validated with `npm run typecheck`, `npm run lint -- app/(app)/requester/page.tsx components/requester/dashboard/overview-panels.tsx`.
- 2026-03-01 - Dataset builder payload hardening - Fixed create/edit dataset validation failures by supporting relative image paths, locale-formatted numeric inputs, and field-level validation output in builder UI. - Validated with `npm run typecheck`, `npm run lint -- components/requester/datasets/dataset-builder.tsx lib/validators/requester-admin.ts`.
- 2026-03-01 - Self-hosted Supabase schema recovery - Applied migration `020_requester_overhaul.sql` on VPS Supabase (`root@161.35.200.8`), reloaded PostgREST schema, and restarted `supabase-rest` to restore `dataset_exports` table availability.
- 2026-03-01 - Added Stage 10 dashboard UX/IA planning and cross-role essential feature expansion tasks for requester/contributor/admin functional dashboard delivery. - Validation: roadmap updated for planning + implementation coverage.
- 2026-03-01 - `S1-T16` - Added shared typed action-error envelope helpers and zod input schemas; wired validation into requester/admin Stage 1 actions. - Validated with `npm run typecheck`, `npm test -- --run`, `npm run lint` (warnings only).
- 2026-03-01 - `CP-03`, `S1-T14`, `S1-T15` - Replaced mock wallet actions with real `wallets` table upserts and standardized cents naming (`*_cents`) in admin payment totals + requester wallet conversion consistency. - Validated with `npm run typecheck`, `npm test -- --run`, `npm run lint` (warnings only).
- 2026-03-01 - `CP-01`, `S1-T01` to `S1-T12` - Replaced requester placeholder server actions with DB-backed implementations (filters/pagination, status transitions + audit, duplication, export lifecycle, onboarding/org/api-keys/support/dashboard analytics). - Validated with `npm run typecheck`, `npm test -- --run`, `npm run lint` (warnings only).
- 2026-03-01 - `CP-02`, `S1-T13` - Replaced admin activity/waitlist placeholder actions with real data access, status updates, and admin activity logging. - Validated with `npm run typecheck`, `npm test -- --run`, `npm run lint` (warnings only).
- YYYY-MM-DD - `<task-id>` - `<what changed>` - `<validation done>`

## 9) Backlog / Future (After Launch)

- Add advanced notification center with user preferences and digests.
- Add team/org multi-user requester workspace and permission model.
- Add marketplace ranking/recommendation improvements for contributors.
- Add advanced billing (invoices, VAT, enterprise contracts).
- Add deeper analytics and experimentation framework.
