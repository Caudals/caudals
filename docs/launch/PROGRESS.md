# Launch build progress (spec v2)

The founder approved `docs/product-specs/spec-v2.md` on 2026-10-11. The latest instruction (2026-10-12, Claude orchestrator session) is to implement every phase, deploy after each phase, **spawn subagents**, and resume after usage-limit resets. The orchestrator runs 2–4 package agents in parallel in their own worktrees, merging one at a time under the merge lock, and follows `docs/launch/AGENT-BRIEF.md`. This file is the source of truth for resuming.

## 1. How to resume

1. Read this file, then `git log --oneline -15` and `git worktree list` in `/home/caudals/caudals`.
2. `scripts/launch/merge-lock.sh status`. A lock held by a package whose agent is no longer running is released with `release <owner>` after you check that package's state.
3. For each package marked **in progress**: if `.worktrees/launch-L-xx` exists, resume it with a package agent (do not duplicate one that is still running); if it merged but the handoff is missing, finish verification and the handoff.
4. Start agents for the next packages whose dependencies have landed (§2), at most 4 at a time.

## 2. Packages

Status: `todo` · `in progress` · `merged` (on `main`, deploy pending or verifying) · `done` (deployed, verified, handoff written) · `blocked` (reason in notes).

| Phase | ID | Title | Depends on | Migration | Status | Commit | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | L-01 | Trust and legal pages, terms acceptance | — | 081 `evals_terms_acceptance` | deployed; entity data pending | `d1084f0` | [L-01](L-01.md) |
| 1 | L-02 | Funnel events and growth dashboard v1 | — | 082 `analytics_event_dimensions` (if needed) | done | `144510e`, `cf8252b` | [L-02](L-02.md); flag on, events persisting, growth query 3.8 ms in production. |
| 1 | L-03 | Demo queue, capacity and fallback model | — | 083 `demo_queue` | deployed; fallback pending | `12561e5` | [L-03](L-03.md); production demo and lifecycle events verified. |
| 1 | L-08 | Observability, alerting and admin MFA | — | 107 `auth_two_factor_lockout` | done | `5244bc1` | [L-08](L-08.md); Sentry on (web, worker, scheduler, documents; test events accepted, scrubbed). Alert timer reinstalled, drills fired and resolved. Uptime checks interim on atlantic (arctic install is a founder action). `EVALS_ADMIN_MFA_REQUIRED` off (I-6). |
| 1 | L-09 | Billing core: credit ledger | — | 084 `billing_core` | done | 35b462a | App, migration and workers verified; seven accounts, zero drift. Billing off/shadow. Worker CI disabled; recovery deployment documented in L-09.md. |
| 2 | L-04 | Front door: demo linked, indexed, CTAs | L-01, L-02, L-03 | — | done | `82cf8ee`, `5f52110`, `1302ad6` | [L-04](L-04.md); `DEMO_PUBLIC=true` (decision I-10). Demo linked from header, hero, sectors and footer, indexed, in sitemap/`llms.txt`; share-to-colleague verified with the internal address (2 emails, limit enforced). Workers at `5f52110`. |
| 2 | L-05 | Direct work-email sign-up | L-01 | 085 `evals_signup_domains` | done | `464e55e` | [L-05](L-05.md); `SELF_SERVE_DIRECT_SIGNUP=true`. Production sign-up (internal address, ops exception) verified end to end, then removed through the audited deletion workflow; exception reset to `none`. Workers unaffected. |
| 2 | L-06 | First-run onboarding and activation | L-02 | 086 `evals_onboarding` | done | `e4a5ec3`, `19264c3`, `f610a0f` (test) | [L-06](L-06.md); `ONBOARDING_AUTOSTART=true` (app and scheduler). Drill: demo sign-up → one generation job 11.8 s later (50 questions), Get help emailed ops once, workspace deleted through the audited workflow. L-33's example linked from the checklist and empty states; its hide choice is now per workspace. |
| 2 | L-07 | Branded EN/ES emails and lifecycle sequence | L-02 (L-06 soft) | 087 `evals_lifecycle_email` | done | `8157a37` | [L-07](L-07.md); `BRANDED_EMAILS_ENABLED=true` after internal sends (ES sample, EN reset through the deployed app). `LIFECYCLE_EMAILS_ENABLED` off (I-9). App, migration and workers (scheduler) verified; DKIM/SPF/DMARC aligned. |
| 2 | L-10 | Price book, model guard and estimator | L-09 | 088 `billing_price_book` | done | `be3a0dc`, `d9edc3c` | [L-10](L-10.md); app and workers at `d9edc3c`; `BILLING_ESTIMATES_ENABLED=operators`. Backtest 35/38 runs within ±25 % (92.1 %). €0 guard live (five €0 commercial revisions blocked; all live routes on Local). |
| 2 | L-33 | Example evaluation and public sample report | L-02 | — | done | `ebc8627`, `518175e` | [L-33](L-33.md); `EXAMPLE_EVALUATION_ENABLED=true`, public page `noindex` until the founder reads it (`SAMPLE_REPORT_INDEXED` off). Hiding is per device: L-06 should store it in its onboarding state. |
| 3 | L-11 | Engine integration: holds, captures, refunds | L-09, L-10 | 089 `billing_engine_hooks` | done (shadow week running) | `84c7698` | [L-11](L-11.md); app and workers at `84c7698`, `BILLING_CREDITS_ENABLED=true`, `BILLING_ENFORCE=shadow`. Production shadow run on the DGX: shadow hold, capture, meter and admission recorded, run unaffected, ledger untouched, 8 accounts zero drift, every shadow check 0. Crash (SIGKILL), concurrency and exactness tests pass. Enforce is a founder step (§5). |
| 3 | L-21 | Prospect snapshot and ops growth v2 | L-02 | 090 `evals_prospect_snapshots` | done | `d8f80b5`, `8f50fb7` | [L-21](L-21.md); `PROSPECT_SNAPSHOTS_ENABLED=true` (operators), `OPS_DIGEST_ENABLED=true` (internal address only). One production snapshot of Caudals' own fixture chat and caudals.com end to end (adversarial pack 422, host limit 429, 30-day labelled link, CRM draft `sent: false`); one digest delivered to the internal address. "Assign to me" left over. App `8f50fb7`, workers `d8f80b5`. |
| 3 | L-12 | Stripe top-ups, auto-recharge and webhooks | L-09, L-01 | 091 `billing_payments` | done | `180e34b`, `485f2cc` | [L-12](L-12.md); Stripe test mode: one €20 Checkout purchase credited ~1 s after payment, 5× replays no-op, auto-recharge fired once, both refunded through the audited admin path, zero drift. `BILLING_STRIPE_MODE=test`, test endpoint and secret set; app and workers at `485f2cc`. |
| 3 | L-13 | Invoicing and IVA | L-12 | 092 `billing_invoices` | todo | | |
| 3 | L-14 | Plans and limits v2, upgrade moments | L-09, L-12 | 093 `evals_plans_v2` | todo | | |
| 4 | L-15 | Billing and usage screens, run estimate dialog | L-10, L-11, L-12, L-14 | — | todo | | |
| 4 | L-16 | Ops billing console and reconciliation | L-09, L-10, L-12, L-13 | 094 `billing_approvals` | todo | | |
| 4 | L-17 | Report v2 and share page | L-02, L-04 | — | done | `87f88401` | [L-17](L-17.md); no flag (additive). Summary, next steps and "Fix these first" on reports; PDF/Word cover + summary first, `Caudals-<system>-<date>` names, versioned export paths; share page header, demo referral and open counts. App and workers at `87f88401`; production report checked web = PDF = Word. P-54 left over. |
| 5 | L-29 | AI-disclosure check (Art. 50 evidence) | L-03 | — | in progress | | |
| 5 | L-30 | Public site refresh, DPA acceptance UI | L-01, L-04 | — | in progress | | |
| 7 | L-18 | Schedules, re-run and compare, regression alerts | L-11, L-14, L-15, L-07 | 095 `evals_schedule_credits` | todo | | |
| 7 | L-19 | Integrations: CI trigger, Slack/Teams/email | L-11, L-18 | 096 `evals_integrations_v2` | todo | | |
| 7 | L-20 | Help centre, API reference, methodology page | — | — | in progress | | |
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
| 1 · Foundations | L-01, L-02, L-03, L-08, L-09 | deployed (2026-10-12); founder actions open: entity data, fallback funding, MFA enrolment, arctic uptime |
| 2 · Open the funnel (Gate A) | L-04, L-05, L-06, L-07, L-10, L-33 | deployed (2026-10-12); every package done. Gate A engineering is complete; the founder actions in §5 (lifecycle emails, example content check and linking, legal data and review) remain |
| 3 · Billing build | L-11, L-21, L-12, L-13, L-14 | in progress |
| 4 · Take money (Gate B) | L-15, L-16, L-17 | in progress |
| 5 · Launch prep | L-29, L-30 | in progress |
| 7 · Build the rest | L-18…L-28, L-31, L-32, L-34, L-35, L-36 | in progress |

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
| I-10 | Front-door flag (L-04) | The spec names `NEXT_PUBLIC_DEMO_PUBLIC`, but the image build only receives `NEXT_PUBLIC_APP_URL`, so L-04 uses the server-read runtime flag `DEMO_PUBLIC` (default off, in the `set-app-credentials.sh` allowlist). It switches the header pill and "Sign in", the hero/sector/closing CTAs, the demo's indexing, its sitemap/`llms.txt`/agent-markdown entries and the report card's readout and share actions together. The public tree revalidates every 300 s and `/demo` renders per request, so a switch needs only `set-app-flag.sh` (no rebuild) |
| I-11 | Per-workspace credit enforcement | `BILLING_ENFORCE` applies to every non-contract workspace and all internal workspaces are on contracts (L-11). L-14 adds a per-workspace enforcement override (ops-set, audited) so internal test workspaces can enforce first, and free workspaces get their monthly allowance before any global `enforce` |
| I-12 | DB test isolation | Several real-schema suites (`analytics-growth-db`, `health-alerts-db`) fail only when run in parallel with others because they share fixture data; they pass on a fresh database. Packages run them in isolation; L-24 fixes the shared-state isolation |

