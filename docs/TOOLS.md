# Tooling and MCP Reference

## Agent Access Model

Agents can assume access to:

- local repository source code,
- product and technical context in `docs/product-specs/overview.md` and `docs/`,
- self-hosted PostgreSQL through local Docker, Tailscale, SSH, or Dokploy when credentials are available,
- browser/devtools tooling for runtime UI inspection,
- GitHub tooling for CI and review context.

When interacting with production-like resources, use read-first diagnostics and minimal-risk mutations.

## Primary Tooling

- Terminal: build/lint/file ops/repo diagnostics
- `psql`: SQL migration, rollback, RLS, and schema inspection
- Docker: local integration checks for PostgreSQL and runtime dependencies
- Tailscale + SSH + Docker Swarm/repository deploy scripts: private VPS lifecycle; retained Dokploy Traefik handles ingress
- Postiz CLI + `postiz:postiz` skill: social integrations, drafts, uploads and analytics
- Warmbly CLI + `warmbly-cli` skill: outreach and CRM product operations
- `warmbly-apollo` / `warmbly-rocketreach` CLIs, MCPs and skills: prospect search/enrichment and direct Warmbly imports
- Cloudflare CLI (`cf`, alias `cloudflare`): DNS and edge/API inspection
- Hermes: strategic-prospecting host/service diagnostics; behaviour belongs to `../leads`
- `caudals-evals`: private customer-side evaluation runner; the older `caudals` CLI remains frozen
- Artifact skills, document/media utilities and connected app tools: see the inventory below
- Stripe CLI/MCP: historical billing support only; the MCP is disabled in the inspected local configuration
- GitHub MCP: issue/PR/review workflows
- GitHub CLI (`gh`): CI run and failed-job triage
- Browser/devtools tooling: Chrome DevTools MCP, Playwright, unified computer use and Node REPL when available in the active session

## Installed CLI, MCP and Skill Inventory

Checked **2026-10-09** against local executable/package metadata, installed skill files, the active MCP tool list and read-only SSH inspection. This records availability, not account authorization or provider health. Recheck with `command -v TOOL`, `TOOL --help` and the relevant status command before use. VPS SSH sessions may omit `~/.local/bin` from `PATH`.

| Tool | Observed location | Purpose / first check |
| --- | --- | --- |
| `postiz` 2.0.16 | Local `~/.local/bin/postiz` | Social public API; `postiz --help` |
| `warmbly` v0.6.20 | Local `~/.local/bin/warmbly` | Customer REST API; `warmbly version`, `warmbly auth status --json` |
| `warmbly`, `warmblyctl` | `arctic` Warmbly backend container; its `warmbly` binary reports v0.6.33 | Product CLI / direct-database operator CLI; container binaries do not establish a host installation |
| `warmbly-apollo`, `warmbly-rocketreach` | Local `~/.local/bin/`; corresponding sidecars run on `arctic` | JSON CLIs and authenticated MCP bridges; `status`, `--help` |
| `cf` / `cloudflare` 1.0.0-beta.10 | Local and `atlantic` `~/.local/bin/` | Unified Cloudflare CLI; `cf cli search`, `cf auth whoami` |
| `cloudflared` | `atlantic` `/usr/local/bin/cloudflared` | Tunnel client; `cloudflared --version`. Separate from the `cf` API CLI |
| `tailscale`, `ssh`, Docker | Local and both VPS nodes | Private connectivity and container/Swarm inspection |
| `psql` | `atlantic`; also available in database containers | SQL inspection. Not on the inspected local default `PATH`; use a configured client or container |
| `gh`, Git, Node/npm, Python, `uv`/`uvx`, `rg`, `jq` | Local developer tools; host availability varies | CI, build, scripts, search and JSON. Use the repo lockfile/runtime requirements |
| `hermes` | Local and `atlantic` `~/.local/bin/hermes` | Existing prospecting agent/service diagnostics; `hermes --help` |
| `codex`, `claude`, `cursor-agent`, `agy` | Local agent/editor launchers; Codex/Claude also observed on `atlantic` | Existing tooling only; do not invoke child sessions under this repo's no-subagent rule |
| `ntn` | Local `~/.local/bin/ntn` | Notion CLI (beta): `ntn --help`, `ntn doctor`; authentication/resource access is separate |
| `ffmpeg`, `ffprobe`, `magick`, `pdftoppm` | Local Homebrew tools | Media encoding/inspection, ImageMagick and PDF page rendering; inspect command help |
| `nano-pdf`, `blender-mcp` | Local `~/.local/bin/` | Optional AI PDF editing / Blender bridge. `nano-pdf --help`; model/API access may be paid |
| `stripe` | Local Homebrew CLI | Historical billing tooling only; no current checkout or payment product |

Local installed skills are discovered under `~/.agents/skills` and `~/.codex/skills`; bundled plugin skills have versioned locations supplied by the session. Read the exact `SKILL.md` advertised by that session before applying a skill. These local paths are not assumed to exist on the VPS.

| Skill | Guide / use |
| --- | --- |
| `postiz:postiz` | Local `~/.agents/skills/postiz/SKILL.md` (also exposed from `postiz/skills/postiz/`); social CLI workflow |
| `warmbly-cli` | Local `~/.agents/skills/warmbly-cli/SKILL.md`; read `references/caudals.md` for the self-host URL/sign-in |
| `warmbly-apollo` | [Repository SKILL.md](../infra/warmbly/apollo/SKILL.md), [runbook](../infra/warmbly/apollo/README.md); local installed copies in both discovery roots |
| `warmbly-rocketreach` | [Repository SKILL.md](../infra/warmbly/rocketreach/SKILL.md), [runbook](../infra/warmbly/rocketreach/README.md); local installed copies in both discovery roots |
| `frontend-design`, `frontend-skill` | Local UI skills; follow [DESIGN.md](DESIGN.md) and [FRONTEND.md](FRONTEND.md) |
| Documents, PDF, Spreadsheets, Presentations | Session-provided artifact skills; use the workspace dependency loader and each skill's rendering/verification workflow |
| Google Drive / Docs / Sheets / Slides / comments | Session-provided connected Drive skills; discover tools and verify file access before reading or editing |
| `imagegen`, `remotion-best-practices`, `visualize:visualize` | Image assets, React video and interactive explanations when relevant to the task |
| `openai-docs`, `skill-creator`, `skill-installer`, `find-skills`, plugin management | Codex/OpenAI guidance and extending skill/plugin capabilities when requested |

The active session exposes GitHub, Chrome DevTools, Apollo, RocketReach, live Word, Blender, Node REPL, unified computer use and Codex app tools. App tools include workspace dependency loading, file/preview panels, LaTeX compilation, managed worktrees and automations. Use purpose-built APIs before UI automation. The inspected local Stripe, Supabase, Paper and older computer-use MCP configurations are disabled; a retained configuration or installed skill alone does not establish a usable connection. Other connectors depend on the session's installed plugins and access checks.

## Postiz CLI and Skill

The service is `caudals-social_postiz` on `arctic`, behind `https://postiz.caudals.com`. Platform topology is in [VPS_RUNTIME.md](VPS_RUNTIME.md) and [infra/social/arctic-stack.yml](../infra/social/arctic-stack.yml); content review and publishing behaviour belong to `../leads/docs/CONTENT.md`.

Use the installed `postiz:postiz` skill. To install a missing CLI in an approved developer environment, use `npm install -g postiz` (retain a reviewed version rather than upgrading production tooling incidentally).

```bash
export POSTIZ_API_URL=https://postiz.caudals.com/api
# Supply POSTIZ_API_KEY through a protected environment/secret file.
# auth:status prints a credential prefix in this CLI version; remove those lines.
postiz auth:status | sed -E '/Token:|Key:/d'
# Only continue when the status verifies credentials for the intended API URL.
postiz integrations:list
postiz integrations:settings INTEGRATION_ID
postiz posts:list
postiz analytics:platform INTEGRATION_ID -d 30
```

The CLI appends `/public/v1`, so the self-hosted base must include `/api`. Saved OAuth credentials in `~/.postiz/credentials.json` take precedence over **both** environment key and URL. Inspect the redacted status to confirm the target; do not overwrite an unrelated sign-in. `postiz auth:login` uses its configured OAuth server and is not proof of access to the Caudals self-host. For that instance use an authorized key from Postiz Settings → Public API, provided through a protected environment.

Create a review draft only within an authorized content task:

```bash
postiz integrations:settings INTEGRATION_ID
postiz posts:create -c "Approved draft text" -s "2026-10-15T08:00:00Z" -t draft -i INTEGRATION_ID
```

`posts:create` defaults to **schedule**, so always pass `-t draft` for review. For media, run `postiz upload /absolute/path/to/media.png` first and attach only its returned `.path` with `-m`; raw local filenames and external URLs do not substitute for upload. Read the integration's `rules`, field descriptions and dynamic tools before choosing settings. For an authorized TikTok publication use `content_posting_method: DIRECT_POST` unless the user explicitly wants to finish in the TikTok app. Inspect existing posts after an uncertain create response before retrying to avoid duplicates.

