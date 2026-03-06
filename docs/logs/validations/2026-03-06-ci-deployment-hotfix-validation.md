# 2026-03-06 - Validation: CI/Deployment Hotfix (`server-only` mock)

## Trigger
- GitHub Actions `CI` run on `main` failed: `22760373900`.
- Failure excerpt: `Cannot find module 'server-only' imported from ... funnel-events-server.ts`.

## Scope Tested
- Vitest alias resolution for `server-only`.
- Standard CI gates used in `.github/workflows/ci.yml`.

## Commands
- `npm run lint`
- `npm run typecheck`
- `npm test -- --run`

## Results
- `npm run lint`: pass (warnings only, no errors).
- `npm run typecheck`: pass.
- `npm test -- --run`: pass (`6` files, `25` tests).

## Conclusion
Hotfix validated. CI blocker caused by missing `test/mocks/server-only.ts` is resolved.