## 5. Founder actions

Things only the founder can do. Agents add to this list; they never do these themselves.

- [ ] Fund/configure the existing production OpenRouter key for the €5/day demo fallback budget, then verify fallback before enabling `DEMO_FALLBACK_ENABLED` (L-03). Current key limit and remaining allowance are both zero.
- [ ] Provide the SL's real legal data and store it with `sudo scripts/set-app-credentials.sh LEGAL_ENTITY_NAME` (and `_NIF`, `_ADDRESS`, `_REGISTRY`) — once L-01 lands.
- [ ] Book the lawyer review of Terms, Privacy, DPA, sub-processors, security and the AI-disclosure wording (before Gate B).
- [ ] Choose the invoicing provider with the gestor (D-04) and confirm IVA treatment.
- [ ] Complete Stripe account activation for the SL; switch `BILLING_STRIPE_MODE=live` at Gate B and make the €20 purchase.
- [ ] Before Stripe live mode (L-12): set the Stripe account's public business name (Checkout shows "Datasets sandbox" in test mode), confirm the IVA treatments and invoice mentions with the gestor, store the live `STRIPE_SECRET_KEY`, create the live endpoint with `scripts/billing/stripe-webhook-endpoint.ts --mode live` (L-12.md), then switch the mode and redeploy the workers. Live mode opens top-ups to every owner while `BILLING_CREDITS_ENABLED=true`; ask for a live workspace allowlist first if the €20 purchase and the five design partners must come before everyone. Optional: disable the legacy test endpoint `https://caudals.com/api/webhooks/stripe` (404).
- [ ] Enrol TOTP on every operator and platform-admin account at `app.caudals.com/workspace/security` (account menu → Account security; save the recovery codes), then switch `scripts/launch/set-app-flag.sh EVALS_ADMIN_MFA_REQUIRED true` (L-08, runbook 21). On 2026-10-12: 2 platform admins and 1 workspace operator, none enrolled.
- [ ] Install the one-minute uptime checks on `arctic` (decision I-5): atlantic cannot SSH there (tailnet policy refuses atlantic → arctic). From a device with access, copy `scripts/uptime-checks.sh`, `scripts/install-uptime-checks.sh` and `infra/host/caudals-uptime.{service,timer}` to arctic and run `sudo bash install-uptime-checks.sh` (uses `/root/.caudals/alerts.env`), then `sudo systemctl disable --now caudals-uptime.timer` on atlantic. Or allow atlantic → arctic SSH in the tailnet policy and ask an agent (L-08.md).
- [ ] Open Sentry and confirm the three L-08 test events (web, evals-worker, evals-scheduler; release `5244bc1`) arrived with personal data redacted. No Sentry API token is on the host, so agents could confirm only that Sentry accepted them (HTTP 200).
- [ ] Reconcile the 28 unknown-outcome engine attempts behind the `unresolved_attempts` alert, open since 2026-10-03 (runbook 4); the reinstalled alert timer reminds daily.
- [ ] Decide on the October FX move (L-10): the ECB rate recorded by the scheduler (1.1206 USD/EUR, 2026-10-09) is 3.4 % below the price book's 1.1605, so list-priced credit rates should rise about 3.6 % (§6.4 trigger: 3 %; e.g. GPT-6 Luna 15 · 75, Opus 5.5 565 · 2,825). An increase needs 30 days' notice; draft and schedule it through the price-book API (L-10.md) or wait for L-16's UI.
- [ ] Check the example company name "Hogarel" (and its product "Hogar Completo") against the DGSFP register of insurers and a trademark search (OEPM/EUIPO) before the sample report is linked publicly (L-33). A rename is one constant in `lib/evals/example/source/company.ts`, then rebuild the fixtures and PDFs (L-33.md).
- [ ] Read the example content (`caudals.com/en/sample-report`, `/es/informe-de-ejemplo`, both PDFs and `app.caudals.com/workspace/example`), then link it publicly: `scripts/launch/set-app-flag.sh SAMPLE_REPORT_INDEXED true` (indexing, sitemap, `llms.txt`) and ask for the links from the landing FAQ, sector pages, demo report and outbound (L-04/L-30) (L-33).
- [ ] Decide the DeepSeek price basis (L-10): the book uses DeepSeek's peak-hour list prices; OpenRouter lists V4.1 Flash at $0.15 · $0.60 and V4 Pro at $0.955 · $1.911 (decreases apply immediately).
- [ ] Switch on lifecycle emails, D0–D7 first (L-07, decision I-9: it emails real users). First check that the Cal.com event behind `CALCOM_LINK` offers a 15-minute slot (the D7 email promises a "15-minute setup call"), and read the samples in `tests/email/__snapshots__/templates.test.ts.snap` or ask for an internal sample. Then `scripts/launch/set-app-flag.sh LIFECYCLE_EMAILS_ENABLED true` and redeploy the scheduler at the running commit: `sudo env EVALS_IMAGE_COMMIT=<running sha> scripts/deploy-evals-production.sh`. Later add the rest with `LIFECYCLE_EMAIL_STEPS all` (same two steps). On 2026-10-12 no account is in the cohort (no live free self-serve workspace).
- [ ] Billing shadow week (L-11), started 2026-10-12 ~16:15 UTC with `BILLING_CREDITS_ENABLED=true`, `BILLING_ENFORCE=shadow` (app and workers). Daily, check the scheduler's `billing_shadow_report` line or `billing.shadow_report` (`scripts/billing/shadow-report.ts`, docs/TOOLS.md): every check must be 0; the `billing_shadow_drift` alert emails otherwise. After seven clean days (earliest 2026-10-19), decide enforcement: `BILLING_ENFORCE` is global over every non-contract workspace and all internal workspaces are `contract` (never held), so enforcing "internal workspaces" needs an internal test workspace on a credit plan with granted credits, or a per-workspace enforcement allowlist (not built; L-14/L-15 follow-up). Do not enforce before free workspaces get their monthly allowance (L-14), or new free workspaces cannot start runs. To enforce: `scripts/launch/set-app-flag.sh BILLING_ENFORCE enforce`, then redeploy the workers at the running commit; to undo, the same with `shadow` (L-11.md).
- [ ] Optional, deliverability (L-07): DMARC on `caudals.com` is monitor-only (`p=none`) and aligned for Resend mail from `mail.caudals.com`. After a few weeks of aggregate reports to `postmaster@caudals.com` show only Resend, Zoho and Private Email, change the `_dmarc.caudals.com` TXT record in Cloudflare to `v=DMARC1; p=quarantine; rua=mailto:postmaster@caudals.com; adkim=r; aspf=r`.
- [ ] Decide whether "Create CRM draft" should also push to Warmbly through its API (L-21). Today the draft is an immutable record in the app (`sent: false`) that an operator copies into Warmbly; a direct push needs a scoped Warmbly API key in the app credentials and a small follow-up package. Campaigns stay drafts either way.
- [ ] Before sending outreach from a snapshot, keep to D-13/R3: LinkedIn and introductions first, email only with a written legal basis. The snapshot tool enforces ordinary questions, public information, traffic limits, private 30-day links and no public naming; the message itself is yours.
- [ ] Bring Blog and Newsletter back into the site navigation (L-30, spec §7.7): the Blog link returns once four new posts are live (on 2026-10-12 the newest post in the archive is from 2026-08-12), and the Newsletter link once *The Data Gap* has restarted (last issue No. 1, 2026-07-31). Publish through Ops (`../leads`), then ask an agent to uncomment the two links in `lib/navigation/public-links.ts` and its public-route test.
- [ ] Move the growth targets as gates pass (L-21): `scripts/launch/set-app-flag.sh GROWTH_TARGET_STAGE gate_b` (then `launch_4w`, `launch_12w`), then redeploy the workers (`sudo env EVALS_IMAGE_COMMIT=<sha> scripts/deploy-evals-production.sh`) so the Monday digest uses them. Optional: `OPS_DIGEST_LOCALE es`.
- [ ] Resolve the L-06 drill's help request (workspace "Caudals L-06 drill", already deleted) in Ops → Growth → Help requests; resolving needs an operator login (L-06.md).