`posts:status ID --status schedule` queues a draft using its stored date and requires launch authorization. If post analytics returns `{"missing":true}`, inspect `posts:missing ID`, match the published provider content, then use `posts:connect ID --release-id RELEASE_ID`. Confirm CLI/server support before relying on newer command families; successful API acceptance alone does not prove provider publication.

## Warmbly Customer CLI and Recovery CLI

Warmbly is the CRM of record at `https://out.caudals.com` on `arctic`. Product operations use the `warmbly-cli` skill and customer CLI, whose per-host credentials live in `~/.config/warmbly`. Its REST base has **no** `/v1` suffix:

```bash
export WARMBLY_HOST=out.caudals.com
export WARMBLY_API_URL=https://out.caudals.com
warmbly auth status --json
# If sign-in is needed, the operator completes browser approval:
warmbly auth login --hostname out.caudals.com --api-url https://out.caudals.com --web
warmbly status --json
warmbly campaign list --json
warmbly contact list --json --limit 100
warmbly mailbox list --json
warmbly inbox list --json
warmbly campaign preflight CAMPAIGN_ID --json
warmbly campaign plan CAMPAIGN_ID --json
```

If missing, the developer installer is `https://warmbly.com/cli.sh`; download/review it before running it, or use the CLI already inside the backend container. Inspect `warmbly version` and command help: local and container versions can differ. `WARMBLY_TOKEN` overrides stored sign-ins; never use `auth status --show-token` or print `auth token` output in an agent transcript. Enrichment bridges read the latter internally.

Always request `--json`. Paginated lists return `data` plus `pagination.next_cursor` / `has_more`; use `--all` or the returned opaque `--cursor`. For routes without a command, `warmbly api "/campaigns?limit=10" --paginate` uses paths relative to `/v1`. Retry the identical write with the same `--idempotency-key`; respect `Retry-After` on `rate_limit_exceeded`, and retain the error `code` and `request_id` for diagnosis. Exit 4 indicates a missing/rejected credential or scope.

Campaigns stay draft unless launch is authorized. Run preflight before an authorized `campaign start`; read `campaign plan` before changing limits. `campaign test`, placement tests, `mailbox send`, inbox replies/composition and draft approval send real mail too. Pass `--yes` only for the specific user-authorized send. Mailbox connection needs browser OAuth/credential entry. Member/role/billing administration can require a browser session; do not replace missing product scopes with direct database access.

`warmblyctl` is the separate instance recovery/account CLI. Read [infra/warmbly/README.md](../infra/warmbly/README.md) and [ctl.sh](../infra/warmbly/ctl.sh) before using it: operator commands need the backend's secret-backed process environment (`PRIMARY_DB`, encryption settings), which plain `docker exec` does not inherit. The inspected `caudals-warmblyctl` host wrapper on `atlantic` predates the move; verify any wrapper targets the live `arctic` backend. Do not run setup/reset/admin/restore commands as a workaround for product sign-in. Preserve encryption keys and the founder's no-application-backup preference; copying documentation does not authorize data backups or an instance upgrade.

## Warmbly Apollo and RocketReach CLIs/MCPs

Use each provider's installed skill or its repository `SKILL.md`, plus the [Apollo](../infra/warmbly/apollo/README.md) / [RocketReach](../infra/warmbly/rocketreach/README.md) runbook. Their authenticated APIs are `https://out.caudals.com/v1/apollo` and `/v1/rocketreach`. Both CLIs reuse the Warmbly sign-in for `out.caudals.com`, or protected `WARMBLY_TOKEN` / `WARMBLY_API_KEY`; integration operations require `READ_CONTACTS`, `WRITE_CONTACTS` and `INTEGRATIONS` scopes.

```bash
warmbly-apollo status
warmbly-apollo accounts list
warmbly-apollo results
warmbly-rocketreach status
warmbly-rocketreach accounts list
warmbly-rocketreach results
# Agent MCP registrations invoke these bridges, with no credential in config:
warmbly-apollo mcp-stdio
warmbly-rocketreach mcp-stdio
```

Both output JSON and offer `execute`, `results`, `companies`, `receipts`, `jobs`, `poll JOB_ID` and `import`. MCP servers are exposed as `warmbly-apollo` / `warmbly-rocketreach`; use their tools directly when available rather than starting another bridge manually. Provider search returns previews, not necessarily unlocked/verified email.

For an authorized Apollo people-search task:

```bash
warmbly-apollo execute people.search --params '{"person_titles":["CTO"],"person_locations":["Spain"],"page":1,"per_page":25}'
```

Apollo people search does not consume credits in this integration; company operations/enrichment can. RocketReach search is chargeable. Paid operations require `--spend` and a stable `--idempotency-key`, within the user's authorized provider/batch scope. Show unclear batch/phone/waterfall costs before proceeding; local reservations are estimates, not guaranteed provider billing caps. After a timeout, inspect `receipts` / `jobs` and retry identical inputs with the same key. Poll on the originating account. Do not rotate keys or API modes to evade denials, throttles or suspensions.

Imports use stored result IDs and a stable import key, default to verified email and new contacts unsubscribed, preserve existing opt-outs and never start campaigns. Account keys belong in the integration UI or `accounts add --key-file /protected/key`, not command arguments or MCP configuration. The plugins store company results; contact imports do not create a separate company CRM entity.

## Cloudflare CLI (`cf` / `cloudflare`)

The installed package is the unified Cloudflare **`cf`** npm CLI (beta), not Wrangler or `cloudflared`. Local and `atlantic` binaries are `~/.local/bin/cf`; `cloudflare` is an alias. Installation, if required in an approved environment, is `npm install -g cf` with Node.js 22+; confirm a reviewed version first.

```bash
cf --version
cf cli search "show authentication status"
cf auth whoami
cf cli search "list DNS records"
cf dns records list --help
cf schema dns records list
cf dns records list --zone caudals.com --type MX
cf dns records list --zone caudals.com --type TXT
```

Keep `cf cli search` queries anonymous: describe only the action/resource type, without domains, names, emails, IDs or tokens. Select one result, then use its `--help` and `cf schema ...` to inspect flags and request shape. The zone belongs in the subsequent authorized resource command, not the discovery query. List responses are paginated; inspect `result_info` and documented page/per-page flags before treating a page as a complete zone inventory.

Authentication prefers protected `CLOUDFLARE_API_TOKEN`, then the selected OAuth profile (`--profile`, directory binding or default). `cf auth login` needs operator browser authorization; `cf auth whoami` verifies access without dumping tokens. A historical OAuth 403 is not proof of current access: diagnose the credential/scope rather than retrying writes. For a scoped DNS change, first export the existing records with `cf dns records export --zone caudals.com` to a protected file and show the proposed diff. DNS/mail, edge security and paid-resource mutations need explicit authorization; preserve unrelated records and verify authoritative/public DNS and affected HTTPS/mail behaviour afterwards. Do not run `cf deploy` for the VPS-hosted Caudals app.

## Other Available Tools and Skills

- **Private access:** `tailscale status` / `tailscale ping HOST` diagnose reachability; use `ssh -o BatchMode=yes caudals@atlantic` or `caudals@arctic`. Inspect `sudo -n docker service ls` and `service ps`; do not dump service secret/env values. `cloudflared` tunnel changes are separate from this connectivity path and require a scoped task.
- **Hermes:** `hermes --help` and host/user-service status diagnose existing prospecting infrastructure. Read `../leads/docs/STRATEGIC_PROSPECTING.md` and `../leads/docs/OPERATIONS.md` before editing jobs, configuration or schedules. Do not launch another agent or messaging gateway to delegate work from this repo.
- **Private evaluation CLI:** [packages/evals-runner/README.md](../packages/evals-runner/README.md) documents `caudals-evals pair`, `doctor`, `fetch`, `run`, `upload` and `logout`. Install a reviewed package on the authorized customer machine; keep credentials in the local adapter and preserve signed/idempotent results.
- **Artifacts:** use the session's document/PDF/spreadsheet/presentation skills and Codex workspace dependency loader before creating files. `pdftoppm` renders PDF QA images; `ffprobe` inspects media, `ffmpeg` encodes it and `magick` handles image utilities. Image generation, Remotion, Blender and `nano-pdf` serve authorized content/artifact tasks and do not extend the frozen evaluation modalities. AI-backed CLI operations can consume provider credits.
- **Connected editing:** live Word MCP and Google Drive tools use their own access/session checks; use the corresponding skill for the requested document operation. The local Notion CLI offers `ntn doctor`, `whoami`, `pages`, `datasources`, `files` and `api`; inspect `ntn COMMAND --help` and confirm access before writes. An installed CLI is not a connected Notion plugin.
- **Browser/runtime work:** use Chrome DevTools MCP for page/console/network diagnosis, Playwright for repository browser checks, unified computer use for supported native/browser interaction and Node REPL for persistent scripting when exposed. UI automation does not authorize bypassing SSO/2FA/CAPTCHA.
- **Diagnostics:** `rg` / `rg --files` for source searches, `jq` for structured output, `curl` for bounded HTTP probes, `dig` for DNS and OpenSSL for public certificate/signature checks. Keep raw credentials, headers and private key material out of recorded output. `uv`/`uvx` manage Python tools; do not install or upgrade unrelated runtimes incidentally.

