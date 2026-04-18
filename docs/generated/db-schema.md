# Database Schema Snapshot

Last reviewed: 2026-04-18

## Status
The current database schema is legacy from the pre-pivot product. It still contains tables for the retired individual-upload and old marketplace model.

Do not build new B2B marketplace behavior on these legacy domains without an explicit migration/replatforming phase.

## Core Tables
- `profiles`
- `dataset_requests`
- `submissions`

## Legacy Company/App Domain
- `dataset_templates`
- `dataset_activity`
- `dataset_exports`
- pre-pivot onboarding/settings/API-key tables retained in migration history
- `support_tickets`

## Admin/Operations
- `admin_activity_log`
- `platform_settings`
- `waitlist_signups`
- `abuse_rate_limits`

## Payments and Ledger
- `wallets`
- `transactions`
- `stripe_accounts`
- `stripe_webhook_events`
- `payment_compliance_records`

## How to Refresh
Use migration history in `supabase/migrations/` and runtime inspection with Supabase tooling.
Do not store secrets in this file.

## Target Future Domains
Future B2B marketplace migrations should model:
- organizations and contacts,
- buyer dataset briefs,
- supplier assets and rights metadata,
- source files and ingestion jobs,
- dataset build pipelines and QA reports,
- catalog listings and private offers,
- licenses, invoices, and supplier revenue-share records,
- immutable audit logs for rights, PII status, pricing, and publication changes.
