# Requester View Plan (app.caudals.com)

## Purpose and Principles
- Give requesters (dataset owners) a focused control center to launch new dataset needs, monitor contributor progress, release payouts, and download vetted files.
- Prioritize clarity and forward momentum: highlight blockers, budget status, QA quality, and download readiness as soon as the requester signs in.
- Keep UI fully aligned with the new app shell guidelines (left rail, bottom user block, responsive layouts, shadcn/ui, real Supabase data, English default + Spanish translation coverage).
- Drive completion by pairing the core workflows (Create → Fund → Review → Download → Iterate) with contextual onboarding walkthroughs and proactive toasts/checklists.

## Data & Integration Baseline
- Supabase tables already in use: `profiles`, `dataset_requests`, `submissions`, `wallets`, `transactions`, `stripe_accounts`, `platform_settings`, `waitlist_signups`, `admin_activity_log`.
- Requester-specific helpers we will either reuse or extend: dataset creation server actions, `getDatasetRequestsByOwner`, `getRequesterDashboardStats`, `getRequesterFundingSummary`, `getDatasetSubmissions`, payout triggers, Stripe payment intents, DigitalOcean Spaces uploads via `lib/storage/client`.
- New/extended data pieces required for this plan:
  - `dataset_templates` table for reusable project blueprints (`id`, `title`, `prompt`, `category`, `data_type`, `default_requirements`, `default_reward_amount`).
  - `dataset_exports` table to orchestrate dataset download jobs (`id`, `dataset_request_id`, `requested_by`, `status`, `file_url`, `size_bytes`, `checksum`, `progress`, `error`, `created_at`, `completed_at`).
  - `dataset_activity` table capturing requester actions (`id`, `dataset_request_id`, `actor_id`, `actor_role`, `action`, `metadata`, `created_at`).
  - `requester_onboarding_progress` table (tracks checklist state with columns `user_id`, `steps` JSONB, `completed_at`).
  - `requester_org_settings` table for company/billing info, `requester_api_keys` table for integration keys, and `support_tickets` table for help desk threads.
  - `requester_tours` JSON config stored in `platform_settings` for guided walkthrough copy.
- Payments stay Stripe-first: requesters deposit/fund budgets via Stripe (card or ACH), ledger mirrored in `transactions` + `wallets`. Payouts triggered automatically from server actions when submissions approved (requester sees ledger + status only, no manual payout button).
- Files: DO Spaces bucket `dataset-files` (already used by contributors) + `dataset-exports` for zipped downloads; preview via signed URLs/Range requests.

## App Shell (Requester)
- App shell/laout was already implemented in previous steps.
- Sidebar sections (default order): Overview, New Dataset, My Datasets, Files & Downloads, Billing, Analytics, Onboarding, Settings, Support.
- Top bar: breadcrumbs, global search (datasets/submissions/invoices), notification bell (pending approvals requiring requester action), quick-create button (opens dataset builder), command palette (⌘K) exposing requester actions (Create dataset from template, Reopen draft, Invite contributor, Start download export, Switch language, Contact support).

## Navigation Map & Relationships
- **Overview** (dashboard) -> quick stats for datasets, budgets, submissions, onboarding progress.
- **New Dataset** -> multi-step wizard with templates, funding, requirements, QA.
- **My Datasets** -> table of all dataset requests with statuses and KPIs.
- **Dataset Detail** (drill-in) -> tabs for Summary, Contributors & QA, Budget & Funding, Files/Exports, Activity timeline. Inside of 'My datasets' page.
- **Downloads** -> centralized export/download management.
- **Billing** -> wallet, cards, invoices, funding history, commission breakdown.
- **Analytics** -> dataset-level trends, contributor performance, timeline metrics.
- **Onboarding / Walkthrough** -> checklists, product tours, resource links. This wont go in the sidebar but will appear when the user is on the first time using the platform.
- **Settings** -> profile/org, notifications, security, locale, API keys.

## Page Plans

### 1) Overview (Dashboard)
- **Frontend / UX**
  - KPI cards: active datasets, submissions awaiting review, budget remaining vs committed, latest payout total. Each card shows trend run (7-day delta) and CTA ("Review submissions", "Add funds").
  - Area chart (shadcn charts) showing submissions received per day vs approvals for last 30 days.
  - Timeline section "Next actions": list upcoming deadlines, stale drafts, pending approvals, download-ready exports.
  - Mini onboarding widget showing checklist state and quick links to finish onboarding (component reused from onboarding page but condensed).
  - Notification drawer summarizing issues (budget low, verification required, payout blocked) for immediate action.
