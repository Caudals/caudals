# Landing Hero Waitlist Flow Validation

- **Date:** 2026-03-31
- **Phase:** 32
- **Task:** `P32-T17`
- **Owner:** agent

## Automated Checks
- [x] `npm run typecheck`
- [x] `npx vitest run "app/(app)/api/waitlist/route.test.ts" "lib/resend/subscribers.test.ts" "lib/landing-mode.test.ts"`
- [x] `npx eslint "app/(app)/api/waitlist/route.ts" "app/(app)/api/waitlist/route.test.ts" "components/landing/hero.tsx" "lib/landing-mode.ts" "lib/landing-mode.test.ts"`

## Chrome DevTools MCP Verification
- [x] Home page loaded in landing mode at `http://localhost:3000/`.
- [x] Identified the original failure as `POST /api/waitlist` returning `404` from the hero form before the allowlist fix.
- [x] Reloaded after the code change and verified `POST /api/waitlist` returns `200`.
- [x] Verified the hero shows the confirmation-email success state after submission.
- [x] Confirmed the response payload includes `emailSent: true` and the confirmation-email message.
- [x] No new console or failed-network issues tied to the hero waitlist change.

## Visual Evidence
- [x] Desktop screenshot: `docs/logs/validations/2026-03-31-marketing-hero-waitlist-success-desktop.png`
- [x] Tablet screenshot: `docs/logs/validations/2026-03-31-marketing-hero-waitlist-success-tablet.png`
- [x] Mobile screenshot: `docs/logs/validations/2026-03-31-marketing-hero-waitlist-success-mobile.png`

## Runtime Notes
- The hero waitlist flow was blocked specifically by the landing-mode public API allowlist omitting `/api/waitlist`.
- The browser validation used a reserved-domain test address to exercise the live UI flow without changing the hero design.
- Residual public-home `GET /api/user/role` `404` requests were present during validation and remain unrelated to this change.