### Documentation deployment

For a change limited to `AGENTS.md` and documentation, deploy the reviewed files/patch to the VPS checkout over Tailscale/SSH, run `git apply --check` first, preserve existing local edits and verify deployed content/checksums. Record the source commit and target path. If publishing such a commit to `main`, `[skip ci]` avoids an application rebuild triggered by the root `AGENTS.md` change; run the documentation checks directly. The app Docker runtime does not copy these guides, so a documentation-only release needs no service restart. Code, stack or runtime changes still follow their normal build/deployment and acceptance gates.

## Evaluation test fixture (all stages)

`scripts/evals/test-db.sh up` starts a disposable PostgreSQL 16 (pgvector) and a disposable MinIO on loopback, applies every repository migration plus the evaluation migrations through the real migrator, reapplies the service grant scripts, and prints the environment to export (`eval "$(scripts/evals/test-db.sh up)"`). It creates non-owner logins for the web runtime, the document worker and the configuration admin. Then `npx vitest run` runs every unit, contract and database suite (the older Stage A suites read `EVALS_TEST_OWNER_URL` automatically). `scripts/evals/test-db.sh down` removes both containers. MinIO registry images now require authentication; load the production-pinned image from the VPS with `ssh caudals@atlantic 'sudo docker save quay.io/minio/minio:RELEASE.2025-09-07T16-13-09Z-cpuv1' | docker load` if the pull fails. Never point these fixtures at a shared database.

Host jobs on `atlantic` (daily encrypted backup and ten-minute operational alerts) are installed with `sudo scripts/install-evals-host-jobs.sh`; procedures for every alert are in `docs/evals/runbooks.md`.

## Evaluation Stage C local checks

Use a disposable local PostgreSQL database and private storage endpoint for integration tests; never point destructive fixtures at the shared production database. Apply all current migrations through the disposable fixture/migrator, then exercise tenant queries under a non-owner NOBYPASSRLS role. `npx vitest run tests/evals/stage-c.test.ts` checks website/scenario/customer policy contracts. `npx playwright test --config=e2e/evals/browser-fixture.config.ts` checks isolated browser fixtures, and `npx playwright test --config=e2e/evals/ui.config.ts` checks the invite-only UI harness. Run the two Playwright configs serially because the UI harness binds loopback port 4187. The UI harness does not prove Next.js routing, production network isolation, real widget consent or durable storage.

Before interpreting a queue test failure, verify the installed `pg-boss` version against `package-lock.json`: the lockfile specifies 12.33.1, and an installed tree or symlink may differ. Verify the release with the locked dependency set; do not alter the shared dependency tree merely to hide the mismatch. Stage C release gates are tracked in `docs/evals/work-packages/WP-09.md`–`WP-11.md`.

## Evaluation Stage D local checks

Use `npx vitest run tests/evals/stage-d-*.test.ts` for protocol, calendar and CLI fixtures. For the database tests, provision a disposable PostgreSQL database with all current migrations and a non-owner role inheriting `evals_runtime`; set `EVALS_TEST_DATABASE_URL` to that role and `EVALS_TEST_OWNER_URL` to the disposable migration owner. Run `npx vitest run tests/evals/stage-d-runner-db.test.ts tests/evals/stage-d-monitor-db.test.ts`. These tests insert and update fixtures and must never target production.

Scheduled monitoring is disabled unless `EVALS_SCHEDULES_ENABLED=true` on the separate scheduler service. Worker scope combines configured IDs with live workspaces through `evals.worker_workspace_ids()`; entitlements and target readiness still apply. Before enabling it, mount `EVALS_WEBHOOK_KEYRING_FILE` on both web and scheduler, set `EVALS_WEBHOOK_KEY_VERSION` on web to a version in that keyring, and provision the Ed25519 `EVALS_RUNNER_SIGNING_KEY` for bundle signing. Keep these out of logs and use mounted secret files where supported. Run `npm run typecheck`, the eval Vitest suite, and the browser fixtures before a release; then exercise a real approved target, worker restart and a customer-controlled webhook receiver. The web UI shows webhook secrets and customer tokens only once. A receiver verifies the exact body with the delivery ID/timestamp signature and records each delivery ID for at least five minutes to reject replay. Keep old webhook secrets accepted until queued deliveries made before rotation have drained.

The private CLI package and adapter usage are in `packages/evals-runner/README.md`. Stage D release evidence and remaining gates are in `docs/evals/work-packages/WP-12.md`–`WP-13.md`.

## Evaluation Stage E local and release checks

Use a disposable PostgreSQL 16 database with all current migrations (Stage E started at 043–044; later migrations remain required). The fixture runtime login must inherit `evals_runtime` while remaining a non-owner without `SUPERUSER` or `BYPASSRLS`; set `EVALS_TEST_DATABASE_URL` to that login and `EVALS_TEST_OWNER_URL` to the disposable migration owner. Run `npx vitest run tests/evals/stage-e-*.test.ts`, the storage/scoring comparison tests, and `npx playwright test --config=e2e/evals/ui.config.ts`. These fixtures create attributed work and signed releases and must never target production.

Provision a PKCS#8 Ed25519 key through `EVALS_DATASET_SIGNING_KEY_FILE`. The production app deploy script creates a root-only key at `/root/.caudals/app/evals-dataset-signing-key.pem` when absent, validates its type, and mounts a digest-versioned Docker secret at `/run/secrets/evals_dataset_signing_key`; it never places private key bytes in the service environment. With `EVALS_MIGRATION_DATABASE_URL_FILE` pointing at the migration-owner connection, run `npm run evals:release-check-stage-e`. The checker is read-only and passes only when migrations 043–044 exist, the `evals_runtime` group and every login member are least-privileged and own no evaluation objects, required immutable triggers are enabled, the signing key is Ed25519 and `EVALS_EXPERT_WORK_ENABLED=true`. Its output contains identifiers/counts only. Keep key material out of commands, logs and documentation.

Apply migrations with `tsx scripts/evals/migrate.ts`; the migrator holds the `caudals-evals-migrations` advisory lock and verifies checksums on rerun. Both Stage E down files intentionally refuse destructive rollback. Disable the feature flag and forward-repair instead. Rotate signing keys by preserving the old public key/fingerprint for historic customer artifacts, replacing only the mounted private-key secret, rerunning the release check and redeploying an immutable image. Details and acceptance evidence are in `docs/evals/work-packages/WP-14.md`–`WP-15.md`.

## Tool Selection Matrix

- Schema migrations and rollback checks: `psql` against a disposable PostgreSQL container first, then the target database
- Ad hoc DB inspection/read queries: `psql` over Tailscale/SSH tunnel
- Social drafts, integrations, uploads and analytics: Postiz CLI/skill; preserve Ops review gates
- Warmbly CRM/campaign/mailbox/inbox operations: `warmbly` CLI + `warmbly-cli` skill
- Prospect search/enrichment/import: matching Apollo or RocketReach CLI/MCP + skill
- Instance recovery/accounts: explicitly scoped `warmblyctl` on the live Warmbly backend
- DNS and edge inspection: Cloudflare `cf`; private host access: Tailscale + SSH
- Private customer execution: `caudals-evals` runner
- Existing Hermes prospecting operations: host/service diagnostics + Leads runbooks
- Artifact creation/connected editing: corresponding artifact/Drive skill and available connector
- Historical local webhook simulation/object support: Stripe CLI; MCP only when enabled for that task
- PR/issues/review actions: GitHub MCP
- CI/CD run diagnostics: `gh`
- Frontend runtime inspection: browser/devtools tooling

## PostgreSQL Operational Context

Runtime:

- Target VPS SSH endpoints:
  - `atlantic` (primary app/platform): `caudals@atlantic` (or `caudals@caudals-1`, Hetzner Tailscale host `100.118.70.90`). Public SSH on `168.119.49.95` is not an operations path.
  - `arctic` (Warmbly outreach): `caudals@arctic` (AWS Tailscale host `100.93.226.39`). Public SSH on `51.102.90.206` is not an operations path.