## 6. Session log

| Date | Event |
| --- | --- |
| 2026-10-11 | Spec approved for implementation. Brief, tracker and launch scripts (`scripts/launch/*`) added. Phase 1 started |
| 2026-10-11 | Resume mechanism: an hourly session cron (:17) re-enters this file while the orchestrating session is idle; it expires after 7 days (renew by 2026-10-18). Agents started for L-09, L-01 and L-03 |
| 2026-10-12 | Codex resumed serially with an active persisted goal after reading spec v2 end to end. L-01 and L-03 drafts are committed in their worktrees; no dirty files. L-09 app and migration are live, but its workers were never built because `evals-images.yml` is manually disabled. All 24 billing tests, typecheck, changed-file lint and i18n parity pass; production read-only verifier: 7 accounts, zero drift. |
| 2026-10-12 | The prior session cron is historical and has not been verified for this Codex chat. This session exposes no automation or usage-reset scheduling tool. Keep the goal active and checkpoints current; automatic wake-up after a usage reset cannot be configured or guaranteed from these tools. |
| 2026-10-12 | L-01 engineering deployed with migration 081 and required signup acceptance enabled. Legal documents, downloads and mobile widths passed 14 production browser tests; retired routes remain 404. Real entity data and lawyer review remain explicit gates. L-03 draft rebased serially; budget bounds and notification retry fixes under test. |
| 2026-10-12 | L-03 deployed with queue enabled. Controlled production demo completed 8/8 cases in 123 s; server lifecycle events verified in the database. Fallback remains off pending funded access. Preserved concurrent contact-card and background-color changes. Continuing L-02 serially. |
| 2026-10-12 | L-02 deployed and verified (app and workers at `cf8252b`, `ANALYTICS_EVENTS_V2=true`). Claude orchestrator took over from Codex with the instruction to spawn subagents; finished worktrees for L-01, L-02, L-03 and L-09 removed. Next: L-08 (phase 1) and phase 2 packages in parallel. |
| 2026-10-12 | Orchestrator started package agents for L-08, L-10, L-05 and L-33 (worktrees `.worktrees/launch-L-xx`). Worker images are now built with `scripts/launch/build-worker-images.sh` while `evals-images.yml` stays disabled. Hourly resume check at :23 in the orchestrator session (expires 2026-10-19). |
| 2026-10-12 | L-05 deployed (`464e55e`, migration 085) and verified: flag-off 404s, free-mail/disposable refusals, one real direct sign-up through the emailed link (free plan, terms, `account_created` direct), test workspace deleted through the audited workflow. `SELF_SERVE_DIRECT_SIGNUP=true`; no founder actions added. |
| 2026-10-12 | L-05 done (`464e55e`). Agents started for L-04 and L-12 (five running: L-08, L-10, L-33, L-04, L-12). |
| 2026-10-12 | L-08 done (`5244bc1`, migration 107). Sentry live for web and workers; alert timer reinstalled (it had been missing since about 2026-10-03); interim uptime timer on atlantic because atlantic cannot SSH to arctic. MFA enforcement off pending enrolment. |
| 2026-10-12 | L-10 done (`be3a0dc` + fix `d9edc3c`, migration 088). Price book live (revision 1 in effect, revision 2 scheduled 2027-01-01 for Gemini 3.8 Flash), €0 guard on all model routes, estimator API for operators, weekly price check and monthly ECB FX in the scheduler. Revision 2's 30-day notice is due by 2026-12-02 (L-16). |
| 2026-10-12 | L-04 done (`82cf8ee`, fixes `5f52110`, `1302ad6`; no migration). `DEMO_PUBLIC=true`: the free test is the front door in EN and ES, indexed (crawler view, sitemap, `llms.txt`, IndexNow 40 URLs). Send to a colleague verified to the internal address; Spanish funnel link clicks now counted. No founder actions added. |
| 2026-10-12 | L-33 done (`ebc8627`, fix `518175e`; no migration). Example evaluation ("Hogarel", synthetic) live in every workspace at `/workspace/example` (`EXAMPLE_EVALUATION_ENABLED=true`) and as a `noindex` sample report with PDFs at `/en/sample-report` and `/es/informe-de-ejemplo`; workers rebuilt for the PDF label. Founder actions added: name check, then read and index. |
| 2026-10-12 | L-07 done (`8157a37`, migration 087). Branded EN/ES email live (`BRANDED_EMAILS_ENABLED=true`) after one internal send per language; lifecycle sequence deployed in the scheduler and off (`LIFECYCLE_EMAILS_ENABLED=false`, I-9). Deliverability aligned (DKIM, SPF, DMARC `p=none`). Founder actions added: switch on lifecycle email (D0–D7 first); optional DMARC quarantine. |
| 2026-10-12 | L-08 done (`5244bc1`), phase 1 deployed. L-10 done (`be3a0dc`, `d9edc3c`). Agents started for L-06, L-07 and L-11. Six agents hit the 5-hour session limit at ~12:00 UTC (reset 14:40); all resumed at 15:12 from their worktrees. |
| 2026-10-12 | L-04, L-33 and L-07 done. Agents started for L-21, L-17 and L-20. Gate A waits only on L-06. |
| 2026-10-12 | L-11 done (`84c7698`, migration 089): credit holds, captures, releases and meters on the engine path; app and workers deployed as one release. Shadow week started ~16:15 UTC (`BILLING_CREDITS_ENABLED=true`, `BILLING_ENFORCE=shadow`); the internal verification run on the DGX recorded shadow entries with zero drift and every check 0. Enforcement waits for a clean week and L-14's allowance (§5). |
| 2026-10-12 | L-21 done (`d8f80b5`, fix `8f50fb7`, migration 090): `/ops/prospects` snapshots (sandbox, basis record, daily cap, policy triggers, 30-day "external snapshot" links, EN/ES outreach, CRM drafts on click), growth v2 columns, Overview KPIs and demo health, Clients plan/credits/domain filters, Review SLA and bulk approve, Monday 08:00 Madrid digest. Production snapshot of our own fixture verified end to end; one digest delivered to the internal address. Both flags on. |
| 2026-10-12 | Usage limit hit again ~16:00 UTC; agents resumed 20:11. L-11 done (shadow mode live, shadow week started ~16:15 UTC). L-21 done. Agents started for L-29 and L-30. |
| 2026-10-12 | L-06 done (`e4a5ec3`, fix `19264c3`, migration 086): demo sign-ups start their full test set by themselves (one job, plan limit, after the site is read and the chat is not unreachable; scheduler tick 10 s), first-evaluation checklist with ranges, recovery and Get help (ops task + one internal email), activation checklist, two-question welcome in `/ops/growth`, 30-minute activation table. App and workers deployed; `ONBOARDING_AUTOSTART=true`. Production drill: job 11.8 s after sign-up. Example link wired; the example's hide choice moved to the workspace. `DEMO_RUNS_PER_VISITOR` raised to 4 for the drill's demo and restored to 1. |
| 2026-10-13 | L-17 done (`87f88401`, no migration, no flag): report v2 (summary, next steps, fixes), PDF/Word cover and summary first, share page header/referral/open counts; app and workers deployed; production report verified web = PDF = Word, share link opened, counted and revoked. Note: `tests/evals/example-evaluation-guard.test.ts` fails on `main` since L-06 (onboarding route imports `lib/evals/example/flags`). |
| 2026-10-13 | L-12 deployed (`180e34b`, fix `485f2cc`, migration 091) and verified in Stripe test mode on an internal workspace (purchase, replays, auto-recharge, refunds through the admin route, deletion afterwards; zero drift). `BILLING_STRIPE_MODE=test`; `BILLING_CREDITS_ENABLED` unchanged (L-11). |
