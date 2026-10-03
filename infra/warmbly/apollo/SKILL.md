---
name: warmbly-apollo
description: Search Apollo people and companies, enrich emails and phones, manage authorized Apollo accounts and import selected contacts directly into the Caudals Warmbly workspace using the warmbly-apollo CLI or MCP tools.
---

# Apollo in Warmbly

The deployed plugin is at `https://out.caudals.com/v1/apollo`. Use the installed
`warmbly-apollo` CLI. Its JSON output and MCP tools expose the same operations.
It reuses the `warmbly` sign-in for `out.caudals.com`; `WARMBLY_TOKEN` or
`WARMBLY_API_KEY` also works. Required key scopes are `READ_CONTACTS`,
`WRITE_CONTACTS`, and `INTEGRATIONS`. Read-only keys cannot enrich or import.

If authentication is missing, ask the operator to complete:
`warmbly auth login --hostname out.caudals.com --api-url https://out.caudals.com --web`.
Never create an admin account or expose an API key in logs, chat or command arguments.

## Workflow

1. `warmbly-apollo status` shows connected accounts, credit snapshots and strategy.
2. `warmbly-apollo execute people.search --params '{"person_titles":["CTO"],"person_locations":["Spain"],"page":1,"per_page":25}'`
   searches without credit consumption. Search previews do not contain unlocked emails.
3. Enrich selected IDs with `people.enrich` or `people.bulk-enrich`. A bulk request
   uses `{"details":[{"id":"APOLLO_ID"}]}` and supports at most 10 records.
4. `warmbly-apollo results` lists stored people; inspect emails and statuses.
5. `warmbly-apollo import --ids ID1,ID2 --idempotency-key IMPORT_KEY` imports verified
   emails, updates existing contacts, and preserves their subscription state.

Paid operations require `--spend` and a stable `--idempotency-key`. Reuse that key
after a timeout, rather than minting another. The plugin returns the stored result
or an uncertain-outcome receipt; inspect `receipts` before another paid attempt.
The user's instruction to enrich or search companies authorizes the corresponding
credit use; show the requested batch size and phone/waterfall cost when scope is unclear.

Phone enrichment uses `--options '{"reveal_phone_number":true}'`, reserves up to
9 credits per person, and can return an asynchronous job. `jobs` and `poll JOB_ID`
show progress. The server polls automatically using the same originating account.
Waterfall uses `run_waterfall_email` / `run_waterfall_phone` in options plus
`--max-credits`; this is a local conservative reservation, not an Apollo billing cap.
Apollo's third-party waterfall settings can consume additional credits. Do not
describe a reservation as exact spend or guarantee it caps provider charges.

Company operations: `companies.search`, `companies.enrich`, `companies.bulk-enrich`,
and `companies.jobs`. Company search/enrichment consumes credits. Company details
are stored in the plugin and exported as CSV; company information travels with
imported Warmbly contacts in the company and custom fields, not as a separate CRM company row.

## Accounts and agents

`accounts list`, `accounts refresh ID`, `accounts usage ID`, and
`accounts update ID --data '{"enabled":true,"priority":10,"daily_budget":100,"reserve":20}'`
manage keys belonging to the operator. To add a key, use `accounts add --name NAME
--key-file PROTECTED_FILE`, or `--key-file -` with protected stdin.

Selection strategies are `priority`, `round_robin`, and `most_credits`:
`warmbly-apollo api PATCH /settings --data '{"strategy":"most_credits"}'`.
An explicit `--account ID` pins the operation. Invalid/forbidden keys are disabled
from selection; rate limits stop the request and honor Retry-After. Do not use
other keys to bypass a denial, suspension or provider throttle. Credit exhaustion
may select another authorized funded account.

MCP stdio: `warmbly-apollo mcp-stdio`. It reads credentials internally from
the Warmbly sign-in and never prints them. It can be configured in Codex and
Claude Code. HTTP MCP is `/v1/apollo/mcp` with the same Warmbly credential.

Import supports `--include-unverified`, `--skip-existing`, `--subscribe-new`,
and `--field-map '{"title":"cargo"}'`. Do not resubscribe existing opt-outs.
The plugin imports contacts only. Use the `warmbly-cli` skill for campaign
configuration or authorized sending; importing never activates a campaign.
No VPS backups should be created.

For separate-credit accounts, a known zero phone balance prevents phone enrichment.
Set `credit_model` to `unified` only when that account actually uses Apollo's shared credit pool.