- PostgreSQL target: private `caudals-postgres` swarm service on `dokploy-network`
- Runtime image: `caudals-postgres:16-pgvector-cron` from `infra/postgres/Dockerfile`
- App service: `caudals-app_app` (Swarm stack `caudals-app`,
  `infra/app-stack.yml`, deployed by `scripts/deploy-app-stack.sh`). Its
  runtime env, including database, Stripe and Resend secrets, is mounted as the
  `app_runtime_env_<digest>` Docker secret at `/run/secrets/app_runtime_env`,
  built from root-only `/root/.caudals/app/credentials.env`. The service's
  start command (`command` in `infra/app-stack.yml`) sources that file with
  `set -a` before `npm run start`, and `scripts/deploy-app-stack.sh` refuses a
  credentials file that does not source cleanly. `docker exec` does not inherit
  that environment: ad-hoc commands must source `/run/secrets/app_runtime_env`
  themselves, and the completion gate's app probes replay the live
  `next-server` process environment instead. The per-secret
  `*_FILE` fallbacks (`DATABASE_URL_FILE`, `BETTER_AUTH_SECRET_FILE`,
  `STRIPE_SECRET_KEY_FILE`, `STRIPE_WEBHOOK_SECRET_FILE`,
  `RESEND_API_KEY_FILE`) remain supported.
- Required extensions for the operator schema: `pgcrypto`, `citext`, `pg_stat_statements`, `vector`, `pg_trgm`, `pg_cron`
- Schema migrations: `db/migrations/*`
- Rollbacks: `db/rollbacks/*`

Direct SSH runtime inspection is allowed when local context is stale:

- `ssh caudals@atlantic` (or `ssh caudals@caudals-1`)
- `ssh caudals@arctic` (or `ssh caudals@artic`)
- Public root SSH is disabled on both targets; all operational access is via Tailscale.

Legacy Supabase containers, images, volumes, network, and host filesystem tree have been decommissioned. Verified encrypted database and filesystem archives are kept under `/root/.caudals/backups`.

The commands below refer to a **historical May migration image**, not the current
deployed app. For a current registry outage, first identify the service’s current
and PreviousSpec digest and available compatible local images. Do not restore an
old image against the current schema without a verified recovery plan. Historical archive commands:

- `sha256sum -c /root/.caudals/backups/caudals-image-phase1-2887c39-20260511T163435Z.tar.gz.sha256`
- `gunzip -c /root/.caudals/backups/caudals-image-phase1-2887c39-20260511T163435Z.tar.gz | docker load`

The 2026-06-30 Hetzner migration backup set also contains verified image
archives for `caudals-postgres:16-pgvector-cron`, `mariomedpar/caudals:latest`,
and the deployed orchestration image under
`/root/.caudals/backups/hetzner-migration-20260630T171257Z/images/`.

## Private Dashboard Access

Internal dashboards are Tailscale-only and must never be exposed on the public
interface. On the Hetzner production host (`atlantic`, Tailscale
`100.118.70.90`) they are served by the `caudals-dashboards` nginx reverse-proxy
container, whose published ports bind **only** to the Tailscale IP (so they have
no public listener); a UFW rule additionally allows `7443:7453` only on
`tailscale0`. Browse from any Tailnet device at `http://atlantic:<port>`:

| Port | Dashboard | Upstream service |
| --- | --- | --- |
| 7443 | Dokploy | `dokploy:3000` |
| 7444 | Umami (internal only) | `caudals-umami-znhrpr-umami-1:3000` |
| 7445 | Grafana | `caudals-observability_grafana:3000` |
| 7446 | Prometheus | `caudals-observability_prometheus:9090` |
| 7447 | Alertmanager | `caudals-observability_alertmanager:9093` |
| 7448 | Temporal UI (legacy) | `caudals-workflow_ui:8080` |
| 7449 | Dagster (legacy) | `caudals-orchestration_webserver:3000` |
| 7450 | Label Studio (legacy) | `caudals-labeling_label-studio:8080` |
| 7451 | lakeFS (legacy) | `caudals-lakehouse_lakefs:8000` |
| 7452 | Qdrant (`/dashboard`, legacy) | `caudals-vector_qdrant:6333` |
| 7453 | MinIO console | `caudals-object-storage_minio:9001` |

As of 2026-09-28 Umami, Temporal UI and MinIO upstream containers are running.
The dedicated observability stack and other legacy tools were not observed.
This table is a retained route map, not an HTTP health check of each dashboard;
verify proxy configuration and upstream health before using a port. Current
service state is maintained in `VPS_RUNTIME.md`.

Proxy config and a redeploy helper live under `/root/.caudals/dashboards/`
(`nginx.conf`, `redeploy.sh`). To add or change a dashboard, edit `nginx.conf`
and run `sudo bash /root/.caudals/dashboards/redeploy.sh`.

CVAT (legacy) is not proxied: its split UI/API/OPA runtime needs host-based
routing, so reach it through an ad-hoc tunnel if ever needed.

The public `analytics.caudals.com` route was removed for security: the Umami
container's Traefik labels were stripped in
`/etc/dokploy/compose/caudals-umami-znhrpr/code/docker-compose.yml`, the
generated `compose-caudals-umami-znhrpr.yml` was deleted, and the container was
recreated (APP_SECRET preserved). Umami is now reachable only via the internal
`7444` dashboard. Consequence: the marketing site's client-side Umami tracking
(`components/legal/site-analytics.tsx` loads
`https://analytics.caudals.com/script.js`, allowlisted in `next.config.js` CSP)
no longer resolves; remove those references and redeploy to stop the dead-script
console errors, or repoint tracking. Custom funnel events fall back to the app's
own `/api/analytics/track`.

Public routing is otherwise unaffected: only `80/443` (web) and `41641/udp`
(Tailscale) are open on the public interface.

The DigitalOcean-to-Hetzner migration completed on 2026-06-30. Production now
runs on the Tailscale hostname `atlantic` (`168.119.49.95`): Dokploy Traefik
owns public `80/443`, serves valid Let's Encrypt certs, and routes to the local
app, Umami, and private stacks. HAProxy is stopped and disabled (config retained
for rollback). The June cutover retained DigitalOcean as a rollback origin with
then-verified canonical backups under `/root/.caudals/backups`
(`hetzner-migration-20260630T171257Z` and `hetzner-cutover-<ts>`). Its current
availability was not checked on 2026-09-28; do not assume it is a ready failover
node or delete retained recovery material without the appropriate authorization. Observability
and Umami analytics history were preserved across the move. Agents may install
official Cloudflare and Tailscale CLIs or MCPs when scoped credentials are
available; never print or commit those credentials.

## PostgreSQL Migration Usage Pattern

1. Validate SQL on a disposable database before touching a shared database:
   - `docker run --rm --name caudals-sqlcheck -e POSTGRES_PASSWORD=postgres -p 55433:5432 -d pgvector/pgvector:pg16`
   - `PGPASSWORD=postgres psql -h 127.0.0.1 -p 55433 -U postgres -v ON_ERROR_STOP=1 -f db/migrations/<file>.sql`
   - `PGPASSWORD=postgres psql -h 127.0.0.1 -p 55433 -U postgres -v ON_ERROR_STOP=1 -f db/rollbacks/<file>_down.sql`
   - `docker rm -f caudals-sqlcheck`
2. Apply to integration/production only after review:
   - `docker exec -i $(docker ps --filter label=com.docker.swarm.service.name=caudals-postgres --format '{{.Names}}' | head -n 1) psql -U caudals_app -d caudals -v ON_ERROR_STOP=1 < db/migrations/<file>.sql`
3. Record verification in deployment and phase evidence.

Hard rules:

- Keep schema changes in `db/migrations/*` with matching rollback files in `db/rollbacks/*`.
- Never expose DB credentials in docs, command output, or captured media.
- Do not rely on raw public database ports; use SSH tunnels or Tailscale/private access paths only.
- Do not delete encrypted migration backups unless a newer verified backup exists.

## Better Auth Migration Pattern

1. Use PostgreSQL as the Better Auth adapter target.
2. Keep operator sessions cookie-based, httpOnly, SameSite=Lax, rotating, and refresh-on-use.
3. Allow password-only operator access; keep TOTP and passkeys available as optional hardening.
4. Preserve emails and roles when mapping legacy auth users into operator identity records.
5. Force password reset on first login after migration.
6. Record JIT-elevation events into `audit_event`.

Retained authentication and domain tooling (the legacy `/admin` UI is removed):

- Server config: `lib/auth/better-auth.ts`
- Shared auth options/table mapping: `lib/auth/better-auth-options.ts`
- Client wrapper for future UI migration: `lib/auth/better-auth-client.ts`
- Next.js endpoint: `app/(app)/api/auth/[...all]/route.ts`
- Identity schema migration: `db/migrations/003_better_auth_identity.sql`
- JIT production-DB elevation: `db/migrations/008_operator_elevation.sql`,
  `lib/auth/operator-elevation.ts`, `lib/actions/operator-elevation-actions.ts`,
  `OPERATOR_CONSOLE_REQUIRE_JIT_ELEVATION=true`
