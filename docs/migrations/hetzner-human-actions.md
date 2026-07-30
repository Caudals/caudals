# Hetzner Migration Human Actions

This file tracks actions an autonomous Codex or Claude Code migration agent
should not guess or fabricate.

## Required Before Production Cutover

1. Tailscale enrollment
   - Provide a short-lived or one-off Tailscale auth key for the Hetzner server,
     preferably tagged for Caudals infrastructure.
   - Target hostname: `caudals-1`.
   - Confirm whether Tailscale SSH should use `accept` or `check` mode for the
     `caudals` operator user.
   - Agents may install and use the official Tailscale CLI or Tailscale MCP when
     credentials are available. Do not store auth keys in repository files.

2. Cloudflare/DNS access
   - Confirm who can update DNS for `caudals.com`.
   - Required records to review: `caudals.com`, `www.caudals.com`,
     `app.caudals.com`, and `analytics.caudals.com`.
   - Current public lookups resolve to Cloudflare IPs, so the origin IP is
     hidden behind Cloudflare. The migration agent needs Cloudflare UI access or
     a scoped API token to repoint origins to `168.119.49.95`.
   - Agents may install and use official Cloudflare tooling or MCPs when a
     scoped token is available. Keep token scope limited to the Caudals zone and
     do not print or persist the token in docs.
   - Decide whether to add the Hetzner IPv6 origin
     `2a01:4f8:c015:5a63::1`.

3. TLS strategy
   - Choose one:
     - keep Traefik Let's Encrypt HTTP-01 and accept cert issuance during DNS
       cutover,
     - provide a Cloudflare DNS API token for DNS-01 issuance,
     - provide a Cloudflare Origin Certificate for the Hetzner Traefik origin.

4. Maintenance window
   - Pick a low-traffic window for final write freeze, final source backup,
     restore, DNS cutover, and smoke tests.
   - Decide whether stale DNS traffic to the old droplet should receive a brief
     maintenance response, proxy to Hetzner, or remain served by the old stack
     until TTL convergence.

5. External service credentials
   - Docker Hub: confirm the Hetzner Dokploy/Swarm runtime can pull
     `mariomedpar/caudals` and orchestration images.
   - GitHub: confirm whether deployment webhooks or Dokploy project settings
     reference the old VPS and need updating.
   - Stripe: if domains remain unchanged, webhook endpoints likely do not need
     changes; still verify a post-cutover webhook event.
   - Resend: verify production sending domain and API key still work after
     origin migration.
   - Sentry/alerting: verify DSN and external alert webhook routing on the new
     server.

6. Backup retention on DigitalOcean
   - Migration backups should stay on the old DigitalOcean VPS under
     `/root/.caudals/backups`.
   - Transfer copies to Hetzner only for restore and verification; keep the
     DigitalOcean copies as the rollback source of record.
   - Define retention: recommendation is daily encrypted backups for at least
     14 days, weekly for 8 weeks, and monthly for 6 months until the platform
     has a stronger backup policy.

7. Decommission decision
   - Keep the DigitalOcean droplet running and serving production until the
     migration is completed and `caudals.com` points to the Hetzner VPS.
   - After DNS cutover, keep the DigitalOcean droplet running as rollback until
     Hetzner has served production successfully through one verification window.
   - Do not delete the old droplet until a final backup is verified and a human
     explicitly approves decommissioning.

## Optional Decisions

- Whether Redis queue/cache state must be preserved or can be reinitialized.
- Whether to keep the exact Dokploy project IDs or recreate projects cleanly
  and document the new IDs.
- Whether to add a Hetzner Cloud firewall in addition to host UFW.

## Fixed Decisions

- Target hostname is `caudals-1`.
- The old DigitalOcean VPS should keep working until the migration is completed
  and `caudals.com` points to the new Hetzner VPS.
- Canonical migration backups stay on the old DigitalOcean VPS.
- Preserve observability and analytics data, including Prometheus, Loki, Tempo,
  Grafana, Alertmanager state where applicable, and Umami.
- Agents may install and use official Cloudflare and Tailscale CLIs or MCPs on
  servers when credentials are available.

## ACTION REQUIRED — DigitalOcean droplet went offline after cutover (2026-06-30)

