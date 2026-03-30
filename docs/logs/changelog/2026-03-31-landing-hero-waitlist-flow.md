# 2026-03-31 - Landing Hero Waitlist Flow

## Summary
Restored the landing hero waitlist flow in landing mode, fixed the public API allowlist hole that was returning `404` on submit, and aligned the waitlist email delivery path with the Resend fallback/error-handling stack already used elsewhere in the repo.

## Delivered
- Allowed `/api/waitlist` in `lib/landing-mode.ts`, which unblocked hero submissions under `LANDING_MODE=true` and removed the runtime `404` seen from the home page.
- Added regression coverage in `lib/landing-mode.test.ts` so the waitlist endpoint stays part of the explicit public API surface.
- Updated `app/(app)/api/waitlist/route.ts` to reuse the existing Resend audience helper, inspect `emails.send()` results correctly, and fall back to `RESEND_FALLBACK_FROM_EMAIL` when the primary sender fails.
- Split waitlist email handling so confirmation delivery determines `emailSent`, while internal notification delivery is best-effort and no longer downgrades a successful user confirmation.
- Updated `components/landing/hero.tsx` so the hero reflects the real backend outcome, including the confirmation-email success path now exposed by the waitlist API.

## Notes
- Browser validation confirmed `POST /api/waitlist` now returns `200` from the landing page and the hero shows the confirmation-email success message.
- Pre-existing `GET /api/user/role` `404` noise remains on the public home page and was not introduced by this fix.
