# Release Checklist (Pre-Prod and Prod)

Last updated: 2026-03-01  
Owner: Platform engineering

## 1) Scope and Readiness

- [ ] Release scope is mapped to tracker tasks and PRs.
- [ ] No open P0 blocker remains for included features.
- [ ] Rollback owner is assigned.
- [ ] Incident communication channel is active.

## 2) Pre-Prod Gate (Staging)

- [ ] Staging parity checklist passed: `docs/staging-parity-checklist.md`.
- [ ] DB migrations applied in staging.
- [ ] Stripe test-mode flows verified:
  - dataset funding
  - wallet funding
  - webhook processing
  - payout queue visibility
- [ ] Storage flows verified:
  - upload
  - export generation
  - signed URL access
- [ ] Auth and role routing verified:
  - requester
  - contributor
  - admin

## 3) Automated Quality Gate

- [ ] `npm run typecheck`
- [ ] `npm test -- --run`
- [ ] `npm run lint` (no errors; warnings reviewed)
- [ ] `PLAYWRIGHT_BASE_URL=<staging-url> npx playwright test e2e/smoke.spec.ts --project=chromium`
- [ ] `PLAYWRIGHT_BASE_URL=<staging-url> npx playwright test e2e/authenticated-role-smoke.spec.ts --project=chromium`
- [ ] `PLAYWRIGHT_BASE_URL=<staging-url> npx playwright test e2e/public-routes.spec.ts --project=chromium`

## 4) Security and Compliance Gate

- [ ] CSP/security headers enabled and validated.
- [ ] Public API abuse controls active.
- [ ] Webhook replay protection active.
- [ ] Secrets rotated and environment-scoped.
- [ ] Legal pages current: privacy, terms, cookies, trust center.

## 5) Production Deployment Steps

1. [ ] Announce deployment start and expected duration.
2. [ ] Apply DB migrations (see `docs/db-runbook.md`).
3. [ ] Deploy application artifacts.
4. [ ] Validate health endpoints and critical route loading.
5. [ ] Run post-deploy smoke checks on production.
6. [ ] Announce deployment completion.

## 6) Post-Deploy Verification

- [ ] New sign-up works for requester and contributor.
- [ ] Requester can create/edit/fund dataset.
- [ ] Contributor can submit and see contribution state.
- [ ] Admin queues and analytics load correctly.
- [ ] Error monitoring shows no critical spikes.
- [ ] Payment/webhook logs show normal processing.

## 7) Rollback Criteria

Rollback if any occurs and cannot be forward-fixed rapidly:

- critical auth failure,
- payment/funding corruption risk,
- severe data access/control regression,
- sustained elevated error rate with user impact.

If rollback is triggered, follow `docs/db-runbook.md` and incident playbook.

