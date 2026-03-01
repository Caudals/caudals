# Multi-Role Dashboard QA Pass

Last updated: 2026-03-01  
Task: `S10-T08`

## Scope

Validated dashboards for all three roles:

- requester (`/requester`)
- contributor (`/contributor`)
- admin (`/admin`)

Coverage dimensions:

- Breakpoints: mobile, tablet, desktop
- Locales: `en`, `es`
- Access/failure behavior: unauthenticated redirection to sign-in
- Layout fit: horizontal overflow guard (`scrollWidth <= viewport width`)

## Automated Checks

Playwright spec:

- `e2e/dashboard-multirole-qa.spec.ts`

Command:

```bash
PLAYWRIGHT_AUTH_E2E=true PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 npx playwright test e2e/dashboard-multirole-qa.spec.ts --project=chromium
```

## Additional Smoke Alignment

- `e2e/authenticated-role-smoke.spec.ts`
- `e2e/smoke.spec.ts`
- `e2e/public-routes.spec.ts`

## Acceptance Outcome Criteria

A QA pass is considered successful when:

1. Role dashboards render for fixture users in both locales.
2. No horizontal overflow is detected on tested breakpoints.
3. Unauthenticated access redirects to `/auth/sign-in`.
4. No fatal runtime errors block dashboard interaction.

## Follow-Up Triggers

Open follow-up tasks if any of these appear:

- locale-specific truncation/overflow issues,
- broken CTA links on one breakpoint,
- role-specific redirect mismatch,
- telemetry events missing after dashboard interactions.