Shortly after the Hetzner cutover completed, the DigitalOcean droplet
(`ubuntu-caudals`, Tailscale `100.92.160.68`, public `161.35.200.8`) became
fully unreachable: Tailscale reports it `offline`, public ICMP shows 100% packet
loss, and TCP `22/80/443` are all filtered. The migration agent did **not** take
it down — only read-only database dumps and inspects were run against it; its
Docker services, networking, UFW, and power state were never modified. The cause
is an independent droplet/host event (possible memory pressure on the
3.8 GiB + swap box, or a DigitalOcean host/network event).

Impact and status:

- **Production is unaffected.** Hetzner serves all public hostnames
  independently; the offline droplet is no longer in the serving path.
- **Backups are safe.** Verified production database backups exist in three
  places: on Hetzner (`/root/.caudals/backups/hetzner-local-<ts>`, SHA256
  verified), an off-host copy on the operator Mac, and the original sets on the
  droplet's disk (intact but currently inaccessible).
- **Rollback capability is degraded** while the droplet is offline: the DNS-free
  "start HAProxy → forward to DigitalOcean" rollback path is unavailable until
  the droplet is back.

Human action needed:

1. Open the DigitalOcean console and power-cycle / recover the `ubuntu-caudals`
   droplet (the agent has no DigitalOcean API/console credentials and cannot do
   this).
2. After it boots, confirm Tailscale re-enrolls and `ssh root@ubuntu-caudals`
   works, and that `/root/.caudals/backups` is intact.
3. Do not destroy or rebuild the droplet — it is the rollback origin and holds
   the canonical backups. If the droplet is unrecoverable, the Hetzner + Mac
   backup copies are sufficient to rebuild, but rollback would then mean
   re-provisioning rather than a fast HAProxy flip.

