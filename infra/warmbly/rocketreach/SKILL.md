---
name: warmbly-rocketreach
description: Search RocketReach people and companies, enrich emails and phones, verify emails, rotate authorized RocketReach accounts and import selected prospects directly into Warmbly through the installed CLI or MCP.
---

# RocketReach in Caudals Warmbly

Use `warmbly-rocketreach` (JSON CLI) or the `warmbly-rocketreach` MCP server.
API: `https://out.caudals.com/v1/rocketreach`. Reuses the installed Warmbly sign-in
for `out.caudals.com`; `WARMBLY_TOKEN` / `WARMBLY_API_KEY` also works. Required
Warmbly scopes: `READ_CONTACTS`, `WRITE_CONTACTS`, `INTEGRATIONS`.

If needed, the operator signs in using:
`warmbly auth login --hostname out.caudals.com --api-url https://out.caudals.com --web`.
Do not expose tokens or RocketReach keys in commands or chat. Keys are added under
Warmbly Integrations → RocketReach → Cuentas y créditos, or with `accounts add
--name NAME --key-file PROTECTED_FILE --api-mode legacy|universal`.

## Search and enrichment

1. `warmbly-rocketreach status` and `accounts list` show available accounts.
2. Refresh balances with `accounts refresh ACCOUNT_ID` before large batches.
3. `execute people.search --params '{"query":{"company_domain":["example.com"],"current_title":["CTO"],"geo":["Spain"]},"start":1,"page_size":25}' --spend --idempotency-key SEARCH_KEY`.
4. Search returns previews. `execute people.enrich --params '{"id":123}' --spend
   --idempotency-key ENRICH_KEY` reveals professional email by default.
5. `results`, `companies`, `jobs` and `receipts` expose saved data and progress.
6. `import --ids 123,456 --idempotency-key IMPORT_KEY` imports verified emails.

RocketReach Universal Credits charges search: people 1/page, companies 2/page.
Professional email costs 2/person, personal email 3, phone 6, detailed enrichment
1 and healthcare enrichment 1. These flags add together; defaults reveal only
professional email. The plugin uses these as conservative local reservations.
Classic accounts use provider plan-specific lookup/export entitlements; the same
reservation is an estimate, not guaranteed billing. Do not call search free.

Person identifiers: `id`, `linkedin_url`, `email`, `phone`, `npi_number`, or
`name` AND `current_employer`. IDs are numeric. `options` accepts
`reveal_professional_email`, `reveal_personal_email`, `reveal_phone`,
`reveal_detailed_person_enrichment`, `reveal_healthcare_enrichment`, and
`return_cached_emails`. Cached emails default off for fresh verification.
The reveal flags apply to Universal Credits; classic calls use standard, phone
or enrich lookup types according to the options and account access.

`people.bulk-enrich` takes `params.details` (1–100 identifiers). This is a resumable
sequence of individual lookups: no RocketReach webhook configuration is needed.
Reuse the exact batch key and inputs after an interruption. Completed children
are replayed; an uncertain paid outcome stops further work and requires receipt
inspection. Jobs are polled automatically every 30 seconds on their original
account; `poll JOB_ID` checks one job, without starting another paid lookup.

Company operations: `companies.search`, `companies.enrich`, `companies.bulk-enrich`.
Company identifiers: `domain`, `id`, `linkedin_url`, `ticker`, `name`. Company data
is saved in the plugin; company details accompany imported contacts as native and
custom fields. Warmbly does not receive separate company entities from this importer.

`email.verify` accepts `params.email`, costs up to 1 **email verification** credit
from a separate pool, and updates the matching saved person's verification state.
A provider result of unknown may refund the charge; refresh the real balance.

## Account rotation and imports

Choose `legacy` for classic/Essentials/Pro/Ultimate accounts, or `universal` only
when that account has Universal Credits API access. Do not retry permission errors
through another API mode or account. Change modes deliberately using `accounts
update ID --data '{"api_mode":"universal"}'` when the operator confirms access.

Strategies: priority, round_robin, most_credits. Example:
`api PATCH /settings --data '{"strategy":"round_robin"}'`.
Per-account `priority`, `reserve`, `daily_budget`, and `enabled` are editable.
`--account ID` pins a call. A credit-specific denial can select another funded,
authorized account. Invalid keys/permission denials stop; 429 honors Retry-After
and workspace cooldown. Never use rotation to evade throttles or suspensions.

Paid calls need `--spend` and a stable `--idempotency-key`. The user's request to
perform enrichment authorizes its corresponding credit use; clarify only unclear
batch size or scope. Exact enrichment responses are cached for 14 days; `--force`
bypasses the cache with explicit intent, and a new paid operation key.

Import defaults to verified-only and new contacts unsubscribed. Existing contacts
retain their subscription and opt-outs. Options: `--include-unverified`,
`--subscribe-new`, `--skip-existing`, `--field-map '{"title":"cargo"}'`.
Use the normal `warmbly-cli` skill for authorized campaign setup or sending.
Importing never activates campaigns or sends mail. No VPS backups.

Agent configuration uses `warmbly-rocketreach mcp-stdio`, with 11 tools. It reads
Warmbly credentials internally; no API keys go into MCP configuration.
