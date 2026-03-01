# Architecture Map

Last updated: 2026-03-01

This map links key routes to UI components, server actions/APIs, and primary DB tables so ownership is explicit during implementation and debugging.

## 1) Requester Dataset Lifecycle

| Layer | Ownership |
| --- | --- |
| Routes | `app/(app)/requester/page.tsx`, `app/(app)/requester/datasets/*`, `app/(app)/requester/files/page.tsx`, `app/(app)/requester/support/*` |
| Components | `components/requester/dashboard/*`, `components/requester/datasets/*`, `components/requester/settings/*`, `components/requester/support/*` |
| Actions | `lib/actions/requester-actions.ts`, `lib/actions/submission-actions.ts`, `lib/actions/payment-actions.ts` |
| APIs | `app/(app)/api/upload/route.ts`, `app/(app)/api/analytics/track/route.ts` |
| Tables | `dataset_requests`, `dataset_activity`, `dataset_exports`, `submissions`, `support_tickets`, `requester_onboarding_progress`, `requester_org_settings`, `requester_api_keys`, `transactions` |

Core flow:
1. Requester creates/edits dataset brief (`createRequesterDataset`, `updateRequesterDataset`).
2. Dataset status updates and activity logs persist to `dataset_requests` + `dataset_activity`.
3. Funding changes move through payment actions and update `transactions` + dataset payment fields.
4. Exports are requested/retrieved through `dataset_exports` lifecycle.

## 2) Contributor Contribution Lifecycle

| Layer | Ownership |
| --- | --- |
| Routes | `app/(app)/contributor/*`, `app/(app)/browse/*` |
| Components | `components/contributor/*`, browse/contribution dialogs |
| Actions | `lib/actions/contributor-actions.ts`, `lib/actions/submission-actions.ts`, `lib/actions/payment-actions.ts` |
| Tables | `submissions`, `dataset_requests`, `wallets`, `transactions`, `contributor_settings` |

Core flow:
1. Contributor discovers approved/funded datasets.
2. Contributor submits payload/files to `submissions`.
3. Admin review sets submission status.
4. Approved submissions flow into payout logic and wallet timeline visibility.

## 3) Admin Moderation and Ops

| Layer | Ownership |
| --- | --- |
| Routes | `app/(app)/admin/*` |
| Components | `components/admin/*`, admin dashboard cards/tables |
| Actions | `lib/actions/admin-actions.ts`, moderation helpers in requester/submission actions |
| Tables | `admin_activity_log`, `dataset_requests`, `submissions`, `support_tickets`, `waitlist_entries`, `transactions`, `stripe_accounts`, `product_analytics_events` |

Core flow:
1. Admin triages requests/submissions/support queues.
2. Mutations write consistent audit events to `admin_activity_log`.
3. Admin analytics aggregates users, datasets, submissions, and funnel conversion.
4. Payment ops surfaces payout failures/reconciliation paths.

## 4) Payment and Webhook Spine

| Layer | Ownership |
| --- | --- |
| Routes | `app/(app)/api/webhooks/stripe/route.ts` |
| Actions | `lib/actions/payment-actions.ts` |
| Services | `lib/stripe/server.ts`, `lib/supabase/admin.ts` |
| Tables | `transactions`, `wallets`, `stripe_accounts`, `dataset_requests`, `stripe_webhook_events` |

Core flow:
1. Client creates payment intent (wallet funding or dataset funding).
2. Stripe webhook receives events and deduplicates via `stripe_webhook_events`.
3. Ledger transaction rows are inserted/updated.
4. Dataset and wallet balances are synchronized.

## 5) Public Surface and Conversion Funnel

| Layer | Ownership |
| --- | --- |
| Routes | `app/(home)/page.tsx`, `app/(home)/pricing/page.tsx`, `app/(home)/docs/page.tsx`, `app/(home)/trust/page.tsx`, legal pages |
| Components | `components/landing/*`, `components/marketing/*`, `components/analytics/funnel-visit-tracker.tsx` |
| APIs | `app/(app)/api/analytics/track/route.ts`, public intake APIs (`waitlist`, `collaborations`) |
| Tables | `product_analytics_events`, `waitlist_entries` |

Funnel events:
- `funnel_visit`
- `funnel_signup`
- `funnel_dataset_created`
- `funnel_fund`

## 6) Cross-Cutting Infrastructure

| Concern | Ownership |
| --- | --- |
| Role-based access and redirects | `proxy.ts`, `lib/auth/route-guard.ts`, `lib/middleware/admin-check.ts` |
| Design system and shell primitives | `app/globals.css`, `components/ui/*`, `components/app/*` |
| Security controls | `lib/security/rate-limit.ts`, upload guardrails, webhook replay protection, `next.config.js` headers/CSP |
| Test harness | `vitest.config.ts`, `playwright.config.ts`, `e2e/*`, `lib/actions/*.test.ts` |

## 7) Source of Truth Notes

- Task-level execution state and follow-up planning live in `docs/project-tracker.md`.
- Deployment and release gating live in:
  - `docs/release-checklist.md`
  - `docs/staging-parity-checklist.md`
  - `docs/db-runbook.md`
