# Launch work-package brief (for every agent session)

You implement one work package (`L-xx`) from `docs/product-specs/spec-v2.md` end to end: code, tests, migration, merge to `main`, production migration, deploy, verification, flag and handoff. The founder approved the spec on 2026-10-11 and asked for every phase to be built and deployed. Several agents work in parallel on `atlantic`, the production host, so follow this brief exactly.

## 1. Read first

1. `AGENTS.md`, then `docs/evals/AGENTS.md`.
2. Your package in spec §8.3, every product item (P-xx) and section it cites, and §8.0 "How we ship". Billing packages also read §6 in full.
3. The docs your files touch (`docs/ARCHITECTURE.md`, `docs/FRONTEND.md`, `docs/DESIGN.md`, `docs/TOOLS.md`) and the handoff template in `docs/product-specs/evals-platform-implementation-spec.md` §21.3.
4. `docs/launch/PROGRESS.md` for what has already landed and the decisions below. Earlier handoffs are in `docs/launch/L-*.md`.

Read the existing code before you write. Extend what exists (spec §2.4); never replace it.

## 2. Workspace

- Work in your own worktree and branch, never in `/home/caudals/caudals` itself (other agents merge there):
  ```bash
  cd /home/caudals/caudals && git worktree add -B launch/L-xx .worktrees/launch-L-xx main
  cd .worktrees/launch-L-xx && ln -s /home/caudals/caudals/node_modules node_modules
  ```
  If the worktree already exists, you are resuming: read its `git log`, `git status` and your draft handoff, then continue.
- Commit work in progress on your branch often (`wip(L-xx): …`), so a usage-limit stop loses nothing. Keep a running draft of `docs/launch/L-xx.md` on the branch.
- New npm dependency: `npm install --package-lock-only <pkg>` in your worktree (updates `package.json` and the lock), then `npm install --no-save <pkg>@<exact version>` in `/home/caudals/caudals` so the shared `node_modules` has it. Prefer what is already installed (`stripe`, `@react-email/render`, `@sentry/nextjs`, `better-auth` with its two-factor plugin, `resend`, `zod`).

## 3. Heavy commands go through the lock

`atlantic` has 4 CPUs and 7 GB of RAM and serves production. Run every heavy command through `scripts/launch/heavy.sh`, which serialises them across agents at low priority:

```bash
scripts/launch/heavy.sh npm run typecheck
scripts/launch/heavy.sh npx eslint <changed files>
scripts/launch/heavy.sh bash -c 'eval "$(scripts/evals/test-db.sh up)" && npx vitest run tests/billing; s=$?; scripts/evals/test-db.sh down; exit $s'
scripts/launch/heavy.sh npx playwright test --config=e2e/evals/ui.config.ts
```

Bring the disposable database up and down inside one `heavy.sh` call, so only one exists at a time. Never run `next build` or `npm run build` locally; CI builds the images. Never run `npm ci` or `npm install` (without `--no-save`) in `/home/caudals/caudals`.

## 4. Migrations

- At most one per package, with the number from the registry in `PROGRESS.md`: `db/migrations/<n>_<name>.sql` (with `BEGIN;`/`COMMIT;` lines like the existing files), `db/rollbacks/<n>_<name>_down.sql`, and the file name added to the explicit list in `scripts/evals/migrate.ts` in numeric order.
- Additive only. The rollback refuses to drop tables that hold rows (see the Stage E down files). Follow the `SECURITY DEFINER` and RLS patterns of `075_demo_and_self_serve.sql` and the grants files in `infra/evals/*-grants.sql`; update `scripts/evals/test-db.sh` if a new role or grant is needed.
- Test it on the disposable database first (the test-db script runs the real migrator).
- Production: `scripts/launch/migrate-production.sh` (run `DRY_RUN=true` first). It mirrors `scripts/evals/migrate.ts` (checksums, history, advisory lock). Apply **after** merging to local `main` and **before** pushing, because the push deploys code that needs it.

## 5. Flags and configuration

- Every new behaviour ships behind the flag the spec names, default off, read at runtime on the server. Do not use `NEXT_PUBLIC_*` for flags: the image build only receives `NEXT_PUBLIC_APP_URL`, so public env values cannot change at runtime. Read the flag on the server and pass it to client components as a prop.
- App flags live in `/root/.caudals/app/credentials.env`. Add each new key to the allowlist in `scripts/set-app-credentials.sh` in your change. After your deploy is verified, set it with `scripts/launch/set-app-flag.sh KEY VALUE` (stores it and redeploys the running image). Only do that while you hold the merge lock.
- Worker flags go in `infra/evals/production-stack.yml` (and `scripts/deploy-evals-production.sh` when they come from the app credentials). The `evals-images.yml` workflow is **manually disabled** (Actions minutes; do not re-enable it), so pushing builds only the app image. When your change touches `lib/**`, `services/evals-*/**`, `infra/evals/**`, `package*.json` or `tsconfig.json`, deploy the workers yourself after the push, from a clean worktree at the pushed commit: `scripts/launch/build-worker-images.sh <full-sha>` (overlays the committed source onto the running images; `FULL_BUILD=true` when dependencies changed), then `sudo env EVALS_IMAGE_COMMIT=<full-sha> scripts/deploy-evals-production.sh`, which verifies every service's image and health.
- Secrets: never print values. Check presence and prefixes only. Existing keys include Stripe **test** keys (`STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`), `RESEND_API_KEY`, `DEMO_OPENROUTER_API_KEY`, `CALCOM_LINK`, and the Sentry DSN at `/root/.caudals/secrets/sentry-dsn`.

