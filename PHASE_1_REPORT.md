# Phase 1 Report

## Current Slice Plan

- Move the visible operator auth shell from Supabase Auth to Better Auth while keeping public landing-mode gates intact.
- Preserve the broader legacy admin/payment/upload data paths for later Postgres migration slices instead of leaving dual auth flows in the active shell.
- Use this report as the local review trail because no pull request exists yet.

## Shipped

- Operator-domain workflow state machines for `buyer_opportunity`, `supplier_opportunity`, `build`, `run`, `label_batch`, `contract`, `delivery`, and `dsar`.
- License-composition logic that intersects permitted uses, geography, terms, exclusivity, and share-alike constraints before build planning.
- Operator console v0 on `/admin` with all 13 Phase 1 modules, a build-detail reference view, G-1..G-7 gate visualization, simulated five-build queue, license planner result, lineage feed, audit overlay, and state-machine coverage.
- Server action contract for validating operator state transitions and producing audit payloads.
- Self-hosted PostgreSQL operator-core schema baseline and rollback under `db/`.
- Initial Supabase-to-Postgres migration report at `docs/migrations/supabase-to-postgres.md`.
- Blueprint, architecture, and tools docs now describe the Phase 1 target as self-hosted PostgreSQL + Better Auth.
- `docs/blueprints/deviations.md` records the temporary migration and seed-data deviations.
- Typed PostgreSQL client boundary in `lib/db/client.ts` with operator RLS session settings.
- Operator console repository now has explicit `fixture` and `postgres` data sources selected by `OPERATOR_CONSOLE_DATA_SOURCE`.
- tRPC scaffold added at `/api/trpc/[trpc]` for future buyer/supplier surfaces; landing mode still blocks it from the public deployment.
- Postgres-backed operator transitions now perform optimistic state updates and insert `audit_event` rows through the typed repository.
- Added `db/migrations/002_audit_event_default_partition.sql` so audit writes remain durable outside pre-created calendar partitions.
- Added authenticated Playwright smoke coverage for the Operator Console module grid, build detail, license planner, audit overlay, lineage feed, and state-machine panel.
- Added a default Phase 1 proxy gate that returns `404` for pre-pivot `/browse`, `/requester`, `/contributor`, `/dashboard`, and `/pwa` routes.
- Extended the Phase 1 proxy gate so legacy `/admin/*` subroutes return `404` by default while `/admin` remains the Operator Console.
- Removed the remaining Supabase Storage helper path: browser uploads now delegate directly to `/api/upload`, the unused legacy server upload helper was deleted, and active storage URL helpers are DO Spaces/CDN-first with legacy absolute URL compatibility only for stored records.
- Deleted the legacy `/admin/*` route files so `/admin` is the only implemented admin route surface in Phase 1.
- Deleted the legacy `/dashboard` smart-entry route, its unused dashboard component helpers, and the unused Supabase-backed dashboard actions.
- Deleted the legacy `/pwa` companion route group and PWA-only components; the manifest now points to public landing surfaces.
- Deleted the public `/browse` marketplace route group and browse-only submission/detail components; remaining contributor browse code no longer links to public browse detail routes.
- Deleted the legacy `/contributor` route group, contributor-only components, and contributor-specific Supabase actions.
- Deleted the legacy `/requester` route group, requester-only components, requester-specific Supabase actions, and requester fixture tests.
- Deleted the legacy self-serve `/auth/sign-up` page; account access CTAs now route to `/contact`.
- Added the Better Auth PostgreSQL scaffold at `/api/auth/[...all]` with organization/team, TOTP, passkey, hardened cookie, disabled self-serve sign-up, and future client wrapper wiring.
- Added prefixed Better Auth identity tables in `db/migrations/003_better_auth_identity.sql` with rollback and DB-side prefixed-ID checks.
- Removed the legacy Supabase-backed notification bell/actions from the Operator Console shell.
- Deleted unreferenced legacy requester/contributor action files and the unused duplicate route guard.
- Switched the visible operator auth shell to Better Auth: sign-in, reset-password, sign-out menus, `/api/user/role`, `/auth/callback`, and proxy session handling no longer use Supabase Auth.
- Switched `/api/analytics/track` optional user attribution from Supabase Auth/profile lookups to the Better Auth operator session helper.
- Switched `/api/upload` authentication from Supabase Auth/profile checks to active Better Auth operator sessions and narrowed uploads/deletes to operator-owned Spaces paths outside admin role override.
- Removed the command palette's legacy Supabase-backed dataset/support-ticket search; it now exposes operator module navigation and actions without browser Supabase clients.
- Deleted unused Supabase browser auth helper files; only the legacy Supabase admin wrapper remains during data migration.
- Deleted the unused pre-pivot admin component/action island, including legacy admin tables, dialogs, analytics widgets, requester/contributor validators, admin action tests, and the Supabase-backed `admin-actions` module.
- Deleted the legacy self-serve payment action surface and moved the remaining Stripe webhook wallet/budget helpers into a server-only payment ledger module.
- Moved the shared contact/waitlist rate limiter from the Supabase abuse RPC to the self-hosted PostgreSQL client with `db/migrations/004_abuse_rate_limit.sql`.
- Deleted the unused Supabase SSR server wrapper and removed the unused `@supabase/ssr` dependency.
- Moved `/api/waitlist` persistence from Supabase admin writes to the self-hosted PostgreSQL client with `db/migrations/005_waitlist_signup.sql`.
- Moved analytics event ingestion from Supabase admin writes to the self-hosted PostgreSQL client with `db/migrations/006_product_analytics_event.sql`.
- Deleted the stale legacy requester dataset-export job route/module and removed its broken package script and operational docs references.

