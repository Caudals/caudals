# VPS Runtime

Checked: **2026-09-28**, updated **2026-10-03** (host rename and Warmbly
stack), read-only SSH inspection of `atlantic` (formerly `caudals-1`) using Docker
service/container listings, disk information and systemd state. This is the
shared runtime inventory for `caudals` and `leads`. Replica counts prove
scheduled/running tasks, not complete business acceptance or provider health.

## Ownership and access

- Platform owner: `caudals`; Leads app schema/growth behaviour owner: `leads`.
- CRM of record since 2026-10-03: self-hosted **Warmbly** at `out.caudals.com`
  (see below). `leads.caudals.com` is still deployed; which Leads functions
  remain is pending a founder decision.
- Host: Hetzner `atlantic` (renamed from `caudals-1`, same Tailscale IP
  `100.118.70.90`); operations use `caudals@atlantic` through Tailscale.
- Ingress: Cloudflare and retained `dokploy-traefik`; repository deploy scripts
  manage Swarm, not a presumed running Dokploy control plane.
- Private state: shared PostgreSQL, separate databases/roles, object storage and
  dedicated overlays. Provider and database credentials stay in protected
  files, Docker secrets or encrypted application stores.

## Second host: `arctic` (AWS Lightsail)

Created 2026-10-03 to spread services off `atlantic`; no workloads yet. AWS
account `310356785933`, Lightsail `medium_3_0` in `eu-central-1a` (2 vCPU,
4 GB RAM, 80 GB disk, USD 24/month, paid from AWS Activate credits). Static IP
`51.102.90.206`; Tailscale `arctic` (`100.93.226.39`, `tag:ssh-all`).

Same security baseline as `atlantic`: only `caudals` (key-only, sudo), root
and the Lightsail `ubuntu` user locked, `AllowUsers caudals`, UFW (public
80/443 tcp, 443/udp, 41641/udp; 22 only on `tailscale0`), Lightsail firewall
with the same public ports and no 22, fail2ban, unattended upgrades, 4 GiB
swap. Docker single-node Swarm advertised on the private IP, `dokploy-network`
and `dokploy-traefik` (Traefik v3.6.7, file provider in
`/etc/dokploy/traefik/dynamic`, HTTP-01 Let's Encrypt; unlike `atlantic` it has
no Docker socket and no insecure API). Bootstrap:
[`infra/host/arctic/lightsail-launch.sh`](../infra/host/arctic/lightsail-launch.sh).
Lightsail browser SSH does not work by design.

Also on `arctic` since 2026-10-06: **Umami** (`analytics.caudals.com`), a
Docker Compose project in `/opt/umami` (images pinned by digest, its own
PostgreSQL 15 volume `umami_db-data`). Public routes are only `/script.js` and
`/api/send`; the admin panel is Tailscale-only at `http://arctic:7444`. On
atlantic the old containers are stopped with restart disabled and their
volume kept as rollback; the old Traefik route is in
`/root/.caudals/backups/umami-moved-to-arctic-20261006/`.

Also on `arctic` since 2026-10-06: **Postiz** (`postiz.caudals.com`) with the
**Temporal** server it uses, stack `caudals-social` from
[`infra/social/arctic-stack.yml`](../infra/social/arctic-stack.yml). It has
its own PostgreSQL 16 (databases `postiz`, `temporal`, `temporal_visibility`;
role `temporal` connection limit 60) and Redis on the internal overlay
`social-private`, which has no route outside the host and publishes no port.
Postiz holds the LinkedIn and X OAuth tokens: only Postiz joins
`dokploy-network`, behind Traefik with registration disabled, as before.
growth-social on atlantic calls it at `https://postiz.caudals.com`.
`caudals-postiz-restart.timer` restarts Postiz every Sunday 04:00 UTC to
release the memory its orchestrator accumulates. On atlantic the old stacks
are scaled to 0 with their databases in `caudals-postgres` kept as rollback,
and `deploy-social-stack.sh` / `deploy-workflow-stack.sh` refuse to run there
without `CAUDALS_ALLOW_ATLANTIC_SOCIAL=1`. Separate Swarm, not joined to
`atlantic`; services that move take their own data.

## Observed Swarm services

| Service | Replicas | Role |
| --- | --- | --- |
| `caudals-app_app` | 1/1 | Marketing, operator and evaluation web/API |
| `caudals-leads_app` | 1/1 | Leads app (former CRM), outreach and integration workers |
| `caudals-warmbly_*`, `caudals-warmbly-apollo_app`, `caudals-warmbly-rocketreach_app` | 0/0 | Retained after the 2026-10-03 move to `arctic`: definitions, secrets and `/opt/warmbly` data kept as rollback until removal is approved |
| `caudals-growth_social` | 1/1 | Content generation and publishing execution |
| `caudals-growth_hyperframes-renderer` | 1/1 | Isolated video rendering |
| `caudals-postgres_db` | 1/1 | PostgreSQL 16 with pgvector/pg_cron |
| `caudals-object-storage_minio` | 1/1 | Private objects/evidence |
| `caudals-evals_worker` | 1/1 | General evaluation/inference queue |
| `caudals-evals_documents` | 1/1 | Source extraction and document exports |
| `caudals-evals_scheduler` | 1/1 | Scheduled evaluation and lifecycle jobs |
| `caudals-evals_browser` | 1/1 | Controlled browser execution |
| `caudals-evals_browser-egress` | 1/1 | Browser public-HTTPS egress policy |
| `caudals-evals_browser-db-relay` | 1/1 | Browser database relay |
| `caudals-social_postiz` | 1/1 | Social publishing integration |
| `caudals-social_redis` | 1/1 | Social stack Redis, not the legacy cache |
| `caudals-workflow_temporal` | 1/1 | Retained Temporal runtime |
| `caudals-workflow_ui` | 1/1 | Temporal UI |