- **Backend / Data**
  - Server action `getRequesterDashboardStats(userId)` aggregating: counts (active datasets, drafts, pending approvals), totals from `transactions` (funded vs spent), wallet balance, outstanding invoices.
  - Chart data from `submissions` grouped by status & day filtered by requester-owned datasets.
  - Next actions derived from `dataset_requests` deadlines, `submissions` statuses, `dataset_exports` statuses, `requester_onboarding_progress` pending steps.
  - Notification data referencing `stripe_accounts` (needs requirements) and `platform_settings` thresholds (budget_min). Revalidate dashboard whenever dataset/submission/invoice mutations occur.

### 2) New Dataset Builder
- **Frontend / UX**
  - Multi-step wizard (shadcn steps + forms) with sections: Template → Details → Requirements → Budget & Funding → Review.
  - Template picker grid showing curated templates (cards showing dataset type, use case). Option to start blank; typing a dataset description triggers AI-assisted prompt (call to `llm` later) but plan for hooking.
  - Detail step collects title, description, data category, data type, languages, quality level. Requirements step includes `quality_criteria`, `instructions`, sample attachments (upload to Spaces), auto-saved drafts.
  - Budget step handles reward, samples needed, funding model (upfront/per-contribution), calculates total budget + commission, collects payment (Stripe payment element) or allows saving draft and funding later.
  - Review step summarizes all info, allows confirm + publish; progress indicator persists.
  - Inline walkthrough tooltips guiding user (onboarding integration).
- **Backend / Data**
  - Draft dataset stored to `dataset_requests` with `status='active'` or `draft` (add `draft` value?). Need to extend `dataset_status` enum to include `draft`. We'll add in migrations.
  - Templates pulled from `dataset_templates`; apply defaults when chosen.
  - File uploads handled via DO Spaces signed upload helper (existing `lib/storage`). Save returned URLs into `attachments` JSON column (new column `attachments JSONB`?). plan to add `attachments` column.
  - Funding step triggers `createFundingIntent(datasetId, amount)` server action -> Stripe PaymentIntent (via Supabase Edge or API route), storing `stripe_payment_intent_id`, `total_budget`, `payment_status`. On success insert `transactions` records + update `wallets`.
  - Auto-save uses server action `saveDatasetDraft` triggered on blur debounced; uses `revalidateTag('requester-datasets')`.

### 3) My Datasets (Library)
- **Frontend / UX**
  - Data table with multi-select, filters by status (draft/active/closing/completed), category, funding model, payment status, creation date. Search by title/id.
  - Columns: title + status badge, samples progress (collected/needed with progress bar), reward per submission, total budget funded/spent, approval rate, updated date, CTA button to "Review" or "Add funds" depending on state.
  - Bulk actions: archive, pause/resume, duplicate as new dataset, export summary PDF.
  - Quick filter pills for "Needs funding", "Pending review", "Download ready".
- **Backend / Data**
  - Query `dataset_requests` for `created_by=currentUser`, join aggregated counts from `submissions`, join `transactions` to compute spent vs funded. Use server action returning paginated results + filters mapping to SQL queries.
  - Bulk actions call server actions `bulkUpdateDatasetStatus`, `duplicateDatasetRequest`, `archiveDatasets` (new `archived_at` column?). Each logs to `admin_activity_log`? maybe `requester_activity_log`? At minimum record to `dataset_activity` table (to add). We'll plan to reuse `admin_activity_log` but with `acted_by` default? but better new `dataset_activity` table to track actions by requesters. Add plan: `dataset_activity` table (id, dataset_id, actor_id, role, action, metadata, created_at). Mention in Data baseline? We didn't earlier but can mention now? Should add to Data baseline? we omitted but can mention new table now. Need to update earlier baseline to include `dataset_activity` addition. We can mention under new data pieces to add (should update earlier section). Could include in plan by referencing new table. but we already enumerated new data pieces; can add additional bullet? maybe add editing to file? need to include that addition near top? Could edit file to include? Already wrote top of plan w new data pieces list of 4 items. Should add `dataset_activity` there. Need to edit file to include bullet. We'll adjust after writing entire plan. So note to modify earlier section to include this additional table. We'll do after writing plan? easier to include now by editing file? but unstoppable. For now continue plan referencing new table; later update top to mention new data piece. We'll note intangible for editing later using apply patch? We'll see.
  - Duplicate action clones dataset row + attachments/resets statuses, sets `draft` status. Pause/resume flips `status` between `paused`/`active`.
  - PDF summary uses server action generating document (node) describing dataset + progress, accessible via DO Spaces.