## Deviations

- The slice uses deterministic Phase 1 seed data in code for the console snapshot while the Postgres and Better Auth migration is still pending. This is not final acceptance for "real data" wiring.
- New schema work lands in `db/migrations/*` with matching rollbacks because the goal replaces the legacy Supabase migration path.

## Known Gaps

- Supabase is still present in Stripe webhook ledger helpers while those data paths are migrated.
- Pre-pivot self-serve route groups have been removed from the implemented route tree and remain blocked by the Phase 1 proxy.
- The local `frontend-design` skill referenced by `AGENTS.md` is not installed in this repo.
- Operator console transition mutations persist only when `OPERATOR_CONSOLE_DATA_SOURCE=postgres`; the default fixture mode still returns non-durable audit payloads during migration.
- The five concurrent builds are simulated in the app layer, not seeded in the Phase 1 Postgres schema.
- Better Auth now owns the visible operator auth shell, but mandatory MFA UI/enforcement, JIT elevation, and operator-account migration are not implemented yet.
- tRPC scaffold has only a health procedure; buyer/supplier routers remain out of scope for this goal phase.
- Operator Console Playwright smoke is authored, but it is skipped unless `PLAYWRIGHT_AUTH_E2E=true` fixture auth is available.
- Supabase decommissioning is blocked by the required 48-hour post-migration internal-use gate and final-backup confirmation.
- The Postgres schema baseline has not yet been applied to a live database or verified with migrated row counts.

## Verification

