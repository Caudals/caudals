# Apollo integration for Caudals Warmbly

Plugin version **1.0.1** is installed on `out.caudals.com`, on top of the pinned Warmbly `v0.6.17` dashboard.
Open [Integrations → Apollo](https://out.caudals.com/app/integrations?provider=apollo).
The standard Warmbly session, workspace membership and permissions apply. No
separate plugin password, public signup, database grant or SMTP credential is needed.

## Features

- People search with all official Apollo filters and pagination; company search.
- Single and bulk enrichment (up to 10 per provider call), email and phone reveals,
  optional personal email and waterfall enrichment, asynchronous phone polling.
- Encrypted saved people/companies, saved searches, CSV export and custom field mapping.
- Direct Warmbly contact create/update, deduplication by email, verified-only import
  by default, no resubscription of existing opt-outs, resumable import receipts.
- Multiple operator-owned Apollo accounts, enabled state, priority/round-robin/
  highest-credit selection, per-account daily reservations and credit reserves.
- Live provider credit snapshots, API usage inspection, 14-day enrichment cache,
  paid-operation idempotency and receipts for uncertain provider outcomes.
- REST, a 10-tool MCP surface and a local JSON CLI reusing the Warmbly sign-in.

Company entities are stored by the plugin. Warmbly contact imports carry company
name, phone, industry, domain, employee count and other prospect fields. The plugin
does not create a separate company table in Warmbly or synchronize the Leads CRM.
It never starts campaigns or sends mail. Use the regular `warmbly` CLI for that.

### Accounts and credits

The existing CRM Apollo key was connected as **Caudals CRM**, without exposing its
value or changing the CRM configuration. Additional keys can be added under
**Cuentas y créditos**. The encryption key is independent of Warmbly's mailbox keys.

Refresh credit snapshots before a large batch. Choose **Pool unificado** only for
an Apollo account billed from a shared pool; otherwise keep separate email/phone
balances. A known zero phone balance excludes that account from phone enrichment.
Provider account eligibility and API permissions still apply.

Reservations are conservative estimates (1 per person/email or company; up to 9
per email+phone reveal), not exact billing. Waterfall `max_credits` is a local
reservation and does not cap Apollo vendor charges. The account's configured
waterfall vendors control those charges. Consult the real Apollo balance after
paid batches. An explicit provider credit-exhaustion error may select another
authorized funded account. A 429 stops the request and shares its endpoint cooldown
across the workspace; a 401/403 requires correcting that account's key/access.
No automatic retries occur after an ambiguous credit-consuming timeout.

## Agents

`warmbly-cli` and `warmbly-apollo` are installed in all three discovery roots:

- `~/.codex/skills`
- `~/.claude/skills`
- `~/.agents/skills`

The regular CLI is pinned to v0.6.17 in `~/.local/bin/warmbly`.
`~/.local/bin/warmbly-apollo` points at this folder's `cli.py`. Codex and Claude
Code have a user-level MCP named `warmbly-apollo` running its `mcp-stdio` command.
The stdio bridge advertises tools without credentials; tool calls need sign-in.

```bash
warmbly auth login --hostname out.caudals.com --api-url https://out.caudals.com --web
warmbly-apollo status
warmbly-apollo execute people.search --params '{"person_titles":["CTO"],"person_locations":["Spain"],"per_page":25}'
warmbly-apollo execute people.enrich --params '{"id":"APOLLO_ID"}' --spend --idempotency-key enrichment-001
warmbly-apollo import --ids APOLLO_ID --idempotency-key import-001
```

The owner completes browser approval. A dedicated Warmbly key with `READ_CONTACTS`,
`WRITE_CONTACTS`, and `INTEGRATIONS` can be supplied through `WARMBLY_TOKEN` instead.
Never put a key on a command line or in a skill. The stdio bridge reads it internally
with `warmbly auth token`; it does not print or place it in MCP configuration.
The CLI uses an explicit product User-Agent, because the generic urllib agent is
blocked by the site's edge rules.

## HTTP contract

Base: `https://out.caudals.com/v1/apollo`. Auth: existing Warmbly bearer credential.
JWT callers need integration and contacts permissions; key callers need integration
and contact scopes. Every persistent read/write is scoped to the resolved workspace.

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/status`, `/manifest` | GET | Capabilities, accounts and workspace state |
| `/accounts` | GET, POST | List sanitized accounts; add a key |
| `/accounts/:id` | PATCH, DELETE | Update settings/key, disconnect |
| `/accounts/:id/refresh`, `/accounts/:id/usage` | POST | Credits and rate-limit usage |
| `/settings` | GET, PATCH | Selection strategy and retention |
| `/execute` | POST | Whitelisted Apollo search/enrichment operation |
| `/results`, `/companies` | GET | Stored people and companies |
| `/import` | POST | Import stored person IDs into Warmbly |
| `/saved-searches` | GET, POST | Saved query definitions |
| `/saved-searches/:id` | DELETE | Remove a saved query |
| `/jobs`, `/jobs/:id/poll` | GET, POST | Asynchronous enrichment progress |
| `/receipts`, `/history` | GET | Idempotency receipts and audit metadata |
| `/data` | DELETE | Clear cached Apollo PII with explicit confirmation |
| `/mcp` | POST | Streamable HTTP JSON-RPC tools |

`/execute` body: `operation`, `params`, optional `options` and `account_id`.
Paid operations require `spend: true` and `idempotency_key`; `force: true` bypasses
the enrichment cache. `Idempotency-Key` is also accepted as a request header.
Phone/waterfall options use `poll_only` internally, so no public webhook is needed.

`/import` takes 1–100 unique stored `ids`, `idempotency_key`, optional
`subscribe_new`, `verified_only`, `update_existing` and `field_map`. Newly created
contacts default to unsubscribed. Existing contacts retain their subscription
state; a PATCH updates the actual workspace contact even when another member
created it. No campaign membership is written by this importer.

## Deployment and storage

The independent Swarm stack is `caudals-warmbly-apollo`, one 256 MB service.
Its read-only container has no published port, Docker socket or PostgreSQL access.
Traefik routes only `/v1/apollo/` to it. It joins the existing Warmbly private
network for authenticated public API calls and `dokploy-network` for ingress.

`/opt/warmbly/apollo/data/apollo.sqlite` holds AES-256-GCM encrypted account keys,
PII, caches and receipts; row identity/workspace is authenticated as associated
data. Encryption and seed keys are mounted as Docker secrets. The root-only
`/opt/warmbly/apollo/encryption.key` must remain stable. Logs contain request IDs
and event names, never credentials or provider bodies. Cached data expires after
30 days by default; the setting is configurable. Audit metadata lasts 90 days.
The periodic cleanup affects only plugin caches, not imported Warmbly contacts.
Plugin data is outside Warmbly's workspace export; no backups are configured.

The dashboard image override is `/opt/warmbly/web-image.txt`; the main stack
generator preserves it. For a Warmbly upgrade, reapply `patch-web.py` to the new
matching source, run its typecheck/lint, build the static web output and replace
the dashboard override deliberately. Do not keep an old customized dashboard
against an incompatible new backend.

```bash
# Local source and validation
node --test test/*.test.mjs
python3 patch-web.py /path/to/pinned/warmbly
# In that source's web/: pnpm typecheck; pnpm lint; pnpm build

# VPS, after copying source and static dist to /opt/warmbly/apollo-src
sudo docker build -t caudals-warmbly-apollo:1.0.1 /opt/warmbly/apollo-src
sudo python3 /opt/warmbly/apollo-src/prepare.py --image caudals-warmbly-apollo:1.0.1
sudo docker stack deploy --resolve-image never -c /opt/warmbly/apollo/stack.yml caudals-warmbly-apollo

# Dashboard: only after rebuilding dist from the matching, patched Warmbly tag
sudo docker build -t caudals-warmbly-web:apollo-1.0.1 -f /opt/warmbly/apollo-src/web.Dockerfile /opt/warmbly/apollo-src
printf '%s\n' caudals-warmbly-web:apollo-1.0.1 | sudo tee /opt/warmbly/web-image.txt >/dev/null
sudo python3 /opt/warmbly/prepare.py
sudo docker stack deploy --resolve-image never -c /opt/warmbly/stack.yml caudals-warmbly
```

## Validation

16 behavior tests cover tenant isolation, authenticated encryption, signed int64
request IDs, explicit paid intent, limits, cache/idempotency, credit failover,
denial/429 handling, uncertain outcomes, phone polling, credit models, partial phone responses, account disconnection, import deduplication,
existing opt-outs, read-only scope rejection and retention. Dashboard typecheck,
lint and production build passed. Existing lint warnings were unchanged.

Production UI initially showed **75 email credits and 0 phone credits**. A live
zero-credit people search for `caudals.com` returned two people. The audit also
records a company search returning 50 companies with a 1-credit reservation; a
subsequent provider refresh confirmed **74 email credits and 0 phone credits**.
No paid people enrichment, real contact import, campaign activation or email send
was performed during installation. Both plugin and
dashboard services converged; all other VPS services remained at 1/1. Local MCP initialization and all 10 tool definitions were verified. The installed
Warmbly credential is active: a real MCP account listing and CLI people search
succeeded against production. New devices or revoked credentials need the
operator's browser approval.

Provider references: [Apollo API](https://docs.apollo.io/),
[credit usage](https://docs.apollo.io/reference/view-credit-usage-stats),
[people enrichment](https://docs.apollo.io/reference/people-enrichment),
[phone polling](https://docs.apollo.io/reference/poll-webhook-result).
