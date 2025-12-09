# Admin View Plan (app.caudals.com)

## Purpose and Principles
- Give administrators a complete control center for trust/safety, payouts, pricing, featured ads, and platform configuration without touching code.
- Keep UI unified with the new app shell (left rail with grouped navigation, bottom user block + compact role switcher visible only to admins).
- Use real data only: Supabase tables (`dataset_requests`, `submissions`, `profiles`, `wallets`, `transactions`, `stripe_accounts`, `platform_settings`, `admin_activity_log`, `waitlist_signups`) and Stripe/Spaces for payments/files.
- Leverage shadcn/ui for shell, tables (multi-select, bulk actions, filters), dialogs, forms, charts; shadcn command palette for global admin actions; responsive by default; i18n (en/es) for every string.

## Data & Integration Baseline
- Supabase queries via server actions using `createClient` (session-aware) and `createAdminClient` (service key) for privileged admin operations + revalidation.
- Payments: Stripe Connect (payouts) + platform fee (`commission_percentage` on `dataset_requests`, global override in `platform_settings`), wallet/transaction ledger (amounts in cents), Stripe customer ids (`wallets.stripe_customer_id`), bank metadata (`stripe_accounts.bank_*`).
- Storage: DigitalOcean Spaces via `lib/storage` for dataset images and file previews; Supabase bucket `dataset-images` already provisioned.
- Audit: `admin_activity_log` used to log approvals/rejections/payouts.
- Existing helper functions: `is_admin()`, pending dataset/submission functions, payment actions (payouts, onboarding, invoices), dataset helpers. Will extend where needed rather than reusing old dashboard UI.
- Include sort, search, filters, pagination, bulk actions, etc where needed.

## App Shell (Admin)
- Left sidebar with grouped nav: Overview, Requests, Submissions, Payments, Analytics, Users, Ads, Settings, Activity/Logs, Support/Waitlist.
- Command bar (⌘K/ctrl+k) with admin actions (approve next pending, refund tx, open dataset, open user, toggle locale). Respect role guard.
- Top part of the dashboard content: breadcrumbs, search (datasets/users/transactions), notification bell (pending items counts), CTA.

## Navigation Map (Admin)
- Overview (Dashboard)
- Requests (all + pending queue + detail)
- Submissions (moderation queue + detail)
- Payments
  - Payment Ops (payments, payouts, refunds)
  - Commissions & Fees
  - Invoices & Plans (custom pricing generator for agency-like pricing plans)
- Analytics
- Users
- Featured Ads
- Platform Settings
- Activity & Audit Log (logs all admin actions)
- Support & Waitlist (support requests from users)

## Page Plans

### 1) Overview (Dashboard)
- Frontend/UX
  - Hero stats: pending requests, pending submissions, total users, approved datasets, payout queue size; shadcn cards with trend pills.
  - Charts: area chart (requests/submissions/users per day, last 30d), bar chart for approvals vs rejections.
  - “Latest moderation” table from `admin_activity_log`, clickable rows.
  - Spotlight panel for “Highest priority dataset” (oldest pending or most submissions waiting).
  - Quick actions: Approve next request, Open payout queue, Create featured ad, Export CSV.
- Backend/Data
  - Queries: `getAdminDashboardStats`, `getAdminAnalyticsSummary`, `admin_activity_log` latest 20.
  - Highlight: `dataset_requests` ordered by `approval_status` pending then featured flag.
  - Export: server action to stream CSV (datasets/submissions/users) using Supabase admin client.

### 2) Requests (Approval + Library)
- Frontend/UX
  - Tabs: Pending, Approved, Rejected, All. Data table with multi-select, bulk approve/reject, bulk status update (active/paused/completed), bulk feature/unfeature.
  - Columns: title, creator, category/data type, samples needed/collected, reward, status, funding model/payment status, approval status, created/updated.
  - Filters: category, data type, status, approval status, funding model, date range, text search.
  - Row actions: View detail (side panel), approve/reject with notes (dialog), edit metadata (drawer), feature toggle, open dataset public page.
  - Detail view: cover image, description, requirements, quality criteria, funding summary, commission %, submissions summary, activity timeline.
