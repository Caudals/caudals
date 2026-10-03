# Warmbly on arctic (out.caudals.com)

Updated on 2026-10-03 to the official `v0.6.23` release (previously updated
to `v0.6.20` on 2026-10-02; originally installed on 2026-10-01 at `v0.6.17`).
Deployed on the dedicated `arctic` VPS node (AWS, `51.102.90.206`, Tailscale
`100.93.226.39`). All Warmbly application images are pinned to the digests in
the published `images.json`.

| Surface | URL |
| --- | --- |
| Dashboard | https://out.caudals.com |
| Admin panel | https://out-admin.caudals.com |
| Tracking | https://out-track.caudals.com |
| Hosted forms | https://out-forms.caudals.com |
| API | https://out.caudals.com/v1 |
| Websocket | wss://out.caudals.com/socket/websocket |

Cloudflare proxies four A records to `51.102.90.206` (`arctic`). Traefik terminates HTTPS
with Let's Encrypt and uses `/etc/dokploy/traefik/dynamic/caudals-warmbly.yml`,
which is YAML-compatible JSON copied from `traefik.json`. API routes, the admin
API and public signed callbacks reach the backend; internal worker endpoints
have no public route. Existing Traefik routes and other stacks are untouched.

## Runtime

The Swarm stack is `caudals-warmbly`: backend, consumer, worker, web, admin,
tracking, realtime, forms, PostgreSQL 16, Redis 7 and NATS 2.10. There is one
replica of each. Application entrypoints source their Docker secret file before
executing the original release binary. Secrets are absent from manifests and
frontend containers. Workers have no database connection. Separate PostgreSQL,
Redis and NATS services use the private `caudals-warmbly_private` overlay; only
the six routed services join `dokploy-network`. No Warmbly service publishes a
host port. Memory limits and rotated logs bound resource use.

Private runtime configuration and storage are under root-only `/opt/warmbly`:

- `.env`: installer-generated keys plus production URLs and mail settings.
- `images.json`: the upstream release digest manifest.
- `prepare.py`: generates `stack.yml` and content-versioned Docker secrets.
- `data/postgres`, `data/redis`, `data/nats`, `data/blobs`, `data/worker`:
  persistent data, independent of existing platform volumes.

`prepare.py` keeps the existing encryption keys, generates new Docker secret
names when private settings change, and preserves old secrets for rollback.
Do not rotate encryption keys after connecting mailboxes. Change runtime
settings in `.env`, rerun `prepare.py`, then deploy the generated stack.

The upstream updater service is enabled as part of the Swarm stack
(`UPDATER_MODE=command`, `UPDATER_COMMAND=/opt/warmbly/update.sh`, port 8095).
When an update is triggered from the admin panel (or CLI), the updater fetches
the release tag, executes `/opt/warmbly/update.sh`, downloads `images.json`,
pre-pulls upstream images, runs `prepare.py` to regenerate Swarm secrets and
`stack.yml`, and deploys via `docker stack deploy` while preserving the custom
reviewer frontend. After rolling services out and verifying backend health, the
updater safely transitions itself in the background.

## Accounts and mail

The fresh instance is unclaimed. Its single-use setup token is kept outside
the repository in a private operator document. The owner chooses the email
and password through that link; it expires after 24 hours. Following the
claim, new members require invitations. Public registration and billing are
disabled. Password login works without an emailed login code; passkeys are
available over HTTPS.

Platform mail uses the existing Resend relay at `smtp.resend.com:587` with
STARTTLS and `noreply@mail.caudals.com`, on the already verified
`mail.caudals.com` domain. The existing Caudals provider key is kept only in
backend/consumer Docker secret files. No provider changes or email sends were
performed. Password resets and invitations use this relay; campaigns require
the operator to connect sending mailboxes separately. No CRM contacts, lists
or campaigns were imported or activated.

## Operations

Run on the VPS with sudo; the wrapper loads the process's secret file, which
ordinary `docker exec ... warmblyctl` would not inherit:

```bash
sudo caudals-warmblyctl status --json
sudo caudals-warmblyctl setup-link  # sensitive; do not paste into logs or docs
sudo docker stack services caudals-warmbly
sudo python3 /opt/warmbly/prepare.py
sudo docker stack deploy -c /opt/warmbly/stack.yml caudals-warmbly
```

Account provisioning and reset commands are described in the upstream
[operator documentation](https://docs.warmbly.com/development/warmblyctl/).

## Backup preference

The operator requested no backups on 2026-10-01. The Warmbly backup timer was
disabled and removed, along with its service, script and all generated VPS
backup files. No scheduled Warmbly backup remains. Runtime data and encryption
keys stay in `/opt/warmbly`. The initial off-host copies already made remain
in the protected local `~/.local/share/caudals/warmbly` directory and take no
VPS space. Do not reintroduce backups without an explicit operator request.

## Acceptance evidence

All eleven services converged to `1/1`; all services with image healthchecks
reported healthy. Dashboard/admin HTML and backend/tracking/forms health
endpoints answered `200` over public HTTPS. Browser inspection showed the
first-owner setup screen and admin login form. Frontend runtime configuration
points to the production URL and contains no credentials. The admin API
rejects unauthenticated access with `401`; its allowed-origin response includes
`https://out-admin.caudals.com`. The websocket route reaches Phoenix and
rejects a handshake without a session ticket with `403`.

`warmblyctl status --json` reports version `v0.6.20`, no error findings, SMTP
delivery enabled, and successful relay authentication preflight. No message was
sent, so inbox delivery is not verified. Owner-account login and an authenticated
websocket session await the operator's claim; mailbox sending/sync awaits mailbox
connection. The remaining upstream warning is that the tracking hostname shares
the site's registered domain. A separate tracking domain can be configured
before launching outreach. Existing platform services remained at `1/1`.

## Apollo extension

The dashboard includes an [Apollo integration](apollo/README.md) under Integrations.
Its isolated service uses authenticated Warmbly API calls, encrypted key storage,
multiple accounts, credit controls, search/enrichment and direct contact import.
The main stack generator preserves the customized dashboard image named in
`/opt/warmbly/web-image.txt`. No additional backups are configured.

## RocketReach extension

The dashboard also includes [RocketReach](rocketreach/README.md), with classic
and Universal Credits accounts, encrypted state and an independent service. The
shared dashboard image includes both Apollo and RocketReach. No VPS backups.

## Campaign email reviewer

The [email reviewer](reviewer/README.md) adds a **Review emails** tab inside each
campaign. It keeps the original templates and personalization fields, and adds
a multiline editor, full send-engine preview, per-lead saves and review tracking.
No launch action, backend changes, provider credentials or new service is added.
