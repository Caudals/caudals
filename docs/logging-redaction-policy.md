# Structured Logging and Redaction Policy

Last updated: 2026-03-01  
Task: `S7-T06`

## Objective

Make logs actionable while reducing risk of leaking secrets or personal/sensitive fields.

## Implementation

Logging helper: `lib/security/structured-logger.ts`

Functions:

- `logInfo(event, context?)`
- `logWarn(event, context?)`
- `logError(event, context?)`

Behavior:

- JSON-structured payload with `level`, `event`, `ts`, and sanitized `context`.
- Recursive sanitization with depth guard.
- Stack traces hidden in production.

## Redaction Rules

Sensitive keys are redacted when key names include patterns like:

- `password`, `token`, `secret`, `api_key`, `authorization`, `cookie`, `session`, `signature`
- payment/banking signals: `card`, `ssn`, `iban`, `routing`, `account_number`

Sensitive value signatures are redacted when values resemble:

- Stripe keys/secrets (`sk_*`, `pk_*`, `whsec_*`)
- Supabase publishable keys (`sb_publishable_*`)
- Bearer tokens

Email values are masked (example: `m***@domain.com`) unless explicitly treated as non-sensitive event labels.

## Current Integration Points

- `app/(app)/api/waitlist/route.ts`
- `app/(app)/api/collaborations/route.ts`
- `app/(app)/api/upload/route.ts`
- `app/(app)/api/webhooks/stripe/route.ts`
- `lib/analytics/funnel-events-server.ts`

## Operational Notes

- Avoid `console.*` in new API/action code; use structured logger helpers.
- Include correlation data in context where available (`user_id`, `dataset_id`, `event_id`) but avoid raw secrets.
- Prefer short, stable event identifiers (`domain.action_result`) for searchability.
