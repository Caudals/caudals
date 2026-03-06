# 2026-03-06 - Admin Settings `platform_settings` Hotfix

## Summary
Resolved production breakage in admin settings where both profile-menu and sidebar settings routes showed:
`Could not find the table 'public.platform_settings' in the schema cache`.

## Root Cause
- Production database no longer had `public.platform_settings`.
- Admin settings server action (`getPlatformSettings`) treated this as a hard failure and rendered an error card.

## Runtime Remediation (Production)
- Reapplied migration SQL from `supabase/migrations/019_platform_settings.sql` directly on production Supabase Postgres.
- Triggered PostgREST schema cache reload with:
  - `NOTIFY pgrst, 'reload schema';`

## Code Hardening
- Updated `lib/actions/admin-actions.ts` to gracefully handle missing-table errors for `platform_settings`:
  - `getPlatformSettings` now returns empty settings payload instead of hard-failing the page when table metadata is missing.
  - `upsertPlatformSetting` now returns a clear actionable error message if storage is missing.

## Outcome
- Admin settings page can render reliably.
- Production table now exists again with RLS policies.
