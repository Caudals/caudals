# Performance Budgets

## Goal

Detect major performance regressions on critical public/auth entry routes before merge.

## Tooling

- Lighthouse CI (`@lhci/cli`)
- Config file: `lighthouserc.js`
- Script: `npm run perf:lighthouse`

## Route Scope

- `/`
- `/auth/sign-in`
- `/browse`
- `/requester` (redirect behavior for anonymous user path)

## Budget Thresholds

Current thresholds are intentionally conservative for CI stability while still catching severe regressions:

- `performance` score >= `0.30`
- `accessibility` score >= `0.70`
- `FCP` <= `10000ms`
- `LCP` <= `15000ms`
- `TBT` <= `2000ms`
- `CLS` <= `1.0` (temporary baseline; tighten after landing-page CLS stabilization)

As performance hardening work continues, tighten these budgets in stages.

## Local Execution

```bash
npm run perf:lighthouse
```

Run against an already-running local server:

```bash
LHCI_BASE_URL=http://127.0.0.1:3000 npm run perf:lighthouse
```

## CI Enforcement

`CI` workflow runs Lighthouse budget checks after quality and E2E smoke jobs. Failing budgets fail the pipeline.