- Delivery signing keys: `lib/actions/signing-key-actions.ts`; private keys are encrypted
  before insertion into `signing_key.encrypted_private_key`.
- Cross-module record notes: `db/migrations/010_operator_record_note.sql`,
  `lib/actions/operator-record-note-actions.ts`; create/update/delete operations
  write `audit_event` rows.
- Generic operator record CRUD: `lib/operator/record-crud.ts`,
  `lib/actions/operator-record-actions.ts`; descriptor-gated create/update/delete
  operations write `audit_event` rows, with append-only exceptions for immutable
  records.
- Operator security enrollment: `npm run operator:security-status` reports
  MFA/passkey completion and reset-eligible counts without printing emails by
  default. TOTP and passkeys are optional hardening, so password-only operators
  are security-complete by policy. `-- --send-resets` is retained for future
  required-factor policies but should normally be a no-op; reset attempts write
  `audit_event` rows without email addresses in metadata. Use
  `-- --show-emails` only when an admin explicitly needs the pending address
  list.
- Password-reset links default to 30 minutes. Set
  `BETTER_AUTH_RESET_PASSWORD_TOKEN_EXPIRES_IN_SECONDS` to a value from `300` to
  `86400` seconds when coordinating migrated operator enrollment needs a longer
  reset window.
- Legacy account migration: `npm run migrate:supabase-auth -- --apply`

Install caveat:

- Better Auth `1.6.x` has optional peer resolution pressure with this repo's Vitest/Vite stack.
  Use `npm install --legacy-peer-deps` when adding or refreshing Better Auth packages until the Vite peer range is reconciled.

## Observability Runtime

- Sentry is wired through `instrumentation.ts`, `instrumentation-client.ts`,
  `app/global-error.tsx`, `sentry.server.config.ts`, `sentry.edge.config.ts`, and
  `lib/observability/sentry-config.ts`; server runtime DSN resolution lives in
  `lib/observability/sentry-server-config.ts`.
- Sentry stays disabled unless `SENTRY_DSN` or the server-only
  `SENTRY_DSN_FILE` Docker secret fallback is set. Keep `sendDefaultPii=false`
  unless a privacy review explicitly approves a change.
- `.env.sentry-build-plugin` is ignored and is only for Sentry source-map
  upload auth. It does not enable runtime error delivery; rotate exposed auth
  tokens before enabling uploads. Source-map upload is additionally gated by
  `SENTRY_SOURCE_MAP_UPLOAD=true` so ordinary builds cannot use a local token
  by accident.
- `npm run observability:sentry-status -- --fail-on-disabled` reports whether
  error delivery is active without printing the DSN, and fails release gates
  when neither DSN source is configured. The runtime Docker image copies this
  plain Node probe so the same command can run inside the deployed app
  container.
- `npm run observability:configure-sentry` creates or mounts a Docker secret for
  `SENTRY_DSN_FILE` on the app service without printing the DSN. Provide
  `CAUDALS_SENTRY_DSN_FILE=/path/to/dsn` when the production DSN is available;
  the script sets `SENTRY_ENVIRONMENT`, `SENTRY_RELEASE`, and sample-rate envs.
- OpenTelemetry traces are registered from
  `lib/observability/opentelemetry.ts`. Set
  `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=http://caudals-observability-tempo:4318/v1/traces`
  and `OTEL_SERVICE_NAME=caudals-web` on the app service to export spans to the
  private Tempo service.
- Signal-specific `OTEL_EXPORTER_OTLP_TRACES_HEADERS` and generic
  `OTEL_EXPORTER_OTLP_HEADERS` are supported for OTLP HTTP headers; do not store
  secrets in repository files.
- Optional OpenTelemetry stdout traces remain available when
  `OTEL_STDOUT_ENABLED=true`. The stdout exporter is intended for VPS
  diagnostics and short-lived debugging; do not enable it permanently if logs
  may contain sensitive operational context.
- The private observability stack lives in `infra/observability/` and is
  deployed with `scripts/deploy-observability-stack.sh`. It runs Tempo, Loki,
  Prometheus, Alertmanager, Promtail, cAdvisor, and internal Grafana on
  `dokploy-network` without public published ports.
- `scripts/probe-observability-stack.sh` verifies private readiness endpoints
  for Tempo, Loki, Prometheus, Alertmanager, Promtail, cAdvisor, and Grafana
  from an ephemeral container attached to `dokploy-network`.
- `npm run platform:completion-status` runs the VPS-side completion gate
  against `CAUDALS_APP_SERVICE` (default `caudals-app_app`) and
  `CAUDALS_COMPLETION_BASE_URL` (default `https://caudals.com`). It checks
  landing-mode routing and exact public nav labels, Sentry, operator auth
  policy, the observability stack, object storage, app runtime configuration
  (Stripe, Resend), external alert routing, tracked secret leaks, plaintext
  runtime secret env names and the optional pentest tracker.
- The legacy checks are opt-in: readiness of the eight legacy private stacks,
  the legacy dataset schema, the intake-channel contracts and representative
  G-1–G-7 dataset-build evidence with an accepted buyer delivery run only with
  `CAUDALS_LEGACY_STACKS_GATE_ENABLED=true`, and report under `legacy.*` ids
  (`legacy.dataset_schema`, `legacy.dataset_build`, `legacy.intake_channels`,
  `legacy.cache`, `legacy.labeling`, `legacy.cvat`, `legacy.lakehouse`,
  `legacy.orchestration`, `legacy.workflow`, `legacy.operations`,
  `legacy.vector`). Otherwise the gate prints one `legacy` line saying they
  were skipped.
- As of 2026-09-11 the observability and object-storage stacks are not
  deployed on `atlantic`, so `observability.stack` and `storage.object_store`
  fail until they are redeployed (or object storage is explicitly waived).
- `npm run platform:runtime-config -- --fail-on-missing` checks the local
  Stripe and Resend runtime variables without printing secret values. The
  platform completion gate runs the same probe inside the deployed app container
  so Docker secret files are checked in their real mount location.
- `scripts/deploy-observability-stack.sh` keeps Alertmanager local/no-op by
  default; set `CAUDALS_ALERTMANAGER_WEBHOOK_URL_FILE` or
  `CAUDALS_ALERTMANAGER_WEBHOOK_URL` before redeploying to render a private
  external webhook receiver config outside the repository.
- `npm run observability:configure-alert-routing` validates and deploys that
  external Alertmanager webhook path without printing the webhook URL. Prefer
  `CAUDALS_ALERTMANAGER_WEBHOOK_URL_FILE=/path/to/url`.
- Promtail scrapes Docker logs through the Docker socket and labels streams by
  Swarm service name. Prometheus scrapes `alertmanager:9093`, `tempo:3200`,
  `loki:3100`, `promtail:9080`, `cadvisor:8080`, and itself, then sends
  private alerts to Alertmanager. External PagerDuty/on-call contact points
  still require production routing credentials outside the repository.
- Because this repository uses `npm install --legacy-peer-deps`, keep Sentry's
  OpenTelemetry peer packages explicit in `package.json`.

## Object Storage Runtime

- Caudals uses S3-compatible object storage for evaluation reports, run
  archives, JSONL exports, customer document uploads and existing legacy
  artifacts. The single-node VPS runtime can use the private MinIO stack;
  DigitalOcean Spaces remains the managed external target for hosted
  production.
- `npm run object-storage:deploy` deploys the private MinIO stack on
  `dokploy-network`, creates root-only generated credential files under
  `/root/.caudals/object-storage/`, creates matching Docker secrets, ensures the
  bucket exists, and wires the app service to `DO_SPACES_*_FILE` secret
  fallbacks. The production app stack declares the same private endpoint and
  credential-secret mounts so immutable app redeployments preserve that wiring.
- `npm run object-storage:probe` verifies MinIO private health, bucket
  existence, write/read/delete behavior, and no published ports from inside the
  Docker network.
- `npm run storage:probe` validates any externally reachable active
  S3-compatible configuration by writing, reading, and deleting a short private
  object. It requires
  `DO_SPACES_ENDPOINT`, `DO_SPACES_REGION`, `DO_SPACES_BUCKET`,
  optional `DO_SPACES_FORCE_PATH_STYLE=true` for private compatible stores,
  `DO_SPACES_ACCESS_KEY_ID` or `DO_SPACES_ACCESS_KEY_ID_FILE`,
  `DO_SPACES_SECRET_ACCESS_KEY` or `DO_SPACES_SECRET_ACCESS_KEY_FILE`, and
  `NEXT_PUBLIC_DO_SPACES_CDN_URL`.
- The platform completion gate requires `storage.object_store` by default and
  runs the private MinIO stack write/read/delete probe. Set
  `CAUDALS_OBJECT_STORAGE_GATE_ENABLED=false` only for a documented external
  waiver, or set `CAUDALS_OBJECT_STORAGE_PROBE_MODE=direct` to probe a mounted
  external S3-compatible endpoint instead.