Additional containers: `dokploy-traefik`, `caudals-dashboards`, Umami and its
own database. A running dashboards proxy does not prove all upstream routes
work. The dedicated observability stack, Dagster, Label Studio, CVAT, lakeFS,
Qdrant, legacy cache and Marquez were not observed as running services.
Do not infer image/volume/secret deletion from absence in this table.

## Warmbly CRM (on `arctic` since 2026-10-03)

Installed on atlantic 2026-10-01; CRM of record by founder decision; moved to
`arctic` on 2026-10-03 (stopped stacks, copied `/opt/warmbly` byte-identical,
same secret names, all 219 table counts matched, DNS switched in Cloudflare).
An offline copy of the full install, including the unrecoverable
encryption keys, is kept offline by the founder. Paths below are on `arctic`.
Warmbly `v0.6.17`, images pinned by digest from `ghcr.io/warmbly/warmbly`,
except `web`, a Caudals-patched image `caudals-warmbly-web:reviewer-1.0.3`.
Install material: `/opt/warmbly` (root-only: `.env`, generated `stack.yml`,
secret env files, plugin sources, data) and `~/warmbly-install`
(`prepare.py`, `traefik.json`, `ctl.sh`, `configure-mail.py`).

- Hosts: `out.caudals.com` (dashboard, API, `/socket/` realtime),
  `out-admin.caudals.com`, `out-track.caudals.com`, `out-forms.caudals.com`,
  via the Traefik file provider and Let's Encrypt.
- State: own PostgreSQL 16, Redis and NATS under `/opt/warmbly/data`; it does
  not use `caudals-postgres`. Secrets are Docker secrets generated by
  `prepare.py`.
- Platform mail: Resend SMTP as `noreply@mail.caudals.com`. Auto-updater has no
  URL; upgrades are manual.
- Admin CLI: `docker exec` into the `caudals-warmbly_backend` container and run
  `warmblyctl` (the `~/warmbly-install/ctl.sh` helper stays on atlantic).
- Plugins: Apollo 1.0.1 and RocketReach 1.0.0, separate stacks reached through
  the Warmbly session; they never start campaigns, send mail or sync Leads.
- Backup: Lightsail automatic daily snapshot of `arctic` (02:00 UTC, last 7
  kept). No application-level dump yet.

## Host-side services and DGX

Hermes lives under `~/dgx-spark/hermes`, outside Swarm. User services
`hermes-dashboard` and `hermes-tailnet-proxy` are active. Its dashboard uses
loopback plus Tailscale Serve, not public ingress. The enabled strategic
prospecting cron ticks each minute and uses a cheap API wake gate before a
model call. Configured model: `bluehawana/deepseek-v4-flash:iq2_m` via Ollama.

The DGX is reached through a manual WireGuard split tunnel. It does not join
Swarm or replace the VPS default route. Ollama catalogue/process reads
responded; an empty process list means no loaded model at that instant, not a
failed GPU. Preserve private connection material outside documentation.

Observed host jobs: DGX telemetry collector, daily evals backup timer,
ten-minute evals health timer and hourly Docker cleanup timer. Current
configuration and last execution must be checked before claiming job success.

## Capacity and recovery

Host memory: approximately 7.6 GiB RAM plus 4 GiB swap. 2026-09-28: about
3 GiB available RAM, 3.2 GiB swap occupied, disk 59/75 GB (81%). 2026-10-03,
with Warmbly: about 2.8 GiB available, 3.4 GiB swap occupied (0.6 GiB free),
disk 63 GB used and 11 GB free (86%). These are point-in-time values.
Keep per-service limits and bounded render/model concurrency; image extraction
and deployment can consume significantly more than steady-state usage.

Current app/worker images may have different immutable revisions; inspect the
actual image digest before rollback. Use repository deployment convergence
checks. Historical May/June image archives and the old DigitalOcean origin are
not verified current-schema failover targets.

WP-08 records daily encrypted local database/role/object/recovery-ledger
backups and a restore rehearsal with stated limits. **Off-host copies remain
deferred by founder decision**; do not promise survival of VPS-disk loss from
local archives. See [evals/runbooks.md](evals/runbooks.md) and the latest
[WP-08 record](evals/work-packages/WP-08.md) before recovery.

## Lifecycle and update policy

Frozen product scope is different from a stopped process. Temporal being up
does not authorise new evaluation dependencies on legacy stacks. Postiz,
social Redis and MinIO must not be stopped based on older suspension notes.
Preserve named volumes, secrets and databases during routine cleanup.

Refresh this matrix after deployment/lifecycle changes with dated read-only
observations, and update only affected contracts. Do not duplicate mutable
service status throughout plans. The overview and work-package histories
retain intentions/evidence; this file records the observed shared runtime.