### 4) Dataset Detail Workspace
- **Frontend / UX**
  - Layout with sticky header showing dataset title, status, sample progress, funding progress, quick actions (Add funds, Pause, Close dataset, Duplicate, Share public brief).
  - Tabbed content (shadcn tabs):
    1. **Summary** – description, requirements, attachments, timeline (activity feed from `dataset_activity`), highlight of pending submissions + due dates.
    2. **Contributors & QA** – table of submissions requiring review, with inline Accept/Request changes/Reject flows; ability to open contributor profile, leave notes, tag for follow-up. Bulk approvals available with confirmation if budget sufficient.
    3. **Budget & Funding** – gauge showing funded vs spent, list of funding transactions, ability to add funds (Stripe) or adjust commission override.
    4. **Files & Exports** – preview latest files, request aggregated download, view export history statuses, download via streaming link, ability to request zipped by filters.
    5. **Automation** – toggles for auto-approve thresholds, QA sampling, notifications, dataset closing rule.
  - Right rail (on desktop) showing watchers/collaborators, contact support, onboarding tips.
- **Backend / Data**
  - Summary tab pulls dataset row, attachments, arrays for `quality_criteria` etc; timeline from `dataset_activity` + `admin_activity_log` filtered by dataset.
  - Contributors tab queries `submissions` joined with `profiles` and `transactions`. Inline actions call `reviewSubmission({id, status, notes})` server action which ensures dataset budget and triggers payouts when approving (calls Stripe/ledger). Provide streaming preview via signed DO URLs (prefetch metadata). Add ability to request resubmission (set status `needs_changes`?). Need to extend `submission_status` enum to include `needs_changes`. Add plan to update schema accordingly.
  - Budget tab uses `transactions` aggregated by type, `wallets` for available funds; Add funds action calls same `createFundingIntent` but referencing dataset. Commission override stored on dataset row (already `commission_percentage`).
  - Files & Exports tab reads `dataset_exports` table; request export action inserts row status `pending`, triggers server action to queue background job (Edge function) that streams contributions from DO spaces, writes zipped file to Spaces, updates row with `file_url`, `size_bytes`, `checksum`. Download uses signed URL with `Range` header support/resumable (via DO). Provide `generateSignedExportUrl(exportId)` action verifying dataset ownership.
  - Automation tab writes to `dataset_settings` JSON column (new) storing config like `auto_approve_threshold`, `closing_rule`. We'll add column to `dataset_requests` (jsonb) for `automation_config`.

### 5) Files & Downloads Hub
- **Frontend / UX**
  - Table listing all exports across datasets with columns: dataset, export type (full, filtered, delta), size, created date, expires, status, progress. Filter by dataset/status.
  - Actions per row: Download (signed link), Copy share link (if shareable), Regenerate, Cancel.
  - Large download handling: when >5GB show instructions for CLI download/resumable link; show "Background prep" state with progress ring. Provide ability to request new export targeted by filters (modal) selecting dataset, timeframe, file types. Provide doc on verifying checksums.
- **Backend / Data**
  - Query `dataset_exports` joined with dataset metadata. For new exports, server action `requestDatasetExport({datasetId, filters})` ensures dataset ownership, enqueues job (Edge or background) storing config in `dataset_exports.metadata` JSON. Use DO multipart upload for >5GB zipped files; generate temporary signed URLs stored in table.
  - Resumable downloads: provide endpoint that proxies DO signed URLs with HTTP Range support; for CLI option, generate `aws s3 cp` command with `--continued`. Store `checksum` to verify (calc on job using streaming hash) and expose via API.
  - Cancel/resume modifies `dataset_exports.status`. Completed exports automatically expire after TTL (set `expires_at`), server action to extend TTL by rewriting DO signed URL.