- Backend/Data
  - Queries: `dataset_requests` with join `profiles` (created_by) and counts from `submissions`; use RLS via admin.
  - Bulk actions: use `adminBulkUpdateDatasetApproval`, `adminBulkUpdateDatasetStatus`, `adminBulkUpdateDatasetRequests`, `adminBulkDeleteDatasetRequests`; log actions to `admin_activity_log`.
  - Single actions: `approveDatasetRequest`, `rejectDatasetRequest`, `adminUpdateDatasetRequest`, `adminUpdateDatasetApproval`.
  - Funding data: show `total_budget`, `paid_amount`, `payment_status`, `commission_percentage`; surface unpaid/partial flags.
  - Storage: image upload via Spaces (`dataset-images` bucket) on edit.

### 3) Submissions (Moderation Queue)
- Frontend/UX
  - Table with thumbnails (if image/video/audio preview available via Spaces presigned URL), contributor, dataset title, status, submitted date, notes.
  - Filters: dataset, contributor, status, date, has-notes, reward range.
  - Bulk approve/reject with optional notes; approve with payout preview (net after fees) and remaining funded budget indicator.
  - Detail drawer: metadata JSON viewer, file list with streaming preview (Range requests) and download signed URLs; history of status changes.
- Backend/Data
  - Query `submissions` join `dataset_requests` (title, reward_amount, currency, paid_amount, payment_status) and `profiles`.
  - Actions: `approveSubmission` (calls payout when funded), `rejectSubmission`, bulk approve to reuse payout logic per item (ensure idempotency).
  - File preview/download: signed DO Spaces URLs with range support; for large assets provide “request background download” job record (queue table to create) and email link when ready.
  - Audit: log to `admin_activity_log`.

### 4) Payments & Billing
- Frontend/UX
  - Sub-tabs: Payment Ops, Commissions & Fees, Invoices & Plans.
  - Payment Ops: transactions table (type, direction, amount, fee, status, reference_id, dataset/submission links); filters (status/type/date/user). KPIs (volume, platform fee total, payouts, pending payouts). Actions: mark failed/complete (service), retry payout, issue refund, create manual adjustment.
  - Payout queue: list pending `submission_payout` transactions; CTA to trigger Stripe transfer sync.
  - Commissions & Fees: editable global platform fee (stored in `platform_settings`), override per dataset (`commission_percentage`), simulation calculator.
  - Invoices & Plans: generate invoice for dataset funding or custom plan, produce PDF stored in Spaces, email to requester (Resend). Table of generated invoices with status/links.
- Backend/Data
  - Transactions: `transactions` join `profiles`, optional `dataset_requests`/`submissions`; use admin client for status updates.
  - Payout sync: reuse `payoutToContributor` and add action to resync wallet/balance and update transaction status.
  - Fee settings: `platform_settings` key `platform_fee_percentage`; dataset overrides stored on `dataset_requests`.
  - Invoice generation: server action to create Stripe invoice items or PDF (node library) and upload to Spaces, record entry in `platform_settings` or new `invoices` table (to add) with requester id, amount, currency, line items, stripe invoice id, download_url, status.
  - Refunds: server action to call Stripe refund by `reference_id` and insert compensating transaction.

### 5) Analytics
- Frontend/UX
  - Charts: area (requests/submissions/users per day), stacked bars (approval funnel), line (revenue vs payouts), donut (role mix, dataset categories), table for top creators/contributors by volume.
  - Filters: time range, role, category, status.
- Backend/Data
  - Supabase aggregates (group by) for roles, statuses; daily series built server-side to reduce client work.
  - Revenue/payout series from `transactions` (filter status=completed).
  - Cache via server actions + revalidate on write operations.

### 6) Users & Roles
- Frontend/UX
  - Table of profiles with role badge, email, created date, datasets count, submissions count, payout status, Stripe status.
  - Actions: change role (contributor/requester/admin) with confirmation, impersonate as requester/contributor (admin-only session switch), reset email invite link, view user detail drawer.
  - User detail: recent activity, wallet balances, connected account status, KYC requirements (from Stripe), datasets owned, submissions made.