## 6. Checks before merging

Spec §8.0 item 5, through `heavy.sh`: `npm run typecheck`, `npx eslint` on the files you changed (or `npm run lint`), the Vitest suites you touched or added (DB suites against the disposable database), `npx playwright test --config=e2e/evals/ui.config.ts` for UI work (harness fixtures in `e2e/evals/ui-harness.tsx` and contracts in `e2e/evals/ui.contract.ts`), and `npm run i18n:check-parity`. Every user-facing string is in EN and ES. UI follows `docs/DESIGN.md` (Paper for public pages, the platform kit for the app) and works at 390, 768 and 1440 px.

## 7. Merge, deploy, verify (one package at a time)

1. Take the merge lock: `scripts/launch/merge-lock.sh acquire L-xx` (waits for other packages; prints the holder). **Acquire it only in the foreground, never in a background loop**: a stopped agent's background loop can win the lock and hold it for hours. If you must pause long work while holding it, release it first.
2. In your worktree: `git fetch origin && git rebase origin/main`. Resolve conflicts (message catalogs, `migrate.ts`, `set-app-credentials.sh` and shared components are the usual ones; keep both sides). Re-run typecheck, lint on changed files and your tests.
3. Squash your branch into one commit, `feat(L-xx): <title>`, with a short body and the attribution line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
4. `cd /home/caudals/caudals && git pull --ff-only origin main && git merge --ff-only launch/L-xx`. This checkout must stay clean: if `git status` shows anything that is not yours, stop and report instead of touching it.
5. Production migration (if any): `DRY_RUN=true scripts/launch/migrate-production.sh`, then without `DRY_RUN`.
6. `git push origin main`. Then `scripts/launch/wait-deploy.sh $(git rev-parse HEAD) app` in the background (it polls for up to an hour). When workers are affected (§5), build and deploy their images with `scripts/launch/build-worker-images.sh` and `scripts/deploy-evals-production.sh`, then confirm with `scripts/launch/wait-deploy.sh $(git rev-parse HEAD) both 60`.
7. Verify in production with the package's own checks (spec "Tests and verification"), then set the flags that the spec says are switched on after the smoke checks. Leave off any flag the spec keeps off, or that needs a founder action (§9 of `PROGRESS.md`).
8. Write `docs/launch/L-xx.md` (what shipped, flags and their state, migration, checks run with results, production verification, founder actions left, risks), update your row and the founder-actions list in `docs/launch/PROGRESS.md`, update the affected docs, commit `docs(L-xx): handoff [skip ci]` and push.
9. `scripts/launch/merge-lock.sh release L-xx`. Remove your worktree (`git worktree remove .worktrees/launch-L-xx`) and delete the branch.

If the deploy fails, fix forward in a new commit under the same lock. If production breaks and you can't fix it quickly, redeploy the previous image (`gh` isn't installed; use `sudo env CAUDALS_APP_BUILD_LOCAL=false CAUDALS_APP_BUILD_TAG=<previous sha> scripts/deploy-app-stack.sh` from a worktree at that commit), record it, and report.

## 8. Hard rules

- Never: secrets in output, code, docs or screenshots; adversarial tests; sending email or messages to anyone outside Caudals (test sends go only to the internal address in `COLLABORATION_NOTIFICATION_EMAIL`, without printing it); paid API calls beyond small authorised probes; Stripe **live** mode; destructive migrations or data deletion beyond your own test rows; bringing back removed routes (`/pricing`, `/docs`, `/security`, `/about`, `/buyer`, `/supplier`, `/v1/*`, `/careers`, `/catalogue`); "certified", "compliant" or "AI Act compliant" claims.
- Never publish the §3.2 placeholder entity data (B00000000, Calle Ejemplo, Tomo 0000…) on a production page, in Stripe or in an invoice template.
- Don't edit another package's files beyond what yours needs, and don't refactor unrelated code.
- Production data access is read-only aggregates unless your package's verification requires a write. Clean up any test rows you create through the product's own audited paths.
- Stop and report (don't guess) when credentials are missing, requirements conflict, or the next step is irreversible and high-risk.

## 9. Final report

End with a short report: commit SHA on `main`, deploy status (app and workers), migration applied, flags set, checks run with results, production verification, anything left undone and why, and founder actions.