### 6) Billing & Funding
- **Frontend / UX**
  - Tabs: `Wallet & Balances`, `Payment Methods`, `Funding History`, `Invoices & Receipts`.
  - Wallet card showing current wallet balance, reserved budget, upcoming charges; CTA to "Add funds" (opens Stripe payment sheet) or "Withdraw unused" (if policy allows; for MVP, show request form).
  - Payment methods page using Stripe Elements to manage cards/bank accounts (via SetupIntent). Display obfuscated info, default selection.
  - Funding history table referencing `transactions` (type dataset_funding, platform_fee, refund). Provide filters, CSV export.
  - Invoices tab shows invoices generated upon funding/invoice requests with status, amount, download link; ability to request custom invoice (dialog collects company info, PO number) -> generated PDF via Resend.
- **Backend / Data**
  - Wallet info from `wallets` + aggregated `transactions`. Add server action `addFunds` calling Stripe PaymentIntent with `metadata` referencing dataset or wallet top-up -> update ledger on webhook.
  - Payment methods managed through `stripe_customer_id` stored per user (migration 017). Need to ensure we create customer automatically (server action `ensureStripeCustomer`). Methods listing via Stripe API; storing minimal metadata in `payment_methods` table? Not necessary; call Stripe and cache.
  - Invoices from `transactions` referencing `invoices` table (if added with admin). For requesters, show subset filtered by user_id. Download link from DO `invoice-pdfs` bucket.
  - Export history uses server action to stream CSV from `transactions` (owner-specific). All updates logged in `dataset_activity` when affecting dataset budgets.

### 7) Analytics
- **Frontend / UX**
  - Provide multi-range filter (7/30/90/custom). Show area chart for submissions over time vs approvals, stacked bar for contributor quality tiers, doughnut for dataset categories, line chart for budget burn vs plan.
  - Cohort table for top contributors (anonymized IDs) showing contributions, acceptance rate, average payout time; ability to invite to future dataset (CTA -> open dataset builder with pre-filled contributor allowlist).
  - Export metrics as CSV and shareable link for stakeholders.
- **Backend / Data**
  - Aggregations using Supabase SQL (views or RPC) to group `submissions` by day/status, `transactions` by type, dataset categories. Might create materialized view `requester_metrics_daily` for faster loads.
  - Contributor table data from `submissions` + `profiles`, limited to dataset_id belonging to requester; exposures only aggregated to comply with privacy.
  - Invite action triggers server action `inviteContributor(datasetId, contributorId)` storing allowlist in `dataset_settings` JSON + sending email via Resend.

### 8) Onboarding & Walkthrough
- **Frontend / UX**
  - Dedicated page with hero state, progress bar, steps list: (1) Complete profile, (2) Create first dataset, (3) Fund dataset, (4) Review submissions, (5) Download data. Each step has CTA/resume button and status (Locked/In progress/Done).
  - Provide embedded walkthrough video (Spaces) and contextual tips. Offer "Restart tour" button to re-run product tour overlays.
  - Show support channel info and best practices.
- **Backend / Data**
  - Steps stored per user in `requester_onboarding_progress` table; server action `updateOnboardingStep(stepId, status)` called whenever user completes actions (hooks inside dataset creation, funding, review, download flows).
  - Tour definitions stored in `platform_settings` entry `requester_tour_config`. On restart, set progress statuses to `in_progress` and deliver overlay config to frontend.
  - When all steps complete, mark `completed_at` and show celebration (Confetti) + optional referral CTA.

### 9) Settings
- **Frontend / UX**
  - Sections: `Profile`, `Organization`, `Notifications`, `Security`, `API & Integrations`.
  - Profile: update name, avatar (DO Spaces), bio, timezone, preferred language (persist for i18n). Organization: company info, billing contact, tax IDs, default PO number, collaboration invites (invite teammates to view dataset if multi-seat). Notifications: toggles for email/push/per dataset. Security: passwordless settings, 2FA toggles (On/Off), session management. API: display requester-specific API keys for pulling dataset exports programmatically.