- Backend/Data
  - Queries: `profiles` + computed counts via RPC or client-side aggregate (`dataset_requests` by created_by, `submissions` by contributor_id).
  - Role update: `updateUserRole` action; revalidate affected pages.
  - Stripe status: fetch from `stripe_accounts` and Stripe API (service key) and persist via `upsertStripeAccountRecord`.
  - Impersonation: create server action to set admin “acting_as” cookie/session to target user (guarded, logged to `admin_activity_log`), relying on Supabase service role.

### 7) Featured Ads
- Frontend/UX
  - Grid/list of featured slots with preview (image/video), CTA target (dataset or external URL), status, scheduling window, impressions/clicks if available.
  - Form to create/edit ad with upload (Spaces), schedule, target, priority, locale targeting.
  - Toggle to feature existing dataset (quick action from Requests table).
- Backend/Data
  - Add table `featured_ads` (id, title, image_url, target_type dataset/external, target_id/url, starts_at, ends_at, priority, locale, created_by, status, metrics JSON).
  - CRUD server actions using admin client; on feature existing dataset, also mark `dataset_requests.featured=true`.
  - Metrics: store click/impression events in JSON or `ad_events` table (optional minimal plan: increment counters in `featured_ads.metrics`).

### 8) Platform Settings
- Frontend/UX
  - Form sections: Branding (logos, colors, links), Email settings (from address, template toggles), Fees (global platform fee), Limits (max upload size, allowed MIME), Legal copy links, Feature flags (enable onboarding, enable resumable downloads).
  - Use shadcn forms with optimistic save, inline validation, dirty state indicator.
- Backend/Data
  - Store in `platform_settings` key/value; server actions `getPlatformSettings`, `upsertPlatformSetting`.
  - File uploads (logo) via Spaces; store URLs in settings.
  - Revalidate app shell/theme when brand settings change.

### 9) Activity & Audit Log
- Frontend/UX
  - Table timeline with action_type, target, admin, notes, timestamp; filters by action/target/date/admin.
  - Export CSV; detail drawer shows related dataset/submission.
- Backend/Data
  - Query `admin_activity_log` join `profiles`; new helper to log all admin server actions (wrap actions with logger).
  - Export uses streaming CSV server action.

### 10) Support & Waitlist
- Frontend/UX
  - Waitlist table (`waitlist_signups`) with status pipeline (pending/contacted/qualified/converted), filters, inline status update, notes, resend email.
  - Support inbox placeholder replaced with real data: show most recent rejections/notes that require follow-up; CTA to email requester.
- Backend/Data
  - Query `waitlist_signups`; update status action with audit log; resend email via Resend template using stored metadata.
  - “Follow-up” list derived from `dataset_requests` rejected with notes, and submissions rejected with notes.

### 11) Cross-cutting
- Command palette: uses shadcn cmdk; queries live search over datasets/users/transactions (Supabase full-text) and lists actions (approve next, open payout queue, create invoice, toggle locale). Respect admin guard.
- Search bar: unified search hitting server action returning top results for datasets/users/transactions/ads.
- i18n: wrap all strings with translator; add keys to `lib/i18n/es.json`. Default English text stays inline.
- Responsive.
- Accessibility: keyboardable tables/actions, focus traps in dialogs, announce status changes.


## Implementation Outline (for next steps)
1) The new app layout/app shell is already implemented. It was implemented in previous steps.
2) Build Overview + analytics summaries (reuse `getAdminDashboardStats`/`getAdminAnalyticsSummary`).
3) Requests module (tables, detail, approvals, bulk actions, feature toggle, funding info).
4) Submissions moderation with payouts check + file preview/resumable download hooks.
5) Payments & Billing (transactions table, payout queue, commission settings, invoice generator).
6) Featured Ads CRUD + integration with datasets.
7) Users & Roles management with Stripe status + impersonation.
8) Platform settings + audit log + waitlist/support.
9) Wire command palette/global search, revalidation, and translations.