Operator decision (2026-07-01): accept Hetzner-only for now. The migration is
treated as complete; rollback safety rests on the three verified backup copies
(Hetzner host, operator Mac, and the droplet's on-disk sets). The operator will
power-cycle / recover the `ubuntu-caudals` droplet from the DigitalOcean console
later at their convenience. Until then, a rollback would mean restoring from
backup rather than a fast HAProxy flip. The droplet and its backups must not be
destroyed.

## Resolved Blockers (cutover completed 2026-06-30)

- Cloudflare/DNS: the production hostnames already point at the Hetzner origin
  `168.119.49.95` (Cloudflare proxied). No DNS record change was required at
  cutover — the edge swap was a Hetzner-local HAProxy → Traefik change. Resolved.
- Final write-freeze backup: a fresh verified cutover backup set
  (`hetzner-cutover-<ts>`, SHA256 verified) was created on the DigitalOcean VPS.
  The app database had zero delta (no writes since 2026-05-12), and Umami
  analytics were re-synced to Hetzner immediately before the swap. Resolved.
- Docker Hub: `docker manifest inspect mariomedpar/caudals:latest` succeeds on
  Hetzner; registry login is configured. Resolved.
- Web edge cutover: completed. Dokploy Traefik now owns public `80/443` on
  Hetzner and serves valid Let's Encrypt certs; HAProxy was stopped and disabled
  (config retained for rollback). Resolved.

## Remaining Optional Follow-ups

- Provider-side verification credentials (Stripe live webhook event, Resend send
  test, Sentry DSN event, external alert-routing webhook) were not exercised.
  App-side runtime config for all of them reads as ready via the completion gate
  (`stripe ready=true`, `email ready=true`, `sentry enabled=true`, all from
  Docker secret files), but an end-to-end provider event test is still advisable
  when those credentials are available.
- Pre-existing app bug, not a migration regression: `/security` returns HTTP 500
  on both the new Hetzner origin and the still-live DigitalOcean origin. It is
  the only failing completion-gate item and is unrelated to the migration.
- Stale `acme.json` / Traefik entries for `api.caudals.com` and
  `supabase.caudals.com` (no live DNS) produce benign Let's Encrypt renewal-error
  log lines on Hetzner Traefik. They do not affect production hostnames and can
  be pruned later.
- DigitalOcean decommission remains a deferred human decision (see below); keep
  the droplet as rollback until a human approves decommissioning.

## 2026-06-30 Cutover Completed

The migration is complete. Hetzner (`168.119.49.95`, `caudals-1`) is the live
production origin. Cloudflare proxies `caudals.com`, `www.caudals.com`,
`app.caudals.com`, `www.app.caudals.com`, and `analytics.caudals.com` to
Hetzner, where the restored Dokploy Traefik terminates TLS with valid Let's
Encrypt certs and routes to the local app, Umami, and private stacks. HAProxy
was stopped and disabled at the swap (config retained for rollback). The old
DigitalOcean VPS remains live and untouched as the rollback origin (app service
still `1/1`).

Cutover verification (2026-06-30):

- All ten private stack probes pass (cache, vector, object storage, operations,
  lakehouse, workflow, orchestration, labeling, observability, CVAT).
- Platform completion gate passes except the pre-existing `routing/security`
  500, which also returns 500 on the live DigitalOcean origin.
- App service runs with Docker secret-file fallbacks for DATABASE_URL, Better
  Auth, Stripe, Stripe webhook, Resend, Sentry DSN, and object-storage keys; no
  plaintext secret env names remain; stale Supabase runtime envs are gone.
- Five non-secret functional app envs that were missing on Hetzner were ported
  from the source (CALCOM_LINK, RESEND_FROM_EMAIL, COLLABORATION_NOTIFICATION_EMAIL,
  RESEND_GENERAL_AUDIENCE_ID, NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY).
- Umami analytics re-synced to Hetzner (`website_event` count matches source);
  history and the website UUID are preserved for tracking continuity.
- Public smokes pass: curl route sweep through Cloudflare matches prior behavior
  (`/`, `/contact`, `/blog`, `/call`, `/v1`, `get-session` → 200; `/admin`,
  `/buyer`, `/supplier` → 307; `analytics` → 200) and the Playwright
  `e2e/smoke.spec.ts` suite passes against `https://app.caudals.com`.

Verified backups retained on DigitalOcean for rollback:

- `/root/.caudals/backups/hetzner-migration-20260630T171257Z` (full staging set).
- `/root/.caudals/backups/hetzner-cutover-<ts>` (final cutover dumps:
  `caudals-postgres-all.sql.gz`, `dokploy.sql.gz`, `umami.sql.gz`, SHA256
  verified). Marker: `/root/.caudals/backups/LATEST_CUTOVER_BACKUP`.

Rollback (DNS-free, seconds): on Hetzner, `docker rm -f dokploy-traefik` then
`systemctl start haproxy` to restore Cloudflare → Hetzner-HAProxy →
DigitalOcean. The DigitalOcean app/DB are frozen at cutover state, so writes
made on Hetzner after cutover would need forward-porting on rollback.

### Superseded pre-cutover staging note

Before the cutover the migration was staged on Hetzner with production DNS not
yet cut over; the old DigitalOcean VPS was the serving backend for public
production traffic through the temporary Hetzner HAProxy pass-through. That
state is superseded by the cutover completion above.

Verified source backup retained on DigitalOcean:

- Canonical backup path:
  `/root/.caudals/backups/hetzner-migration-20260630T171257Z`
- Backup size: `1.8G`
- Backup contents: 5 PostgreSQL dumps, 22 Docker volume archives, 3 Docker image
  archives, sanitized Docker/UFW/Tailscale inventory, and Dokploy/root Caudals
  config archives.
- Image archives include `caudals-postgres:16-pgvector-cron`,
  `mariomedpar/caudals:latest`, and
  `mariomedpar/caudals:orchestration-31a4a61d081f52ef09283fb63017896bbfab4ad9`.
- Caveat: the backup was taken live without write freeze; the
  `caudals-labeling-cvat-clickhouse-data` archive recorded live tar churn.

Verified target hardening:

- Hostname: `caudals-1`
- Tailscale: enrolled, `100.118.70.90`, reachable as `caudals@caudals-1`
- Public TCP `22`: timed out from the operator Mac; SSH is allowed by UFW only
  on `tailscale0`.
- SSH hardening: root login, password auth, keyboard-interactive auth, X11
  forwarding, agent forwarding, TCP forwarding, and tunnels are disabled.
- UFW: default deny incoming/default deny routed; public allowances are
  `80/tcp`, `443/tcp`, `443/udp`, and `41641/udp`; `22/tcp` is allowed only on
  `tailscale0`.
- Public web listener: HAProxy only, forwarding to the old DigitalOcean origin.

Staged restore completed on Hetzner:

- Docker Swarm active on the Tailscale address with `dokploy-network`.
- Restored Docker secrets without printing values.
- Restored root-only generated Caudals state under `/root/.caudals`.
- Restored `/etc/dokploy` and staged the repository under `/root/caudals`.
- Loaded archived images for Postgres, app, and orchestration.
- Restored and probed `caudals-postgres`; the `caudals` database is reachable
  as `caudals_app` and reported 72 public tables.
- Deployed and probed private stacks: cache, vector, object storage, lakeFS,
  Temporal workflow, Marquez operations, observability, Label Studio, CVAT, and
  Dagster orchestration.
- Restored Umami with the original compose project name; private heartbeat
  passed and the restored `umami` database reported one website record.
- Restored Dokploy internally using `POSTGRES_PASSWORD_FILE`; private HTTP
  returned 200 and the restored Dokploy database reported 62 public tables.
- Staged `caudalsdep-caudals-vgbvxp` internally with Docker secret-file
  fallbacks for database, Better Auth, Stripe, Resend, Sentry, and object
  storage. It has no published ports.

Probe evidence kept on Hetzner:

- Private stack deploy logs:
  `/root/.caudals/backups/hetzner-migration-20260630T171257Z/checks/stack-deploy-20260630T182909Z`
- Private stack probe logs:
  `/root/.caudals/backups/hetzner-migration-20260630T171257Z/checks/stack-probe-20260630T183222Z`
- App route smoke logs:
  `/root/.caudals/backups/hetzner-migration-20260630T171257Z/checks/app-smoke-20260630T184024Z-rerun`
- App route sweep logs:
  `/root/.caudals/backups/hetzner-migration-20260630T171257Z/checks/app-route-sweep-20260630T184103Z`
- Umami restore logs:
  `/root/.caudals/backups/hetzner-migration-20260630T171257Z/checks/umami-compose-20260630T183603Z-project-name`
- Dokploy restore logs:
  `/root/.caudals/backups/hetzner-migration-20260630T171257Z/checks/dokploy-restore-20260630T184552Z`

Staged app route smoke results:

- `caudals.com`: `/`, `/contact`, `/blog`, and `/call` returned 200.
- `caudals.com`: `/book` returned 404.
- `app.caudals.com`: `/` returned 200.
- `app.caudals.com`: `/admin`, `/buyer`, and `/supplier` returned 307 to auth.
- `app.caudals.com`: `/api/auth/get-session` returned 200.
- `app.caudals.com`: `/v1` returned 200; `/v1/subscriptions` and
  `/v1/deliveries` returned 401; `/v1/datasets` returned 404 while catalogue
  publication remains deferred.

Public production smokes at this stop point:

- `https://caudals.com/`, `https://www.caudals.com/`,
  `https://app.caudals.com/`, and `https://analytics.caudals.com/` returned
  200 through Cloudflare.
- Direct DigitalOcean origin checks for `caudals.com`, `app.caudals.com`, and
  `analytics.caudals.com` returned 200.

(Superseded.) The conditions above were satisfied during the 2026-06-30
cutover: registry access and Cloudflare origin targeting were confirmed, a final
verified cutover backup was taken, and the Traefik/Dokploy swap was executed.
HAProxy is now stopped and disabled and Dokploy Traefik serves public `80/443`.
The DigitalOcean VPS remains the rollback source but is no longer the serving
backend.

## Superseded Bootstrap Note

An earlier 2026-06-30 bootstrap note recorded the target as not yet enrolled in
Tailscale, Swarm inactive, and restore work blocked. That state is superseded by
the cutover-completion note above: Tailscale is enrolled, public SSH is blocked
except on `tailscale0`, Swarm is active, the private restore/probe work
completed, and the public Traefik/TLS cutover is done. No migration blockers
remain; only the optional follow-ups listed under "Remaining Optional
Follow-ups" are outstanding.
