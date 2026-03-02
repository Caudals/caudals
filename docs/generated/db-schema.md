# Database Schema Snapshot

Last reviewed: 2026-03-02

## Core Tables
- `profiles`
- `dataset_requests`
- `submissions`

## Requester Domain
- `dataset_templates`
- `dataset_activity`
- `dataset_exports`
- `requester_onboarding_progress`
- `requester_org_settings`
- `requester_api_keys`
- `support_tickets`

## Admin/Operations
- `admin_activity_log`
- `platform_settings`
- `waitlist_signups`

## Payments and Ledger
- `wallets`
- `transactions`
- `stripe_accounts`

## How to Refresh
Use migration history in `supabase/migrations/` and runtime inspection with Supabase tooling.
Do not store secrets in this file.