- **Backend / Data**
  - Profile updates use existing `updateProfile` action writing to `profiles` table. Add columns for timezone, company_name, tax_id, contact_email (if not existing) via migration. Avatar uploads via DO Spaces. Language preference stored either in `profiles.locale` (new column) to align with i18n.
  - Organization data stored in `requester_org_settings` table (`user_id`, `company_name`, `tax_id`, `billing_address`, `default_currency`, `po_required`).
  - Notification settings stored JSON in `profiles.notification_preferences` column. Use server action to update and send changes to notification service.
  - Security: integrate Supabase auth features (OTP/2FA). Provide session list by calling Supabase admin? for security we can use `auth.admin.listUserSessions`. Provide logout-other-sessions action.
  - API keys stored hashed in `requester_api_keys` table (id, user_id, key_hash, last_used_at, scopes). Provide generate/revoke flows; actual key value shown once.

### 10) Support & Resources
- **Frontend / UX**
  - Provide "Need help?" cards (Contact manager, Slack community, Documentation). Show open support tickets (if we track) plus rejection follow-ups requiring user responses.
  - Embedded FAQ accordion, quick link to data policies, ability to schedule call (Calendly embed) and open chat.
  - Show SLA indicator for contact method (avg response in <24h) and highlight account manager contact.
- **Backend / Data**
  - Support tickets pulled from `support_tickets` table (if not existing, plan to add). Minimal version uses `waitlist_signups`? better to create `support_tickets` table (id, user_id, subject, status, priority, created_at). We'll plan to add table to handle new contact requests. Submissions requiring follow-up derived from `submissions` with `status='rejected'` and `notes IS NOT NULL`.
  - Contact form posts to server action `createSupportTicket` (inserting row, sending email to support). Slack/Calendly integration via webhook/resched.

## Cross-cutting & System Considerations
- **Role Guards & Layout**: All requester routes inside `(app)/(requester)` segment using server components verifying `session.role === 'requester' || admin`. Non-requesters redirected.
- **Command Palette**: reuse shadcn cmdk; dataset search hitting server action `searchRequesterEntities(term)` (FTS on `dataset_requests`, `submissions`). Provide actions to start downloads, open builder, open billing.
- **Search**: global search component hitting server action returning dataset/submission/invoice matches.
- **Dataset Preview & Downloads**: All preview modals fetch real file metadata from DO spaces; use streaming preview for supported MIME (image/video/audio/text). Provide fallback `Download chunk` button for huge files using HEAD to show size, Range requests for streaming; integrate background exports via `dataset_exports` table.
- **Onboarding Hooks**: each major action (profile completion, dataset publish, funding, first approval, first download) triggers `updateOnboardingStep` and event log in `dataset_activity`.
- **Translations**: all UI strings must be wrapped in `t('key')`; new English keys added to `translations-source.json`, Spanish in `translations-es.json`. Provide plan for flush to `i18n` context.
- **Responsive Behavior**: For mobile, collapse sidebar into drawer, convert tables into cards with essential info. Provide quick tabs for statuses. All forms support mobile interactions.
- **Accessibility**: ensure keyboard nav, focus traps for modals, aria-live for status updates.
- **Caching/Revalidation**: Use Next.js server actions with `revalidateTag` per dataset, per exports, per billing. Use streaming data for long queries via suspense.
- **Telemetry**: log critical interactions to `dataset_activity` (INSERT on actions) and optional analytics pipeline (Segment) for future improvements.

## Implementation Outline (Post-plan)
1. Scaffold requester layout + navigation (shadcn shell, guard, i18n) and add new DB columns/enums/tables (dataset_templates, dataset_exports, dataset_activity, requester_onboarding_progress, requester_org_settings, requester_api_keys, support_tickets, dataset_requests.automation_config, submissions status extension, dataset status `draft`).
2. Build Overview dashboard (stats, charts, onboarding widget) with real Supabase queries.
3. Implement dataset builder wizard with auto-save drafts, template picker, Stripe funding integration.
4. Implement My Datasets table + dataset detail workspace (tabs, submissions moderation, automation settings, activity timeline).
5. Implement Files & Downloads hub powered by dataset export jobs + DO streaming/resumable downloads.
6. Build Billing & Funding module (wallet, payment methods, invoices) w/ Stripe + ledger sync.
7. Build Analytics page (charts + contributor table) using aggregated Supabase queries/materialized views.
8. Implement Onboarding page + checklists + product tour overlays.
9. Implement Settings (profile/org/notifications/security/API keys) + Support center.
10. Wire cross-cutting components (command palette, search, notifications, i18n strings) and finalize responsive/polish/testing.
11. Make sure the tranlations are natural and organic spanish. Do not translate Caudals, dashboard, or similar words that are generic for both languages
