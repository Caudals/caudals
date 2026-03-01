# Security Baseline

## Scope

This document defines the current production baseline implemented for Stage 7:

- public form abuse controls,
- upload API guardrails,
- Stripe webhook replay safety,
- and HTTP security headers/CSP.

## 1) Public Form Abuse Controls

Implemented in:

- `app/(app)/api/waitlist/route.ts`
- `app/(app)/api/collaborations/route.ts`
- `lib/security/rate-limit.ts`

Controls:

- IP-based rate limiting with standard `X-RateLimit-*` headers.
- Email-based rate limiting to prevent repeated automated submissions.
- Honeypot field check (`website`) to drop obvious bot submissions.

Current limits:

- Waitlist: `10 / 15m` per IP, `4 / 1h` per email.
- Collaborations: `6 / 15m` per IP, `3 / 1h` per email.

## 2) Upload Guardrails

Implemented in:

- `app/(app)/api/upload/route.ts`

Controls:

- Strict allowed buckets: `dataset-files`, `dataset-images`.
- MIME/type validation per bucket.
- Max file size enforcement:
  - `dataset-files`: `50MB`
  - `dataset-images`: `8MB`
- Safe path and key generation constraints.
- Role and dataset access checks:
  - dataset images: `admin`, or `requester` with dataset ownership
  - dataset files: `contributor`/`admin` and valid target dataset
- Delete operation ownership checks for non-admin users.

## 3) Stripe Webhook Replay Protection

Implemented in:

- `app/(app)/api/webhooks/stripe/route.ts`
- `supabase/migrations/023_stripe_webhook_events.sql`

Controls:

- Persist every Stripe event id in `public.stripe_webhook_events`.
- Reject duplicate events already marked `processing` or `processed`.
- Allow retry for prior `failed` records by re-claiming processing state.
- Mark processed/failed state transitions with timestamps and last error.

## 4) Security Headers and CSP

Implemented in:

- `next.config.js`

Baseline headers:

- `Content-Security-Policy`
- `Strict-Transport-Security`
- `X-Frame-Options`
- `X-Content-Type-Options`
- `Referrer-Policy`
- `Permissions-Policy`
- `Cross-Origin-Opener-Policy`
- `X-DNS-Prefetch-Control`

CSP strategy:

- default-deny posture (`default-src 'self'`),
- explicit allowlists for Stripe and analytics origins,
- production-only `upgrade-insecure-requests`,
- development allowance for `unsafe-eval` to support local tooling.