- Useful override variables: `CAUDALS_OBJECT_STORAGE_GATE_ENABLED`,
  `CAUDALS_OBJECT_STORAGE_PROBE_MODE`, `CAUDALS_OBJECT_STORAGE_PROBE_PREFIX`,
  `CAUDALS_OBJECT_STORAGE_STACK_NAME`, `CAUDALS_MINIO_IMAGE`,
  `CAUDALS_MINIO_API_URL`, `CAUDALS_OBJECT_STORAGE_BUCKET`, and
  `CAUDALS_OBJECT_STORAGE_NETWORK`.
- Keep object-storage credentials out of plaintext Docker service env. Use
  `DO_SPACES_ACCESS_KEY_ID_FILE` and `DO_SPACES_SECRET_ACCESS_KEY_FILE` for
  production.

## Legacy Private Stacks

Legacy dataset-build infrastructure, frozen in scope; actual runtime is stack-specific. The live public
funnel does not call it and new evaluation code must not depend on it;
app-code references are limited to Operator Console snapshot data, the legacy
CLI and frozen operator/supplier modules. When deployed, every stack runs on
`dokploy-network` with no published ports — keep it that way.

Status on `atlantic` (2026-09-28): Temporal and its UI are running; other
legacy dataset-build stacks in this table were not observed. The active
Postiz Redis is distinct from `infra/cache/`. Older removal/pruning records
do not establish today’s image or volume inventory. Preserve retained named
volumes, databases and secrets; consult `VPS_RUNTIME.md` before lifecycle work.

| Stack | Scripts | Definition | Secrets and storage | Dashboard |
| --- | --- | --- | --- | --- |
| Dagster orchestration | `orchestration:deploy` / `orchestration:probe` | `infra/orchestration/` | `dagster` DB in `caudals-postgres`; `dagster_postgres_password` | 7449 |
| Temporal workflow | `workflow:deploy` / `workflow:probe` | `infra/workflow/` | `temporal` and `temporal_visibility` DBs in `caudals-postgres`; `temporal_postgres_password` | 7448 |
| Label Studio | `labeling:deploy` / `labeling:probe` | `infra/labeling/` | dedicated Postgres in the stack; `label_studio_postgres_password`, `label_studio_secret_key` | 7450 |
| CVAT | `cvat:deploy` / `cvat:probe` | `infra/labeling/cvat-stack.yml` | own Postgres, Redis, Kvrocks, ClickHouse and OPA | not proxied |
| lakeFS | `lakehouse:deploy` / `lakehouse:probe` | `infra/lakehouse/` | generated secrets under `/root/.caudals/lakehouse/`; local blockstore volume | 7451 |
| Qdrant | `vector:deploy` / `vector:probe` | `infra/vector/` | `qdrant_api_key`; dedicated volume | 7452 |
| Redis | `cache:deploy` / `cache:probe` | `infra/cache/` | `redis_password`; dedicated volume | — |
| Marquez | `operations:deploy` / `operations:probe` | `infra/operations/` | `marquez` DB in `caudals-postgres`; `marquez_postgres_password` | — |

- Deploy scripts create root-only generated secret files under
  `/root/.caudals/<stack>/` when none are supplied, register Docker secrets, and
  never print generated values. Override variables are documented in each
  `scripts/deploy-*-stack.sh`.
- Do not extend these stacks or build on them. The evaluation runner uses a
  Postgres job queue instead (`docs/ARCHITECTURE.md`).
- To restore a stack, get human approval, run its deploy script on
  `atlantic` (`npm run <stack>:deploy`), and set
  `CAUDALS_LEGACY_STACKS_GATE_ENABLED=true` if the completion gate should
  require it again. The deploy scripts reuse the retained volumes, databases
  and secrets.
- CI no longer builds, pushes or deploys the Dagster image. The last published
  tags are `orchestration-latest` and
  `orchestration-88695970f5aba0bd42090d39a96f0301f0525986` (2026-09-07) in the
  app's Docker Hub repository; `CAUDALS_DAGSTER_BUILD_LOCAL=true npm run
  orchestration:deploy` builds `services/orchestration/` on the host instead.
- Deleting the retained volumes (about 3 GB, mostly CVAT ClickHouse data and
  logs) or the legacy databases is irreversible. It needs separate human
  approval and a verified backup.

## Host Disk Cleanup

`atlantic` has a 75 GB disk, and every deploy leaves a new image tag behind
(0.9–2.2 GB of unique layers each; Docker's containerd snapshotter keeps them
under `/var/lib/containerd`). `caudals-docker-cleanup.timer` runs
`scripts/host-docker-cleanup.sh` every hour (at :30 UTC, ±5 min); a burst of
deploys can add 10 images in three hours. It removes:

- stopped Swarm task containers that finished over 1 h ago (Swarm keeps
  several per service even with `task-history-limit 1`, and each pins its old
  image), and other stopped containers older than 24 h,
- images that are not the current or `PreviousSpec` (rollback) image of any
  Swarm service, not used by any container, not in
  `CAUDALS_CLEANUP_KEEP_REPOSITORIES` (default `caudals-postgres`, which is
  built on the host) and not built or pulled in the last 2 h,
- build cache older than 24 h, and anonymous volumes no container uses (named
  volumes, including the retained legacy ones, are never touched),
- journal beyond 200 MB and crash dumps older than 7 days.

At 90 % or more used it switches to a 1 h image age and prunes all unused build
cache. It exits 2 (the unit shows as failed) when the disk is still at 85 % or
more afterwards, because what remains is in use and needs a person.

- Install or update (from the host checkout, after changing the script):
  `sudo scripts/install-host-docker-cleanup.sh`. The script is copied to
  `/usr/local/sbin/caudals-docker-cleanup`, so deploys never change it.
- Preview: `sudo CAUDALS_CLEANUP_DRY_RUN=true caudals-docker-cleanup`.
- Run now: `sudo systemctl start caudals-docker-cleanup.service`.
- Logs: `journalctl -u caudals-docker-cleanup.service -n 100`.
- Overrides: `CAUDALS_CLEANUP_*` variables in
  `/etc/default/caudals-docker-cleanup` (see the script header).

## Stripe CLI Usage Pattern

Historical billing-tool reference only: marketplace checkout and its public
Stripe flow were removed. Do not use the endpoints below as a current smoke
suite or restore them as part of evaluation work.

1. Use only for local/test webhook simulation.
2. Forward webhooks:
   - `stripe listen --forward-to http://127.0.0.1:3000/api/webhooks/stripe`
3. Set emitted `whsec_...` secret in local env.
4. Trigger deterministic events:
   - `stripe trigger payment_intent.succeeded`
   - `stripe trigger payment_intent.payment_failed`
   - `stripe trigger transfer.created` / `transfer.failed` (frozen supplier-payout paths only)

Hard rules:

- Never commit Stripe secrets.
- Avoid live-mode side effects during local review.
- Preserve webhook idempotency checks in replay/debugging.

## Stripe MCP Usage Pattern

1. Prefer `list_*`/search tools before ID-specific fetches.
2. Treat write operations (`create_refund`, `cancel_subscription`, `update_subscription`) as high-risk.
3. Redact customer financial data from docs and user-facing output.

## Browser/Devtools Usage Pattern

1. Navigate to the changed route.
2. Inspect render and critical interactions.
3. Check console and failed network requests.
4. Review responsive behavior when layout changed.

## GitHub CLI (`gh`) Usage Pattern

1. `gh run list`
2. `gh run view <run-id>`
3. `gh run view <run-id> --log-failed`
4. `gh run watch <run-id>`

For failed runs, capture the run ID, failing job, and key error excerpt in the user-facing summary when relevant.

## Vulnerability Management

- `.github/dependabot.yml` checks npm, GitHub Actions, and Dockerfile base-image
  updates weekly.
- `.github/workflows/deploy.yml` runs Docker Scout CVE scanning against the
  pushed image tag and uploads the SARIF file as a workflow artifact without
  printing registry credentials.
- `.github/workflows/security-pentest-schedule.yml` opens or updates a quarterly
  penetration-test tracker issue for Security/CTO execution. Run
  `node scripts/create-pentest-tracker.mjs --dry-run` to preview the issue body
  without touching GitHub.

## Cost Envelope Checks (legacy build budgets)

- `db/migrations/024_build_cost_envelopes.sql` enforces build budget envelopes
  from append-only `cost_entry` rows. Cost entries above the hard build budget,
  LLM sub-budget, or external API sub-budget must carry an override reason; the
  trigger opens alerts and audit rows for soft thresholds, overrides, and margin
  retrospectives.
- Validate changes with a disposable Postgres run of migration `001`, migration
  `002`, migration `024`, a budget-overrun insert attempt, and
  `db/rollbacks/024_build_cost_envelopes_down.sql`.

