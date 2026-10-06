# VPS Runtime

Checked: **2026-10-06**, read-only SSH inspection of both `atlantic` and
`arctic`, followed by authenticated Ops/Postiz, media round-trip and video
render verification after the Growth migration. This is the shared runtime
inventory for `caudals` and `leads`. Replica counts prove scheduled/running
tasks; the migration checks below cover the affected dependency paths.

## Ownership and access

- Platform owner: `caudals`; Leads app schema/growth behaviour owner: `leads`.
- CRM of record since 2026-10-03: self-hosted **Warmbly** at `out.caudals.com`
  (see below). The internal app is **Caudals Ops** at `ops.caudals.com`;
  it retains content, newsletter/blog, Hermes prospecting and DGX operations.
- Host: Hetzner `atlantic` (renamed from `caudals-1`, same Tailscale IP
  `100.118.70.90`); operations use `caudals@atlantic` through Tailscale.
- Ingress: Cloudflare and retained `dokploy-traefik`; repository deploy scripts
  manage Swarm, not a presumed running Dokploy control plane.
- Private state: shared PostgreSQL, separate databases/roles, object storage and
  dedicated overlays. Provider and database credentials stay in protected
  files, Docker secrets or encrypted application stores.

## Second host: `arctic` (AWS Lightsail)

Created 2026-10-03 to spread services off `atlantic`; runs Warmbly, Umami,
Postiz/Temporal and Growth/HyperFrames as of 2026-10-06. AWS
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
Growth runs on the same host and calls the local Postiz overlay alias.
`caudals-postiz-restart.timer` restarts Postiz every Sunday 04:00 UTC to
release the memory its orchestrator accumulates. The source social/workflow
stacks, their Postiz/Temporal databases, volumes and images were removed from
atlantic after the separate Postiz migration was checked. Social/workflow
scripts refuse atlantic without `CAUDALS_ALLOW_ATLANTIC_SOCIAL=1`.

Also migrated to arctic on 2026-10-06: **Growth and HyperFrames**, stack
`caudals-growth`. All 322 captured entries in four durable volumes matched
SHA256, numeric ownership and mode after transfer. Codex login remains valid.
The immutable f4a64996 images were reused; renderer cleanup is supplied by
versioned Docker config `hyperframes_render_mjs_ee6e2891e20f` until the next
normal build. Growth deployment now targets arctic and rejects atlantic by
default. Source services, volumes, images and unused Growth secrets were
removed after successful authenticated Ops/Postiz calls, PNG upload/public
read/checksum/deletion and a 640×360 H.264 render (30 fps, 90 decoded frames).
The existing video-workflow flag remains disabled.

Ops, `caudals_leads` and published media stay on atlantic. Small Docker relays
bind only Tailscale addresses: Ops `100.118.70.90:18080`, Growth
`100.93.226.39:18081`, and the existing office DGX tunnel through
`100.118.70.90:18034`. Ops retains its original private Growth alias through
the reverse relay. Auth remains enforced on application calls. The renderer
keeps an internal-only overlay and has no published port. Deployment and
shared-volume permissions are owned by `leads/scripts` and documented in
`leads/docs/OPERATIONS.md`. These are separate Swarms.

## Observed Swarm services

| Host | Service | Replicas | Role |
| --- | --- | --- | --- |
| atlantic | `caudals-app_app` | 1/1 | Marketing and evaluation web/API |
| atlantic | `caudals-leads_app` | 1/1 | Ops, authenticated data API and content management |
| atlantic | `caudals-postgres_db` | 1/1 | Shared PostgreSQL 16 with pgvector/pg_cron |
| atlantic | `caudals-object-storage_minio` | 1/1 | Private objects/evidence |
| atlantic | `caudals-evals_worker` | 1/1 | General evaluation/inference queue |
| atlantic | `caudals-evals_documents` | 1/1 | Source extraction and document exports |
| atlantic | `caudals-evals_scheduler` | 1/1 | Scheduled evaluation and lifecycle jobs |
| atlantic | `caudals-evals_browser` | 1/1 | Controlled browser execution |
| atlantic | `caudals-evals_browser-egress` | 1/1 | Browser public-HTTPS egress policy |
| atlantic | `caudals-evals_browser-db-relay` | 1/1 | Browser database relay |
| arctic | `caudals-growth_social` | 1/1 | Content generation and publishing execution |
| arctic | `caudals-growth_hyperframes-renderer` | 1/1 | Isolated video rendering |
| arctic | `caudals-social_postiz` | 1/1 | Social publishing integration |
| arctic | `caudals-social_redis` | 1/1 | Dedicated social Redis |
| arctic | `caudals-social_db` | 1/1 | Dedicated Postiz and Temporal PostgreSQL |
| arctic | `caudals-social_temporal` | 1/1 | Postiz workflow runtime |
| arctic | `caudals-warmbly_*` | 1/1 each | Warmbly CRM, backend and outreach services |
| arctic | `caudals-warmbly-apollo_app`, `caudals-warmbly-rocketreach_app` | 1/1 each | Warmbly provider integrations |

Additional containers: Traefik on both hosts; `caudals-dashboards` and the
private Ops/Growth/DGX relays on atlantic; Growth relay and Umami with its own
database on arctic. A running dashboards proxy does not prove all upstream routes
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
After the 2026-10-06 migrations and the additional founder-requested storage
cleanup: atlantic disk about 33.6 GiB used / 39.7 GiB free (46%), about
4.3 GiB available RAM and 1.3 GiB swap occupied. Arctic disk about 22.8 GiB
used / 53.6 GiB free (30%). These are point-in-time readings, not workload
guarantees.

The additional cleanup reclaimed about 11.5 GiB on atlantic and 0.55 GiB on
arctic. Twelve unused image revisions and eight stopped Swarm tasks were
removed, while current service/container images and named volumes stayed
intact. Build cache is now 0 B on both hosts. Atlántic's pinned build cache
was released by a controlled Docker restart after verifying idle evaluation
work; Caudals/Ops probes and all running service replicas recovered.

Snap cleanup removed eight disabled revisions and the unused `core22` base
on atlantic, cleared download caches and set `refresh.retain=2`. Chromium and
its declared dependencies stay installed on atlantic; AWS SSM stays active
on arctic. Postiz/Warmbly public routes and the arctic-to-Ops private path
passed after cleanup. Root-only audit records are stored per host under
`/opt/caudals-maintenance-20261006/`.
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