- `npx vitest run lib/operator/workflows.test.ts lib/operator/license-composition.test.ts lib/actions/operator-console-actions.test.ts` passed with 11 tests.
- `npx vitest run lib/operator/console-repository.test.ts lib/operator/workflows.test.ts lib/operator/license-composition.test.ts lib/actions/operator-console-actions.test.ts` passed with 16 tests.
- `npm run typecheck` passed.
- `npm run lint` passed with the existing 30 warnings and no errors.
- `npm run lint` passed again after the PostgreSQL client slice with the existing 30 warnings and no errors.
- `npx vitest run lib/trpc/router.test.ts lib/landing-mode.test.ts` passed with 6 tests.
- `npx vitest run lib/operator/console-repository.test.ts lib/actions/operator-console-actions.test.ts` passed with 10 tests after transition persistence.
- `npm run typecheck`, `npm run lint`, and `npm run build` passed after the tRPC scaffold; lint still reports the existing 30 warnings.
- `npm run typecheck`, `npm run lint`, and `npm run build` passed after transition persistence; lint still reports the existing 30 warnings.
- `npx playwright test e2e/operator-console.spec.ts --project=chromium` ran with 1 skipped because `PLAYWRIGHT_AUTH_E2E` is not enabled in the current shell.
- `npm run typecheck` and `npm run lint` passed after adding the Operator Console smoke; lint still reports the existing 30 warnings.
- `npx vitest run lib/phase-one-surface-gates.test.ts lib/landing-mode.test.ts` passed with 9 tests.
- `npx playwright test e2e/smoke.spec.ts --project=chromium` passed with 4 tests after installing the missing Playwright Chromium browser and host dependencies on the VPS.
- `npm run typecheck`, `npm run lint`, and `npm run build` passed after the Phase 1 surface gate; lint still reports the existing 30 warnings.
- `npx vitest run lib/phase-one-surface-gates.test.ts lib/landing-mode.test.ts` passed with 11 tests after the legacy admin subroute gate.
- `npx playwright test e2e/smoke.spec.ts --project=chromium` passed with 4 tests after the legacy admin subroute gate.
- `npm run typecheck`, `NODE_OPTIONS=--max-old-space-size=2048 npm run lint`, and `NODE_OPTIONS=--max-old-space-size=2048 NEXT_PRIVATE_BUILD_WORKER=1 npm run build` passed after the legacy admin subroute gate; lint still reports the existing 30 warnings.
- `npx vitest run lib/phase-one-surface-gates.test.ts lib/navigation/role-view.test.ts lib/actions/admin-actions.test.ts` passed with 13 tests after deleting legacy admin subroutes.
- `npm run typecheck` passed after deleting stale `.next` route validators from the previous build output.
- `NODE_OPTIONS=--max-old-space-size=2048 npm run lint` passed after deleting legacy admin subroutes; lint still reports the existing 30 warnings.
- `npx playwright test e2e/smoke.spec.ts --project=chromium` passed with 4 tests after deleting legacy admin subroutes.
- `NODE_OPTIONS=--max-old-space-size=2048 NEXT_PRIVATE_BUILD_WORKER=1 npm run build` passed after deleting legacy admin subroutes; the generated route table lists `/admin` with no `/admin/*` subroutes.
- `npx vitest run lib/phase-one-surface-gates.test.ts lib/navigation/role-view.test.ts` passed with 12 tests after deleting `/dashboard`.
- `npm run typecheck` passed after deleting stale `.next` route validators from the previous `/dashboard` build output.
- `NODE_OPTIONS=--max-old-space-size=2048 npm run lint` passed after deleting `/dashboard`; lint still reports the existing 30 warnings.
- `npx playwright test e2e/smoke.spec.ts --project=chromium` passed with 4 tests after deleting `/dashboard`.
- `NODE_OPTIONS=--max-old-space-size=2048 NEXT_PRIVATE_BUILD_WORKER=1 npm run build` passed after deleting `/dashboard`; the generated route table no longer lists `/dashboard`.
- `npx vitest run lib/phase-one-surface-gates.test.ts` passed with 6 tests after deleting `/pwa`.
- `npm run typecheck` passed after deleting `/pwa`.
- `NODE_OPTIONS=--max-old-space-size=2048 npm run lint` passed after deleting `/pwa`; lint still reports the existing 30 warnings.
- `npx playwright test e2e/smoke.spec.ts --project=chromium` passed with 4 tests after deleting `/pwa`.
- `NODE_OPTIONS=--max-old-space-size=2048 NEXT_PRIVATE_BUILD_WORKER=1 npm run build` passed after deleting `/pwa`; the generated route table no longer lists `/pwa` routes.
- `npx vitest run lib/phase-one-surface-gates.test.ts` passed with 6 tests after deleting `/browse`.
- `npm run typecheck` passed after deleting `/browse`.
- `NODE_OPTIONS=--max-old-space-size=2048 npm run lint` passed after deleting `/browse`; lint still reports the existing 30 warnings.
- `npx playwright test e2e/smoke.spec.ts --project=chromium` passed with 4 tests after deleting `/browse`.
- `NODE_OPTIONS=--max-old-space-size=2048 NEXT_PRIVATE_BUILD_WORKER=1 npm run build` passed after deleting `/browse`; the generated route table no longer lists `/browse` routes.
- `npx vitest run lib/phase-one-surface-gates.test.ts lib/navigation/role-view.test.ts` passed with 10 tests after deleting `/contributor`.
- `npm run typecheck` passed after deleting `/contributor`.
- `NODE_OPTIONS=--max-old-space-size=2048 npm run lint` passed after deleting `/contributor`; lint now reports the existing 28 warnings.
- `npx playwright test e2e/smoke.spec.ts --project=chromium` passed with 4 tests after deleting `/contributor`.
- `NODE_OPTIONS=--max-old-space-size=2048 NEXT_PRIVATE_BUILD_WORKER=1 npm run build` passed after deleting `/contributor`; the generated route table no longer lists `/contributor` routes.
- `npx vitest run lib/storage/client-upload.test.ts` passed with 3 tests after the storage helper cleanup.
- `npm run typecheck` passed after the storage helper cleanup.
- `npx eslint lib/storage/client-upload.ts lib/storage/client-upload.test.ts lib/storage/get-public-url.ts` passed after the storage helper cleanup.
- `NODE_OPTIONS=--max-old-space-size=2048 npm run lint` passed after the storage helper cleanup; lint still reports the existing 30 warnings.
- `NODE_OPTIONS=--max-old-space-size=2048 NEXT_PRIVATE_BUILD_WORKER=1 npm run build` passed after the storage helper cleanup.
- `npx vitest run lib/phase-one-surface-gates.test.ts lib/navigation/role-view.test.ts lib/landing-mode.test.ts` passed with 14 tests after deleting `/requester` and `/auth/sign-up`.
- `npm run typecheck` passed after deleting `/requester` and `/auth/sign-up`.
- `NODE_OPTIONS=--max-old-space-size=2048 npm run lint` passed after deleting `/requester` and `/auth/sign-up`; lint still reports the existing 28 warnings.
- `npx playwright test e2e/smoke.spec.ts --project=chromium` passed with 4 tests after deleting `/requester` and `/auth/sign-up`.
- `NODE_OPTIONS=--max-old-space-size=2048 NEXT_PRIVATE_BUILD_WORKER=1 npm run build` passed after deleting `/requester` and `/auth/sign-up`; the generated route table lists 39 app routes and no `/requester`, `/auth/sign-up`, `/browse`, `/contributor`, `/dashboard`, `/pwa`, or `/admin/*` routes.
- `git diff --check` passed after deleting `/requester` and `/auth/sign-up`.
- `rg -n "\.storage|ORIGINAL SUPABASE CODE|Supabase Storage|@/lib/storage/upload|from \"@/lib/supabase/client\"" lib/storage app components lib -g '*.ts' -g '*.tsx'` found no Supabase Storage helper usage; remaining Supabase client imports are non-storage auth/data call sites.
- `npm run build` passed.
- `npm run i18n:check-parity` could not run because `scripts/check-i18n-parity.ts` is missing from the repo.
- New operator-console translation JSON was updated manually and parsed successfully.
- `db/migrations/001_operator_core.sql` and `db/rollbacks/001_operator_core_down.sql` applied cleanly against a temporary `supabase/postgres:15.8.1.085` container with pgvector available.
- `db/migrations/001_operator_core.sql`, `db/migrations/002_audit_event_default_partition.sql`, and their rollbacks applied cleanly against a temporary `supabase/postgres:15.8.1.085` container.
- `npx vitest run lib/landing-mode.test.ts` passed with 5 tests after the Better Auth scaffold, including the landing-mode block for `/api/auth/*`.
- `npm run typecheck`, `NODE_OPTIONS=--max-old-space-size=2048 npm run lint`, and `NODE_OPTIONS=--max-old-space-size=2048 NEXT_PRIVATE_BUILD_WORKER=1 npm run build` passed after the Better Auth scaffold; lint still reports the existing 28 warnings.
- `db/migrations/003_better_auth_identity.sql` and `db/rollbacks/003_better_auth_identity_down.sql` applied cleanly against a temporary `supabase/postgres:15.8.1.085` container after migrations 001 and 002.
- Better Auth migration introspection reported no pending `toBeCreated` or `toBeAdded` tables after applying `003_better_auth_identity.sql`.
- `npx vitest run lib/auth/better-auth-options.test.ts lib/landing-mode.test.ts`, `npm run typecheck`, `NODE_OPTIONS=--max-old-space-size=2048 npm run lint`, and `NODE_OPTIONS=--max-old-space-size=2048 NEXT_PRIVATE_BUILD_WORKER=1 npm run build` passed after the prefixed identity migration; lint still reports the existing 28 warnings.
- `npm run typecheck`, `NODE_OPTIONS=--max-old-space-size=2048 npm run lint`, `NODE_OPTIONS=--max-old-space-size=2048 NEXT_PRIVATE_BUILD_WORKER=1 npm run build`, and `git diff --check` passed after removing the legacy notification bell/actions; lint still reports the existing 28 warnings.
- `npm run typecheck`, `NODE_OPTIONS=--max-old-space-size=2048 npm run lint`, `NODE_OPTIONS=--max-old-space-size=2048 NEXT_PRIVATE_BUILD_WORKER=1 npm run build`, and `git diff --check` passed after deleting unreferenced legacy action files; lint still reports the existing 28 warnings.
- `npx vitest run lib/auth/better-auth-options.test.ts lib/landing-mode.test.ts` passed with 7 tests after switching the visible auth shell to Better Auth.
- `npm run typecheck`, `NODE_OPTIONS=--max-old-space-size=2048 npm run lint`, `NODE_OPTIONS=--max-old-space-size=2048 NEXT_PRIVATE_BUILD_WORKER=1 npm run build`, and `git diff --check` passed after switching the visible auth shell; lint still reports the existing 28 warnings.
- `translations-source.json`, `translations-es.json`, and `lib/i18n/es.json` parsed successfully after adding the Better Auth sign-in and password-reset strings.
- `rg -n "createClient|supabase\\.auth|signInWith|resetPasswordForEmail|exchangeCodeForSession|onAuthStateChange" app/\(auth\) components/app components/ui/header.tsx lib/auth lib/middleware proxy.ts app/\(app\)/api/user -g '*.ts' -g '*.tsx'` found no remaining Supabase Auth usage in the active auth shell; only the command palette still imports the Supabase client for legacy search data.
- `npm run typecheck`, `NODE_OPTIONS=--max-old-space-size=2048 npm run lint`, `npx vitest run lib/landing-mode.test.ts`, `NODE_OPTIONS=--max-old-space-size=2048 NEXT_PRIVATE_BUILD_WORKER=1 npm run build`, and `git diff --check` passed after switching `/api/analytics/track` user attribution to Better Auth; lint still reports the existing 28 warnings.
- `npm run typecheck`, `npx vitest run lib/storage/client-upload.test.ts lib/landing-mode.test.ts`, `NODE_OPTIONS=--max-old-space-size=2048 npm run lint`, `NODE_OPTIONS=--max-old-space-size=2048 NEXT_PRIVATE_BUILD_WORKER=1 npm run build`, and `git diff --check` passed after switching `/api/upload` to Better Auth operator sessions; lint still reports the existing 28 warnings.
- `npm run typecheck`, `NODE_OPTIONS=--max-old-space-size=2048 npm run lint`, `NODE_OPTIONS=--max-old-space-size=2048 NEXT_PRIVATE_BUILD_WORKER=1 npm run build`, and `git diff --check` passed after removing the command palette Supabase browser-client search; lint still reports the existing 28 warnings.
- `rg -n "@/lib/supabase/client|client-implicit|enforce-implicit-flow|createBrowserClient" app components lib -g '*.ts' -g '*.tsx'`, `npm run typecheck`, `NODE_OPTIONS=--max-old-space-size=2048 npm run lint`, `NODE_OPTIONS=--max-old-space-size=2048 NEXT_PRIVATE_BUILD_WORKER=1 npm run build`, and `git diff --check` passed after deleting unused Supabase browser auth helpers; lint still reports the existing 28 warnings.
- `npm run typecheck`, `npx vitest run lib/operator/console-repository.test.ts lib/operator/workflows.test.ts lib/operator/license-composition.test.ts lib/actions/operator-console-actions.test.ts lib/phase-one-surface-gates.test.ts lib/landing-mode.test.ts`, `NODE_OPTIONS=--max-old-space-size=2048 npm run lint`, `NODE_OPTIONS=--max-old-space-size=2048 NEXT_PRIVATE_BUILD_WORKER=1 npm run build`, and `git diff --check` passed after deleting the unused legacy admin component/action island; lint now reports the remaining 23 payment-action warnings.
- `rg -n "supabase\\.auth|getUser\\(|@/lib/supabase/server|payment-actions" app components lib types proxy.ts -g '*.ts' -g '*.tsx'` found no remaining Supabase Auth or legacy payment-action references after deleting the self-serve payment action surface.
- `npm run typecheck`, `npx vitest run app/'(app)'/api/webhooks/stripe/route.test.ts lib/landing-mode.test.ts`, `NODE_OPTIONS=--max-old-space-size=2048 npm run lint`, `NODE_OPTIONS=--max-old-space-size=2048 NEXT_PRIVATE_BUILD_WORKER=1 npm run build`, and `git diff --check` passed after moving the Stripe webhook helpers to the server-only payment ledger module.
- `db/migrations/001_operator_core.sql` through `db/migrations/004_abuse_rate_limit.sql` and their rollbacks applied cleanly against a temporary `supabase/postgres:15.8.1.085` container; the rate-limit table accepted an insert/upsert probe.
- `npm run typecheck`, `npx vitest run lib/security/rate-limit.test.ts app/'(app)'/api/waitlist/route.test.ts lib/landing-mode.test.ts`, `NODE_OPTIONS=--max-old-space-size=2048 npm run lint`, `NODE_OPTIONS=--max-old-space-size=2048 NEXT_PRIVATE_BUILD_WORKER=1 npm run build`, and `git diff --check` passed after moving rate limiting to PostgreSQL.
- `rg -n "@supabase/ssr|createServerClient|@/lib/supabase/server" app components lib package.json package-lock.json -g '*.ts' -g '*.tsx' -g 'package*.json'` found no remaining Supabase SSR wrapper or dependency references.
- `db/migrations/001_operator_core.sql` through `db/migrations/005_waitlist_signup.sql` and their rollbacks applied cleanly against a temporary `supabase/postgres:15.8.1.085` container; the waitlist table accepted an insert/upsert probe.
- `npm run typecheck`, `npx vitest run app/'(app)'/api/waitlist/route.test.ts lib/db/ids.test.ts lib/security/rate-limit.test.ts lib/landing-mode.test.ts`, `NODE_OPTIONS=--max-old-space-size=2048 npm run lint`, `NODE_OPTIONS=--max-old-space-size=2048 NEXT_PRIVATE_BUILD_WORKER=1 npm run build`, and `git diff --check` passed after moving waitlist persistence to PostgreSQL.
- `rg -n "@/lib/supabase/admin|createAdminClient|supabase" app/'(app)'/api/waitlist lib/db -g '*.ts' -g '*.tsx'` found no remaining Supabase references in waitlist persistence or DB ID helpers.
- `db/migrations/001_operator_core.sql` through `db/migrations/006_product_analytics_event.sql` and their rollbacks applied cleanly against a temporary `supabase/postgres:15.8.1.085` container; the analytics table accepted an insert probe.
- `npm run typecheck`, `npx vitest run lib/analytics/funnel-events-server.test.ts lib/db/ids.test.ts lib/landing-mode.test.ts`, `NODE_OPTIONS=--max-old-space-size=2048 npm run lint`, `NODE_OPTIONS=--max-old-space-size=2048 NEXT_PRIVATE_BUILD_WORKER=1 npm run build`, and `git diff --check` passed after moving analytics ingestion to PostgreSQL.
- `rg -n "@/lib/supabase/admin|createAdminClient|supabase" lib/analytics app/'(app)'/api/analytics lib/supabase/admin.ts -g '*.ts' -g '*.tsx'` found no analytics Supabase references outside the remaining admin wrapper definition.
- `npx vitest run lib/landing-mode.test.ts`, `npm run typecheck`, `NODE_OPTIONS=--max-old-space-size=2048 npm run lint`, `NODE_OPTIONS=--max-old-space-size=2048 NEXT_PRIVATE_BUILD_WORKER=1 npm run build`, and `git diff --check` passed after deleting the stale legacy export-job surface; the generated route table now lists 38 app routes and no `/api/internal/export-jobs`.
- `rg -n "api/internal/export-jobs|jobs:process-exports|EXPORT_JOBS_TOKEN|export jobs|dataset_exports|export_jobs|processPendingDatasetExportJobs|Download and monitor export jobs" docs/TOOLS.md package.json lib app translations-source.json translations-es.json -g '*.ts' -g '*.tsx' -g '*.md' -g '*.json'` found no remaining app/docs/script references to the deleted legacy export-job surface.