## Escalation Runbooks

- `db/migrations/025_escalation_runbooks.sql` seeds canonical R-01..R-10
  runbooks and creates `escalation_case`; `027_security_incident_runbooks.sql`
  adds security-specific R-11..R-13 and routes new security events to R-11.
  Inserts auto-route by kind, open an `alert`, and write an `audit_event` for
  the selected runbook/on-call team.
- Validate changes with a disposable Postgres run of migration `001`, migration
  `002`, migration `025`, migration `027`, an escalation insert, and the
  matching rollback before applying to production.

## Security Review Library

- `db/migrations/026_security_review_library.sql` creates
  `security_review_artifact` and seeds public questionnaire answers, DPA
  review-path notes, and security packet items for `/security`.
- Validate changes with a disposable Postgres run of migration `001`, an
  internal organization row, migration `026`, a public artifact readback, and
  `db/rollbacks/026_security_review_library_down.sql`.

## Localization Guardrail

For translation-impacting work run:

- `npm run i18n:check-parity`
- optional strict sweep: `npm run i18n:check-parity -- --strict-orphans`

If the parity script is missing, update `lib/i18n/es.json`, `translations-es.json`, and `translations-source.json` manually and verify the JSON parses.

## Sensitive Data Rule

Never include secrets, tokens, private keys, webhook signing secrets, or unredacted financial data in repository docs or user-facing output.

## Local Setup Baseline

Prerequisites:

- Node.js `20+`
- npm `10+`
- PostgreSQL client tools (`psql`)
- Docker for disposable migration checks

Bootstrap:

1. `npm install`
2. `cp .env.example .env.local`
3. Populate required secrets in `.env.local` (PostgreSQL/Better Auth during migration, Stripe, DO Spaces, Resend).
4. `npm run dev`

## Caudals CLI

- Legacy dataset-build operations CLI, frozen. `npm run caudals -- help`
  lists its commands (build, lineage, license, PII scan, dataset publish,
  delivery signing, DSAR propagation, fixture seeding, intake validation);
  `bin/caudals.mjs` is the package binary shim.
- Commands that need external systems fail closed when configuration is
  missing; `build run` needs a reachable Dagster (`DAGSTER_URL`) unless
  `--dry-run` is set.
- Keep CLI inputs and outputs file-based for auditability. Do not paste secrets
  or private keys into docs, terminal transcripts, screenshots, or user-facing
  summaries.

## Core Script Catalog

- `npm run dev`: Next.js dev server
- `npm run build`: production build
- `npm run start`: run built app
- `npm run typecheck`: TypeScript checks (`tsc --noEmit`)
- `npm run lint`: ESLint
- `npm test -- --run`: Vitest suite
- `npm run e2e`: Playwright suite
- `npm run e2e:auth-smoke`: authenticated admin/buyer/supplier route smoke checks; do not use as a product acceptance signal unless explicitly updating authenticated route behavior
- `npm run perf:lighthouse`: Lighthouse CI budget check
- `npm run seed`: seed baseline DB data
- `npm run seed:test-fixtures`: deterministic fixture seed, including the
  representative delivered dataset build used by the opt-in legacy
  completion-gate checks
- `npm run migrate:supabase-auth`: dry-run legacy Supabase Auth to Better Auth
  operator-account migration; pass `-- --apply` to write rows
- `npm run migrate:public-funnel`: dry-run legacy Supabase public-funnel data migration; pass `-- --apply` to write rows
- `npm run fixtures:ensure`: fixture freshness verification/reseed
- `npm run storage:probe`: probe write/read/delete readiness of the mounted
  S3-compatible object-storage configuration
- `npm run object-storage:deploy`: deploy the private MinIO object-storage
  stack and wire the app service to Docker secret-file fallbacks
- `npm run object-storage:probe`: probe private object-storage health,
  bucket readiness, write/read/delete behavior, and port isolation
- `sudo scripts/install-host-docker-cleanup.sh`: install the periodic Docker
  cleanup timer on `atlantic` — see Host Disk Cleanup
- Legacy private stacks (frozen): `npm run {cache,labeling,cvat,lakehouse,orchestration,workflow,operations,vector}:deploy`
  and the matching `:probe` scripts — see Legacy Private Stacks
- `npm run caudals`: legacy operations CLI; pass command arguments after `--`
- `npm run i18n:check-parity`: EN/ES translation parity checks

## Useful Route-Level Checks

- `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 npx playwright test e2e/smoke.spec.ts --project=chromium`
- `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 npx playwright test e2e/public-routes.spec.ts --project=chromium`
- `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 npx playwright test e2e/authenticated-role-smoke.spec.ts --project=chromium` only for authenticated admin, buyer, supplier, API, or route-visibility changes

Operational env controls:

- `DATABASE_URL`
- `DATABASE_URL_FILE` (Docker secret-file fallback; `DATABASE_URL` wins when both are set)
- `CAUDALS_TENANT_ORG_ID` (optional tenant RLS scope; defaults to the seeded Caudals tenant id)
- `PUBLIC_BUYER_BRIEF_TENANT_ORG_ID` (optional public buyer-brief intake RLS scope; defaults to `CAUDALS_TENANT_ORG_ID`)
- `PUBLIC_BUYER_BRIEF_INTAKE_ENABLED` (default enabled; set `false` to keep `/contact` email-only)
- `PUBLIC_REST_V1_ENABLED` (default enabled; set `false` to disable `/v1/*`)
- `PUBLIC_REST_CATALOGUE_ENABLED` (default disabled; keeps `/v1/datasets/*` unpublished — the catalogue is out of scope)
- `PUBLIC_REST_V1_TENANT_ORG_ID` (optional `/v1/*` public intake RLS scope; defaults to the public buyer-brief tenant or `CAUDALS_TENANT_ORG_ID`)
- `BUYER_WORKSPACE_V1_ENABLED` (default enabled; set `false` to hide read-only subscription, integration, and billing panels on `/buyer`)
- `BETTER_AUTH_SECRET`
- `BETTER_AUTH_SECRET_FILE` (Docker secret-file fallback; `BETTER_AUTH_SECRET` wins when both are set)
- `BETTER_AUTH_URL`
- `BETTER_AUTH_RESET_PASSWORD_TOKEN_EXPIRES_IN_SECONDS` (default `1800`, valid range `300`-`86400`)
- `OPERATOR_CONSOLE_REQUIRE_SECURITY_ENROLLMENT` (legacy; ignored by current code, keep unset or `false`)
- `SUPPLIER_PORTAL_ENABLED` (default enabled; set `false` to hide `/supplier`)
- `SUPPLIER_PORTAL_V1_ENABLED` (default enabled; set `false` to hide read-only payout and Stripe Connect panels on `/supplier`)
- `MODALITY_CONTRACTS_ENABLED` (default enabled; set `false` to block operator modality-contract and enrichment writes)
- `RELEASE_DOCUMENTATION_ENABLED` (default enabled; set `false` to block generated release documentation validation)
- `COMPLIANCE_CONTROL_SCOPING_ENABLED` (default enabled; set `false` to block SOC 2 / ISO 27001 scoping validation)
- `SENTRY_DSN` (enables Sentry when non-empty)
- `SENTRY_DSN_FILE` (server-only Docker secret-file fallback for `SENTRY_DSN`; `SENTRY_DSN` wins when both are set)
- `SENTRY_ENVIRONMENT`
- `SENTRY_RELEASE`
- `SENTRY_TRACES_SAMPLE_RATE` (default `0`)
- `SENTRY_PROFILES_SAMPLE_RATE` (default `0`)
- `SENTRY_SOURCE_MAP_UPLOAD` (set `true` only when a valid rotated `SENTRY_AUTH_TOKEN` is available for build-time upload)
- `STRIPE_SECRET_KEY_FILE` / `STRIPE_WEBHOOK_SECRET_FILE` (Docker secret-file fallbacks; direct env vars win when both are set)
- `RESEND_API_KEY_FILE` (Docker secret-file fallback; `RESEND_API_KEY` wins when both are set)
- `DO_SPACES_ENDPOINT`
- `DO_SPACES_REGION`
- `DO_SPACES_BUCKET`
- `DO_SPACES_FORCE_PATH_STYLE` (set `true` for private S3-compatible stores
  that require path-style addressing)
- `DO_SPACES_ACCESS_KEY_ID_FILE` (Docker secret-file fallback;
  `DO_SPACES_ACCESS_KEY_ID` wins when both are set)
- `DO_SPACES_SECRET_ACCESS_KEY_FILE` (Docker secret-file fallback;
  `DO_SPACES_SECRET_ACCESS_KEY` wins when both are set)
- `NEXT_PUBLIC_DO_SPACES_CDN_URL`
- `CAUDALS_LEGACY_STACKS_GATE_ENABLED` (default `false`; set `true` to make
  the completion gate require the frozen legacy stacks and dataset-build
  evidence)
