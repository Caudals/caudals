# RocketReach integration for Caudals Warmbly

Version 1.0.0. Native dashboard panel:
[Integrations → RocketReach](https://out.caudals.com/app/integrations?provider=rocketreach).
Apollo remains available alongside it. The panel uses Warmbly's existing session,
workspace, membership and permissions. No separate admin account is created.

## Capabilities

- Person/company search, full official query filters, ordering and pagination
  (1-based start, 1–100 per page, 10,000 result ceiling).
- Email/phone and optional personal email/detailed/healthcare enrichment.
- Classic API and Universal Credits accounts; the operator selects the actual
  account mode. Unsupported access returns an actionable permission failure.
- Resumable person/company batches of 1–100 records, implemented as individual
  provider lookups. RocketReach's native bulk endpoint requires configured
  webhooks and at least 10 records; this plugin does not require those webhooks.
- Pending lookups automatically polled every 30 seconds on the originating account.
- Multiple accounts, priority/round-robin/highest-balance selection, daily local
  reservations, minimum credit reserve, enabled state and explicit account pinning.
- Account/credit/usage snapshots, 14-day enrichment cache, audit and paid receipts.
- Email verification through its independent provider credit pool.
- Saved searches, encrypted saved people/companies, CSV export, custom field mapping.
- Warmbly contact imports with email deduplication, verified-only default, opt-out
  preservation and new contacts unsubscribed by default. No campaign activation.
- REST, local JSON CLI and 11-tool HTTP/stdio MCP for Codex/Claude Code/other agents.

Company records stay in plugin storage; company details accompany contacts in
Warmbly native/custom fields. This plugin does not sync the Leads CRM or send mail.

## Account setup and credits

Add your RocketReach API keys in **Cuentas y créditos → Añadir cuenta**. They are
encrypted on the server and never returned. Select **Clásica** for ordinary
Essentials/Pro/Ultimate accounts, or **Universal Credits** only when enabled for
that account. API/company/phone access still depends on the actual provider plan.
No key was found in the existing local configurations during installation.

Universal reservations: person search 1/page, company search 2/page, professional
email 2/person, personal email 3, phone 6, detailed enrichment 1, healthcare 1,
company enrichment 1. Enrichment flags add together. Classic plans have their own
lookup/export entitlements: these numbers are conservative reservations, not a
promise of actual billing. Classic lookups consume export credits. Email verification
uses a separate credit pool. Reservations are not provider billing limits.
Refresh account snapshots to reconcile real usage after paid work.

A credit-specific 402/403 can select another authorized funded account. A generic
401/403 stops; a 429 stops and stores the endpoint cooldown across the workspace,
honoring Retry-After. Rotation never bypasses a suspension or rate limit. An
ambiguous paid timeout remains reserved and is not automatically retried.

## Agents and API

`warmbly-rocketreach` skills are installed under `~/.codex/skills`,
`~/.claude/skills` and `~/.agents/skills`. The local CLI at
`~/.local/bin/warmbly-rocketreach` points to this folder's `cli.py`.
User-level MCP registrations in Codex and Claude Code invoke its `mcp-stdio`.
The bridge reuses `warmbly auth token --host out.caudals.com` internally;
`WARMBLY_TOKEN` or `WARMBLY_API_KEY` is also supported. No tokens in MCP config.

```bash
warmbly-rocketreach status
warmbly-rocketreach accounts list
warmbly-rocketreach accounts add --name Main --key-file /protected/key --api-mode legacy
warmbly-rocketreach accounts refresh ACCOUNT_ID
warmbly-rocketreach execute people.search --params '{"query":{"company_domain":["example.com"]},"start":1,"page_size":25}' --spend --idempotency-key search-001
warmbly-rocketreach execute people.enrich --params '{"id":123}' --options '{"reveal_phone":true}' --spend --idempotency-key enrich-001
warmbly-rocketreach execute people.bulk-enrich --params '{"details":[{"id":123},{"id":456}]}' --spend --idempotency-key batch-001
warmbly-rocketreach import --ids 123,456 --idempotency-key import-001
```

Paid requests require explicit `spend` and stable `idempotency_key`; retries use
exactly the same key and inputs. Batches have per-child receipts and preserve
completed progress. `receipts` includes batches and import receipts. `jobs` and
`poll JOB_ID` report asynchronous results. `--force` bypasses enrichment cache.

Base API: `/v1/rocketreach`. Endpoints mirror Apollo: `/status`, `/manifest`,
`/accounts` (GET/POST), `/accounts/:id` (PATCH/DELETE), `/accounts/:id/refresh`,
`/accounts/:id/usage` (POST), `/settings` (GET/PATCH), `/execute` (POST),
`/results`, `/companies`, `/jobs`, `/receipts`, `/history` (GET),
`/jobs/:id/poll`, `/import` (POST), `/saved-searches` (GET/POST),
`/saved-searches/:id` (DELETE), `/data` (DELETE with explicit confirmation),
`/mcp` (POST JSON-RPC). Auth uses Warmbly bearer JWT/API key. Key scopes:
READ_CONTACTS, WRITE_CONTACTS, INTEGRATIONS. Every store/provider call is scoped
and gated by the resolved Warmbly workspace and effective permissions.

## Runtime and deployment

Independent stack `caudals-warmbly-rocketreach`, image
`caudals-warmbly-rocketreach:1.0.0`, one Node 24 service limited to 256 MB/0.5 CPU.
Read-only/rootless container, no host port, no Docker socket or PostgreSQL grant.
Warmbly private network is for its authenticated API; dokploy-network is ingress.
Traefik routes only `/v1/rocketreach/` to the sidecar on port 8092.

State: `/opt/warmbly/rocketreach/data/rocketreach.sqlite`, encrypted AES-256-GCM
with workspace/row identity as associated data. Stable root-only encryption key:
`/opt/warmbly/rocketreach/encryption.key`, mounted as a Swarm secret. Account keys
are separate from Warmbly and Apollo keys. Logs exclude provider bodies/keys.
Default PII retention is 30 days, audit 90 days; imported contacts are unaffected.
No VPS backups are created or scheduled.

```bash
node --test test/*.test.mjs
python3 patch-web.py /path/to/warmbly-v0.6.17
# In matching source web/: pnpm typecheck; pnpm lint; pnpm build
# Copy source + dist to /opt/warmbly/rocketreach-src
sudo docker build -t caudals-warmbly-rocketreach:1.0.0 /opt/warmbly/rocketreach-src
sudo python3 /opt/warmbly/rocketreach-src/prepare.py --image caudals-warmbly-rocketreach:1.0.0
sudo docker stack deploy --resolve-image never -c /opt/warmbly/rocketreach/stack.yml caudals-warmbly-rocketreach
sudo docker build -t caudals-warmbly-web:prospecting-1.1.0 -f /opt/warmbly/rocketreach-src/web.Dockerfile /opt/warmbly/rocketreach-src
printf '%s\n' caudals-warmbly-web:prospecting-1.1.0 | sudo tee /opt/warmbly/web-image.txt >/dev/null
sudo python3 /opt/warmbly/prepare.py
sudo docker stack deploy --resolve-image never -c /opt/warmbly/stack.yml caudals-warmbly
```

The main stack generator preserves `/opt/warmbly/web-image.txt`. On Warmbly
upgrades reapply both provider panels to matching new source and deliberately
update the pinned base image. Do not install an old web bundle over a new backend.

## Verification

19 behavior tests validate provider request contracts/costs, encryption/tenant
isolation, credit rotation versus permission errors, rate limits, unknown outcomes,
resumable batches, cache/idempotency, async polling, classic/universal modes,
verification credit isolation, imports preserving opt-outs and retention.
Dashboard typecheck and full lint passed (85 existing warnings, zero errors); the
production web compilation succeeded. Both deployed services converged to 1/1,
and the sidecar is healthy. The authenticated native panel, CLI status and MCP
account listing work on production. Unauthenticated API requests return 401.
Apollo's existing endpoint/account configuration remains accessible.
Live provider search/enrichment cannot be verified until a valid RocketReach key
with the appropriate plan is connected. Installing does not consume provider credits.

Primary provider references:
[OpenAPI and API docs](https://docs.rocketreach.co/reference/rocketreach-api),
[Universal credits](https://docs.rocketreach.co/reference/universal-credits-overview),
[Universal person lookup](https://docs.rocketreach.co/reference/create_universal_person_lookup),
[Classic person lookup](https://docs.rocketreach.co/reference/people-lookup-api),
[Errors](https://docs.rocketreach.co/reference/responses-and-errors).
