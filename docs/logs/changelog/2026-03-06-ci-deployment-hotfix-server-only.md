# 2026-03-06 - CI/Deployment Hotfix: Vitest `server-only` Mock Restoration

## Summary
Resolved the `main` branch CI failure blocking clean deployment confidence by restoring the missing Vitest alias target for `server-only`.

## Root Cause
- GitHub Actions run `22760373900` (`CI`) failed in `npm test -- --run` with:
  - `Cannot find module 'server-only' imported from '/home/runner/work/caudals/caudals/lib/analytics/funnel-events-server.ts'`
- `vitest.config.ts` aliases `server-only` to `test/mocks/server-only.ts`, but that file path did not exist in the repository.

## Changes
- Added `test/mocks/server-only.ts` as the Vitest mock target used by the resolver alias.

## Outcome
- Local CI-equivalent gates now pass, and the missing-module failure is eliminated.