- `CAUDALS_OBJECT_STORAGE_GATE_ENABLED` (default `true`; set `false` only for a
  documented external waiver)
- `CAUDALS_OBJECT_STORAGE_PROBE_MODE` (default `stack`; use `direct` for
  external S3-compatible endpoints)
- `CAUDALS_OBJECT_STORAGE_STACK_NAME` (default `caudals-object-storage`)
- `CAUDALS_OBJECT_STORAGE_NETWORK` (default `dokploy-network`)
- `CAUDALS_OBJECT_STORAGE_BUCKET` (default `caudals-storage`)
- `CAUDALS_MINIO_API_URL` (default `http://caudals-object-storage-minio:9000`)
- `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` (set to Tempo OTLP HTTP in production)
- `OTEL_EXPORTER_OTLP_TRACES_HEADERS` / `OTEL_EXPORTER_OTLP_HEADERS` (optional
  OTLP HTTP headers; do not commit secret values)
- `OTEL_STDOUT_ENABLED` (default disabled; set `true` for short-lived stdout spans)
- `OTEL_SERVICE_NAME` (default `caudals-web`)
- `CAUDALS_OPERATIONS_STACK_NAME` (default `caudals-operations`)
- `CAUDALS_OPERATIONS_NETWORK` (default `dokploy-network`)
- `CAUDALS_MARQUEZ_POSTGRES_SECRET_FILE` (optional server-only password file
  used by `npm run operations:deploy`)
- `TEST_FIXTURE_MAX_AGE_HOURS` (default `168`)
- `TEST_FIXTURE_AUTO_RESEED` (default `true`)

## Environment Variable Categories

- PostgreSQL/Better Auth: `DATABASE_URL` or `DATABASE_URL_FILE`, optional `CAUDALS_TENANT_ORG_ID`, `BETTER_AUTH_SECRET` or `BETTER_AUTH_SECRET_FILE`, `BETTER_AUTH_URL`
- Legacy migration-only auth/data: active runtime no longer uses Supabase; use `LEGACY_SUPABASE_DATABASE_URL` only for explicit one-off migration reruns from a verified legacy backup/source
- Stripe: publishable key, secret key or secret file, webhook secret or secret file
- Resend: API key or secret file, sender addresses, audience/segment IDs
- Object storage: S3-compatible endpoint, region, bucket, access key or
  secret-file fallback, secret key or secret-file fallback, CDN URL, optional
  private MinIO stack variables, object-storage completion-gate waiver flag
- Newsletter (Caudals Ops): optional `LEADS_NEWSLETTER_API_URL` override. The
  default is `https://ops.caudals.com/api/newsletter`; it is not a secret.
- Content attribution (Caudals Ops): optional `LEADS_ATTRIBUTION_API_URL`
  override. The default is
  `https://ops.caudals.com/api/attribution/public`; it is not a secret.
  Stable content links use `/r/<short-code>`, record a first-party click in the
  CRM, append UTM fields, and carry only opaque journey IDs into the landing
  session. The public site never assigns a CRM identity.
- Routing/deploy: app hostnames, marketing hostnames, public app URL
- Observability: Sentry DSN/environment/release/sample rates,
  OpenTelemetry OTLP trace export to Tempo, and opt-in OpenTelemetry stdout
  export
- Legacy private stacks (frozen): stack, image, service and secret names for
  Dagster, Temporal, Label Studio, CVAT, lakeFS, Qdrant, Redis and Marquez; see
  each `scripts/deploy-*-stack.sh`

## Newsletter Signup Wiring

- The hero box and `/newsletter` both post to `/api/newsletter`. That route only
  rate-limits and validates; the subscriber record, the consent trail and the
  confirmation email belong to the public Leads Node API.
- Signup is **double opt-in**: the API creates a `pending` subscriber and only
  the signed confirmation link makes the address eligible for delivery.
- The archive reads the same narrow Leads API. Neither this site nor its bundle
  receives a PostgreSQL connection, Supabase key or Resend credential.
- Resend credentials live in the secret-backed Leads service, not in this app.

## Public Surface Release Checks

- There is no landing-mode flag. The public site is the landing page and its
  funnel; the removed marketplace pages simply do not exist in the build.
- Cloudflare managed crawler controls can prepend bot-specific rules to the application's `/robots.txt`. After changing crawler policy, verify the production response itself—not only `app/robots.ts`—and configure Cloudflare AI crawler controls so they do not contradict the application's public-content allow rules for search and AI discovery bots.
- SEO/GEO release checks should fetch `/robots.txt`, `/sitemap.xml`, every referenced subsitemap, and `/llms.txt` through the public Cloudflare hostname, then confirm that private routes remain absent.
- After a deploy that adds or changes public pages, run `npm run seo:indexnow`. It submits every URL in `/page-sitemap.xml` to IndexNow (Bing, and through it ChatGPT search and Copilot). The key is public by design and is served from `public/<key>.txt`; the script and that file must change together.
- Search-console verification tags come from `GOOGLE_SITE_VERIFICATION` and `BING_SITE_VERIFICATION` (or their `NEXT_PUBLIC_` forms) at build time.
- A crawler's view of a page: `curl -A "GPTBot/1.2" https://caudals.com/es/contact` must show `<title>`, the canonical and the `hreflang` set inside `<head>`, and `<html lang>` must match the URL's locale.

## Route Surface Gate

- Removed legacy routes stay blocked: `/browse`, `/contributor`, `/dashboard`,
  `/pwa` (the web app manifest points to public landing surfaces only),
  `/requester`, `/admin` and all `/admin/*` subroutes. The retired dashboard
  returns 404 regardless of session cookies or module query parameters.
- The pre-pivot marketplace surfaces were deleted and return `404`: `/buyer`,
  `/supplier`, `/v1/*`, `/security`, `/pricing`, `/docs`, `/about`,
  `/careers`, `/catalogue`, plus the Stripe webhook, uploads and tRPC API
  routes. `scripts/check-platform-completion.sh` (`check_routes`) asserts it.

## Public Demo Operations

- Primary model inference runs on the private DGX Spark (`bluehawana/deepseek-v4-flash:iq2_m` via Ollama at `http://192.168.70.19:11434/v1`, resolved through `EVALS_DGX_ENDPOINT_FILE` / `DEMO_DGX_ENDPOINT`). It requires no external API key.
- Flags and optional overrides live in the app's root-only `credentials.env` on `atlantic`: set flags with `sudo scripts/set-app-credentials.sh DEMO_ENABLED` (value `true` on stdin) and `DEMO_BROWSER_ENABLED=true` the same way; the next app deploy rebuilds the `app_runtime_env` secret. The browser worker's `EVALS_BROWSER_DEMO_ENABLED` is set in `infra/evals/production-stack.yml`.
- Usage: `SELECT * FROM demo.llm_usage ORDER BY day DESC LIMIT 7` tracks calls made on the daily safety limit (`DEMO_DAILY_MODEL_CALLS`, default 200).
- Runs: `SELECT phase, error_code, target_kind, target_host, llm_calls, created_at, finished_at FROM demo.run ORDER BY created_at DESC LIMIT 20` (as `postgres`). A run stuck for 25 minutes is failed as `interrupted` by the sweeper; expired runs are deleted.
- Local end to end: `eval "$(scripts/evals/test-db.sh up)"`, start the "Demo dev" launch configuration (port 3100), and for website chats run the demo browser loop with local Chromium as in `.lab/demo-browser.mts`. Local runs route to the DGX Spark via WireGuard.

## Troubleshooting Quick Hits

- `permission denied for table ...`:
  - confirm `app.current_org_id` and service-role session settings,
  - inspect the table's RLS policy,
  - retry with a read-only query before any mutation.
- `extension "vector" is not available`:
  - use a Postgres image/runtime with pgvector installed,
  - verify `CREATE EXTENSION vector;` on a disposable database before applying migrations.
- `Unable to acquire lock at .next/dev/lock` during Playwright:
  - use `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000` if dev server is already running.
- `browserType.launch: Executable doesn't exist` during Playwright:
  - run `npx playwright install chromium`,
  - on a fresh VPS, run `npx playwright install-deps chromium` if host libraries are missing.
- `next build` exits through the PTY without diagnostics on the small VPS:
  - rerun as `NODE_OPTIONS=--max-old-space-size=2048 NEXT_PRIVATE_BUILD_WORKER=1 npm run build` and capture output to a temp log if needed.
- Sentry/Turbopack warns about nested `import-in-the-middle` versions:
  - confirm the build still reaches `Compiled successfully` and finishes the route table,
  - keep `@opentelemetry/instrumentation` explicit unless Sentry changes its peer packaging.
- Stripe webhook failures:
  - verify `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`,
  - inspect the `stripe_webhook_event` replay/idempotency table.
