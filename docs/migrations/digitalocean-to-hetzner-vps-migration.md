# DigitalOcean to Hetzner VPS Migration

## Status

Cutover completed on 2026-06-30. Hetzner is now the live production origin.
Cloudflare proxies `caudals.com`, `www.caudals.com`, `app.caudals.com`,
`www.app.caudals.com`, and `analytics.caudals.com` to the Hetzner public IP
`168.119.49.95`, where the restored Dokploy Traefik terminates TLS (existing
Let's Encrypt certificates) and routes to the local app, Umami, and private
stacks. The temporary HAProxy pass-through to DigitalOcean was stopped and
disabled during the swap; its config is retained on Hetzner for fast rollback.

The DigitalOcean droplet remains online and untouched as the rollback origin:
its app service is still `1/1`, and two verified backup sets are retained under
`/root/.caudals/backups` (`hetzner-migration-20260630T171257Z` full set and the
`hetzner-cutover-<ts>` final cutover dumps). Rollback is a Hetzner-local revert
(stop Dokploy Traefik, `systemctl start haproxy`) which restores the
Cloudflare → Hetzner-HAProxy → DigitalOcean serving path in seconds without any
Cloudflare/DNS change.

Earlier staging history: a verified pre-cutover live source backup set was
created on the DigitalOcean VPS, and Hetzner was hardened, Tailscale-enrolled,
restored, and privately probed before the cutover window. During staging,
public `80/443` on Hetzner were handled by HAProxy as a TCP pass-through to the
old DigitalOcean origin so Cloudflare traffic kept serving from the old backend
while the target stack was staged.

Goal: migrate Caudals from the current DigitalOcean droplet to the Hetzner
cost-optimized VPS at `168.119.49.95` without losing the public funnel, Dokploy,
Docker Swarm services, private operations services, secrets, backups, Tailscale
access, route protections, auditability, or rollback ability.

## Server Access

| Role | Endpoint | Current state | Use |
| --- | --- | --- | --- |
| Source production VPS | `ssh root@ubuntu-caudals` | DigitalOcean droplet over Tailscale `100.92.160.68`; public IPv4 `161.35.200.8` | Read source state, create final backups, rollback |
| Target Hetzner VPS | `ssh caudals@caudals-1` | Hardened Ubuntu host `caudals-1`; Tailscale IP `100.118.70.90`; public SSH blocked by UFW except on `tailscale0` | Target administration and staged restore checks |
| Target public IPv4 | `168.119.49.95` | Public web ports `80/443` currently run temporary HAProxy to DigitalOcean; do not use public SSH for routine operations | Final DNS origin after cutover |

Do not treat public SSH as an operations path. Use `caudals@caudals-1`.
Root SSH and password authentication are disabled; public TCP `22` timed out
from the operator Mac after UFW was limited to `tailscale0`.

The old DigitalOcean VPS must keep serving production until the migration is
complete and `caudals.com` points to the Hetzner VPS. Do not decommission,
disable, or destructively clean the source VPS during migration.

## Source VPS Audit

Observed through `root@ubuntu-caudals`.

- Host: `ubuntu-caudals`
- Provider: DigitalOcean Droplet
- OS: Ubuntu 24.04.3 LTS
- Kernel: `6.8.0-124-generic`
- Public IPv4: `161.35.200.8`
- Tailscale IPv4: `100.92.160.68`
- Tailscale version: `1.98.4`
- Disk: 116 GB root volume, about 52 GB used
- Memory: 3.8 GiB RAM plus 4 GiB swap, with active swap use
- Docker: `29.0.1`, single-node Swarm active
- Firewall: UFW active, default deny incoming, default deny routed
- Publicly allowed ports: `80/tcp`, `443/tcp`, `443/udp`, `41641/udp`
- Tailscale-only allowed ports: `22/tcp`, `7443/tcp`, `7444/tcp`
- Security services: `tailscaled`, `ufw`, `fail2ban`, `unattended-upgrades`,
  `docker`, and `nginx` are active
- Private dashboards:
  - Dokploy: `http://ubuntu-caudals:7443`
  - Umami: `http://ubuntu-caudals:7444`

Current Docker/Swarm services include:

- Dokploy: `dokploy/dokploy:latest`, `dokploy-postgres`, `dokploy-redis`,
  `dokploy-traefik`
- App: `caudalsdep-caudals-vgbvxp`, image `mariomedpar/caudals:latest`
- Database: `caudals-postgres`, image `caudals-postgres:16-pgvector-cron`
- Operations stacks on `dokploy-network`:
  - `caudals-object-storage` / MinIO
  - `caudals-cache` / Redis
  - `caudals-orchestration` / Dagster webserver, daemon, code server
  - `caudals-workflow` / Temporal server and UI
  - `caudals-labeling` / Label Studio and PostgreSQL
  - `caudals-cvat` / CVAT server, UI, workers, Postgres, Redis/Kvrocks,
    ClickHouse, OPA
  - `caudals-vector` / Qdrant
  - `caudals-operations` / Marquez
  - `caudals-lakehouse` / lakeFS
  - `caudals-observability` / Prometheus, Loki, Tempo, Grafana, Alertmanager,
    Promtail, cAdvisor
- Compose services:
  - `caudals-umami-znhrpr-umami-1`
  - `caudals-umami-znhrpr-db-1`

Persistent named volumes include the expected production volumes:

- `caudals-postgres-data`
- `dokploy-postgres-database`
- `dokploy-docker-config`
- `caudals-object-storage-minio-data`
- `caudals-cache-redis-data`
- `caudals-labeling-label-studio-data`
- `caudals-labeling-postgres-data`
- `caudals-labeling-cvat-*`
- `caudals-lakehouse-lakefs-data`
- `caudals-vector-qdrant-storage`
- `caudals-observability_*`
- `caudals-operations_marquez_data`
- `caudals-umami-znhrpr_db-data`

Docker secret names present on the source include:

- `caudals_database_url`
- `caudals_postgres_password`
- `caudals_better_auth_secret`
- `caudals_stripe_secret_key`
- `caudals_stripe_webhook_secret`
- `caudals_resend_api_key`
- `caudals_object_storage_access_key_id`
- `caudals_object_storage_secret_access_key`
- `caudals_observability_grafana_admin_password`
- `caudals_sentry_dsn_20260516213340`
- `dagster_postgres_password`
- `temporal_postgres_password`
- `label_studio_postgres_password`
- `label_studio_secret_key`
- `caudals_cvat_postgres_password`
- `qdrant_api_key`
- `redis_password`
- `marquez_postgres_password`
- `lakefs_*`

Root-only generated state exists under `/root/.caudals`, including backup image
archives and service-generated credential files. Known local app image backups:

- `/root/.caudals/backups/caudals-image-phase1-c648ef9-20260511T121804Z.tar.gz`
- `/root/.caudals/backups/caudals-image-phase1-2887c39-20260511T163435Z.tar.gz`
- `/root/.caudals/backups/hetzner-migration-20260630T171257Z`

The `hetzner-migration-20260630T171257Z` backup set was created while the
DigitalOcean source stayed live and serving production. `SHA256SUMS`
verification passed, and the set includes sanitized Docker/UFW/Tailscale
inventory, five PostgreSQL dump files, 22 Docker volume archives, three Docker
image archives, and Dokploy/root Caudals config archives. Because there was no
write freeze, it is a pre-cutover rollback artifact, not the final source backup
required immediately before DNS cutover. The live CVAT ClickHouse volume archive
recorded tar churn while the service was running.

## Source Drift to Improve

Do not copy these source-server problems blindly:

1. The app service currently carries sensitive runtime values as Docker service
   environment variables. The Hetzner deployment should use Docker secrets and
   `_FILE` fallbacks wherever the code supports them.
2. The app service still has stale Supabase environment variable names even
   though active runtime is PostgreSQL. Preserve only values still required by
   current code; remove retired Supabase runtime keys from the new app service
   after verification.
3. `dokploy-compose-traefik-sync.service` fails repeatedly because
   `/etc/dokploy/traefik/dynamic/compose-supabase.yml` is immutable and cannot
   be unlinked. Fix by removing the stale immutable file after a backup, or by
   retiring that sync service if it is no longer needed.
4. Source operations are effectively root-centric. The target should use a
   non-root operations user with explicit sudo, and reserve root for bootstrap
   and break-glass access.
5. Docker exposes Swarm listener ports locally; the old host blocks them from
   public `eth0` with firewall rules. Recreate equivalent `DOCKER-USER` or UFW
   protection before running Swarm on Hetzner.
6. Current verified backups are local to the source VPS. Keep migration backups
   on the DigitalOcean source VPS under `/root/.caudals/backups`; transfer
   copies to Hetzner only for restore and verification.

## Target Hetzner Audit

Observed through `root@168.119.49.95` before bootstrap hardening and
`caudals@168.119.49.95` after the non-root operator was created.

- Host: `caudals-1`
- Provider: Hetzner vServer
- OS: Ubuntu 24.04.4 LTS
- Kernel: `6.8.0-117-generic`
- Public IPv4: `168.119.49.95`
- Public IPv6: `2a01:4f8:c015:5a63::1`
- Disk: 76 GB root volume, about 1.2 GB used before bootstrap packages and
  swapfile creation
- Memory: 7.6 GiB RAM plus a persistent 4 GiB swapfile with `vm.swappiness=10`
- Current packages/tools: Docker Engine `29.6.1`, Docker Buildx `0.35.0`,
  Tailscale `1.98.8`, `psql` `16.14`, `git`, `rsync`, `jq`, `fail2ban`,
  `unattended-upgrades`, Node, npm, and Docker Compose
- Missing or not available to the agent: `gh`, Cloudflare tooling credentials,
  Docker Hub credentials for `mariomedpar/caudals`, and external provider
  verification credentials
- Tailscale is enrolled as `caudals-1`; `tailscale status --self` reports
  `100.118.70.90`
- UFW is active, default deny incoming/default allow outgoing/default deny routed
- Public UFW allowances: `80/tcp`, `443/tcp`, `443/udp`, and `41641/udp`;
  `22/tcp` is allowed only on `tailscale0`
- A persistent Docker `DOCKER-USER` guardrail is active for IPv4 and IPv6:
  public forwarded container traffic is allowed only on web ports, Tailscale is
  allowed once enrolled, and other forwarded public-interface Docker traffic is
  dropped
- SSH listens on the host, but UFW allows `22/tcp` only on `tailscale0`;
  public TCP `22` timed out from the operator Mac
- Effective SSH config includes:
  - `PasswordAuthentication no`
  - `KbdInteractiveAuthentication no`
  - `PermitRootLogin no`
  - `X11Forwarding no`
  - `AllowTcpForwarding no`
  - `AllowAgentForwarding no`
  - `PermitTunnel no`
- Real login users include `root` and non-root sudo operator `caudals`
- `ssh caudals@caudals-1` with non-interactive sudo has been verified
- Docker Swarm is active and advertises on the Tailscale IP
- `cloud-init` reports done using `DataSourceHetzner`
- Journal contains GPT warning messages from early boot, but `sgdisk -v
  /dev/sda` reported no partition-table problems.

Current target state after the staged restore:

- Tailscale is enrolled as `caudals-1` with IP `100.118.70.90`; use
  `ssh caudals@caudals-1`.
- Public SSH is blocked by host firewall policy; `22/tcp` is allowed only on
  `tailscale0`.
- Docker Swarm is active on the Tailscale address with attachable
  `dokploy-network`.
- Public `80/443` are now owned by the restored Dokploy Traefik, which
  terminates TLS and serves the local stack. HAProxy was stopped and disabled at
  cutover; its config remains for rollback.
- Dokploy, Umami, the app service, Postgres, and private operations stacks are
  restored and serving. All Swarm services report `1/1`, Umami's compose
  containers are healthy, and all ten stack probes plus the platform completion
  gate pass (the single failing gate, `routing/security` 500, is a pre-existing
  app condition that returns 500 on the live DigitalOcean origin too — not a
  migration regression).
- Hetzner is now the production origin: Cloudflare proxies the production
  hostnames to `168.119.49.95`, TLS serves valid Let's Encrypt certs, and public
  smokes pass. Docker Hub registry access and Cloudflare origin targeting are
  confirmed working; external provider-side verification (Stripe/Resend/Sentry
  live event tests) remains optional follow-up.

## Target Hardening Baseline

Perform this before migrating secrets or data.

1. Create a non-root operator:
   - recommended username: `caudals`
   - copy the MacBook SSH public key into `/home/caudals/.ssh/authorized_keys`
   - add `caudals` to `sudo`
   - prefer `sudo docker` over adding the user to the `docker` group, because
     Docker group membership is effectively root-equivalent
2. Install Tailscale and enroll the server:
   - hostname: `caudals-1`
   - enable Tailscale SSH only after ACLs are confirmed
   - use an ephemeral or short-lived tagged auth key; never commit it
3. Harden SSH:
   - verify `ssh caudals@<tailscale-host>` works before changing root access
   - set `PasswordAuthentication no`
   - set `PermitRootLogin no` after non-root Tailscale SSH works
   - disable X11 forwarding unless explicitly needed
4. Enable firewall:
   - `ufw default deny incoming`
   - `ufw default allow outgoing`
   - allow public `80/tcp`, `443/tcp`, `443/udp`, `41641/udp`
   - allow `22/tcp`, `7443/tcp`, and `7444/tcp` only on `tailscale0`
   - block Swarm/internal ports from public interfaces in `DOCKER-USER`
5. Install security/runtime packages:
   - `fail2ban`, `unattended-upgrades`, `curl`, `ca-certificates`, `gnupg`,
     `jq`, `rsync`, `psql`, Docker Engine, Docker Buildx, Node/npm if needed
6. Initialize Docker Swarm only after firewall rules are in place.
7. Install Dokploy/Traefik following the current Dokploy path and bind private
   dashboard access to Tailscale/Nginx as on the source.

## Migration Runbook

### 1. Freeze Scope and Confirm Access

1. Read:
   - `AGENTS.md`
   - `docs/product-specs/OVERVIEW.md`
   - `docs/ARCHITECTURE.md`
   - `docs/TOOLS.md`
   - this file
   - `docs/migrations/hetzner-human-actions.md`
2. Confirm SSH:
   - `ssh root@ubuntu-caudals`
   - `ssh caudals@caudals-1`
   - Do not use public-IP SSH for routine target administration; it was a
     bootstrap-only path and public TCP `22` is blocked by UFW except on
     `tailscale0`.
3. Confirm current public state:
   - `curl -I https://caudals.com/`
   - `curl -I https://app.caudals.com/`
   - `curl -I https://analytics.caudals.com/`
4. Confirm DNS owner and Cloudflare/DNS access before planning cutover.
5. If credentials are available, agents may install and use official Cloudflare
   and Tailscale CLIs or MCPs to inspect or apply DNS/Tailscale configuration.
   Do not store API tokens, auth keys, or generated credentials in the
   repository or terminal transcript.

### 2. Prepare Source Backups

Keep all existing source backups. Create a fresh timestamped backup set before
cutover and again after the final source write freeze. The DigitalOcean VPS is
the required migration backup location; keep canonical migration backups under a
timestamped directory in `/root/.caudals/backups` on the source VPS.

Required backup artifacts:

- sanitized server inventory:
  - `docker service ls`
  - `docker stack ls`
  - `docker secret ls`
  - `docker volume ls`
  - sanitized `docker service inspect` output without env values
  - UFW status and Tailscale status
- source filesystem:
  - `/root/.caudals`
  - `/etc/dokploy`
  - `/etc/systemd/system/*dokploy*`
  - `/usr/local/bin/dokploy-compose-traefik-sync.py` if retained
- database dumps:
  - `caudals-postgres`
  - Dokploy Postgres
  - Umami Postgres
  - Label Studio Postgres
  - CVAT Postgres
  - Marquez/lakeFS/Temporal/Dagster databases inside `caudals-postgres` when
    they are separate DBs in the same service
- volume archives for non-Postgres state:
  - MinIO
  - Qdrant
  - Redis if queue/cache state must survive
  - Grafana/Prometheus/Loki/Tempo observability history
  - Umami analytics database and service state
  - CVAT data/log/key volumes
  - lakeFS local blockstore volume
- image archives for non-registry images:
  - `caudals-postgres:16-pgvector-cron`
  - current app image if Docker Hub pull is unavailable
  - current orchestration image if Docker Hub pull is unavailable

Do not print secret values. Write secret exports only to root-only files, transfer
them directly, then securely delete temporary plaintext files after recreating
Docker secrets on the target.

### 3. Build the Hetzner Runtime

1. Complete the target hardening baseline.
2. Install Docker and initialize a single-node Swarm.
3. Create `dokploy-network` as an overlay network if Dokploy does not create it.
4. Install Dokploy and Traefik.
5. Restore Dokploy state from backup or recreate Dokploy projects manually from
   source service specs, then verify the dashboard is reachable only through
   Tailscale.
6. Recreate Docker secrets with the same names, but prefer `_FILE`-mounted
   secrets over plaintext app envs.
7. Recreate volumes and restore data. Preserve observability and analytics
   history rather than redeploying fresh empty volumes.
8. Deploy the app and service stacks:
   - `caudals-postgres`
   - `caudals-object-storage`
   - `caudals-cache`
   - `caudals-operations`
   - `caudals-orchestration`
   - `caudals-workflow`
   - `caudals-labeling`
   - `caudals-cvat`
   - `caudals-vector`
   - `caudals-lakehouse`
   - `caudals-observability`
   - Umami
9. Keep all private services without published ports. Only Traefik should publish
   public web ports.

### 4. Verify Before DNS Cutover

Run internal checks on Hetzner before pointing production domains at it:

- `docker service ls`
- `docker stack ls`
- `docker ps`
- `ufw status verbose`
- `tailscale status --self`
- `ss -tulpen`
- source-equivalent route checks through Traefik using `Host` headers
- platform probes from the repo where applicable:
  - `npm run object-storage:probe`
  - `npm run cache:probe`
  - `npm run labeling:probe`
  - `npm run cvat:probe`
  - `npm run orchestration:probe`
  - `npm run workflow:probe`
  - `npm run operations:probe`
  - `npm run vector:probe`
  - `npm run lakehouse:probe`
  - `npm run platform:completion-status`
- public route smoke against a pre-cutover host override where TLS permits it:
  - `curl -H 'Host: app.caudals.com' http://168.119.49.95/`
  - after TLS is available, `curl --resolve app.caudals.com:443:168.119.49.95 https://app.caudals.com/`

Do not cut DNS over while probes fail unless the failure is documented as an
external waiver.

### 5. Cut DNS and Avoid Split Writes

Use a short maintenance window.

1. Stop or gate write paths on the source app.
2. Take the final source backup and verify it.
3. Restore the final backup to Hetzner.
4. Update Cloudflare/DNS origin records for:
   - `caudals.com`
   - `www.caudals.com`
   - `app.caudals.com`
   - `analytics.caudals.com`
5. Keep records proxied or unproxied according to the current Cloudflare policy.
6. Confirm Traefik TLS/HTTP routing on Hetzner.
7. Run public smokes:
   - `curl -I https://caudals.com/`
   - `curl -I https://app.caudals.com/`
   - `curl -I https://analytics.caudals.com/`
   - `LANDING_MODE=true PLAYWRIGHT_BASE_URL=https://app.caudals.com npx playwright test e2e/smoke.spec.ts --project=chromium`
   - authenticated smoke only if operator credentials/test fixtures are
     available and safe to use
8. Keep the old DigitalOcean droplet online as rollback for at least one full
   verification window. The source droplet should continue working until
   `caudals.com` and related domains point to the new Hetzner origin and the new
   origin passes production smokes.

### 6. Rollback

Rollback is DNS-first:

1. Stop writes on Hetzner.
2. Point Cloudflare/DNS records back to the old origin.
3. Confirm old app and Umami answer through Cloudflare.
4. Preserve Hetzner logs and failed-state evidence for postmortem.
5. Do not delete Hetzner state until a newer successful migration is complete.

## Acceptance Criteria

- Hetzner is Tailscale-enrolled and reachable through the chosen Tailscale
  hostname from this MacBook.
- Public SSH is closed; admin SSH and dashboards are Tailscale-only.
- `caudals` non-root operator exists and is the default human/agent SSH user.
- UFW and `DOCKER-USER` rules block internal service exposure.
- Dokploy, Traefik, app, Postgres, Umami, and all private stacks are restored or
  explicitly deferred with product-owner rationale.
- Observability and analytics data are preserved, including Grafana,
  Prometheus, Loki, Tempo, Alertmanager state where applicable, and Umami data.
- App runtime secrets are stored as Docker secrets and mounted through `_FILE`
  fallbacks wherever supported.
- Stale Supabase runtime envs are absent unless current code still requires a
  specific compatibility value.
- Old source backup set is verified and retained on the DigitalOcean VPS.
- Migration backup artifacts remain available on the DigitalOcean VPS after
  cutover until a human explicitly approves a different retention target.
- Public domains resolve to the new Hetzner origin and pass route smokes.
- The old DigitalOcean droplet remains available for rollback until explicitly
  decommissioned.

## Agent Goal Prompts

The Codex manual says `/goal` objectives should be specific and measurable, and
longer instructions should live in a file referenced by the goal. Claude Code
also supports `/goal [condition|clear]` in its command reference. Use this file
as the detailed instruction source instead of pasting a huge prompt.

### Codex `/goal`

```text
/goal Migrate Caudals production from the DigitalOcean VPS to the Hetzner VPS at 168.119.49.95 using docs/migrations/digitalocean-to-hetzner-vps-migration.md as the source runbook. Read AGENTS.md, docs/product-specs/OVERVIEW.md, docs/ARCHITECTURE.md, docs/TOOLS.md, and docs/migrations/hetzner-human-actions.md first. Work read-first, never print secrets, keep the old DigitalOcean VPS serving production until caudals.com points to Hetzner and post-cutover smokes pass, keep canonical migration backups on the DigitalOcean VPS, harden Hetzner with hostname caudals-1, a non-root operator, and Tailscale-only admin access before moving data, restore Dokploy/Docker Swarm/services/secrets/data, preserve observability and Umami analytics history, improve old plaintext env drift by using Docker secret-file fallbacks where supported, use official Cloudflare/Tailscale CLIs or MCPs when credentials are available, verify every service and public route, update affected docs, and stop with an explicit note in docs/migrations/hetzner-human-actions.md if DNS, Tailscale, Cloudflare, registry, or external credentials are missing. Done when Hetzner passes service probes and production smokes, public DNS is cut over or explicitly blocked, and the old VPS remains live with verified backups for rollback.
```

If `/goal` is unavailable in Codex, enable goals first:

```toml
[features]
goals = true
```

or run:

```bash
codex features enable goals
```

### Claude Code `/goal`

```text
/goal Migrate Caudals production from DigitalOcean to Hetzner 168.119.49.95 following docs/migrations/digitalocean-to-hetzner-vps-migration.md. First read AGENTS.md, docs/product-specs/OVERVIEW.md, docs/ARCHITECTURE.md, docs/TOOLS.md, and docs/migrations/hetzner-human-actions.md. Start in plan mode if any destructive step is uncertain. Do not print secrets. Keep the DigitalOcean VPS serving production until caudals.com points to Hetzner and post-cutover smokes pass. Keep canonical migration backups on the DigitalOcean VPS. Harden Hetzner before moving secrets or data: hostname caudals-1, non-root caudals user, Tailscale enrollment, Tailscale-only SSH/dashboard access, UFW/DOCKER-USER rules, fail2ban, unattended upgrades. Preserve and verify old VPS backups, restore Dokploy, Docker Swarm, app, Postgres, Umami, observability history, analytics data, private service stacks, volumes, Docker secrets, and configs. Replace plaintext app env secrets with Docker secret-file fallbacks where supported. Use official Cloudflare/Tailscale CLIs or MCPs when credentials are available. Run service probes and public route smokes. Stop and document blockers in docs/migrations/hetzner-human-actions.md for DNS/Cloudflare/Tailscale/registry/external credentials. Complete only after Hetzner works like production and rollback to the still-live old VPS remains possible.
```

For Claude Code, use `/plan <migration summary>` before `/goal` if you want to
review the exact execution plan before any edits or remote mutations.

## Documentation Sources

- Codex `/goal`: `https://developers.openai.com/codex/prompting#goal-mode`
- Codex app commands: `https://developers.openai.com/codex/app/commands#set-or-manage-a-goal-with-goal`
- Codex CLI slash commands: `https://developers.openai.com/codex/cli/slash-commands#set-or-view-a-task-goal-with-goal`
- Claude Code commands: `https://code.claude.com/docs/en/commands`
- Claude Code common workflows: `https://code.claude.com/docs/en/common-workflows`
- Tailscale auth keys: `https://tailscale.com/docs/features/access-control/auth-keys`
- Tailscale SSH: `https://tailscale.com/docs/features/tailscale-ssh`
- Tailscale UFW server lockdown: `https://tailscale.com/docs/how-to/secure-ubuntu-server-with-ufw`
