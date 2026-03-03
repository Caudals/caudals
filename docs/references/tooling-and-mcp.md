# Tooling and MCP Reference

## Primary Tooling
- Terminal: local build/test/lint, file ops, repo diagnostics.
- Supabase CLI: schema/data checks, migrations, policy validation.
- Supabase MCP: runtime DB inspection and operational queries.
- Stripe CLI: local webhook forwarding and deterministic event simulation.
- Stripe MCP: Stripe resource inspection and controlled billing/subscription operations.
- GitHub MCP: PR/issues/review workflows.
- Chrome DevTools MCP: UI verification and screenshot capture.

## Tool Selection Matrix
- Schema migrations, push/pull, migration drift: Supabase CLI.
- Quick DB inspection and ad hoc read queries: Supabase MCP.
- Stripe webhook route testing (`/api/webhooks/stripe`): Stripe CLI.
- Stripe object lookup/ops inside Codex: Stripe MCP.

## Supabase CLI Usage Pattern (Self-Hosted)
1. Source self-hosted credentials from local secret file (never commit):
   - `~/.config/caudals/supabase-selfhosted.env`
2. Start required SSH tunnel(s):
   - `./scripts/supabase-selfhosted-tunnel.sh start db`
   - or `./scripts/supabase-selfhosted-tunnel.sh start all` for DB + MCP.
3. For self-hosted Supabase, always run CLI with explicit `--db-url`.
4. Prefer wrapper script to enforce correct behavior:
   - `./scripts/supabase-cli-selfhosted.sh migration list`
   - `./scripts/supabase-cli-selfhosted.sh db push --dry-run`
   - `./scripts/supabase-cli-selfhosted.sh db pull`
5. Do not rely on `--linked` for self-hosted operations.

### Supabase CLI Hard Rules
- If target is self-hosted, `--db-url` is mandatory.
- Prefer `db push --dry-run` before any non-read operation.
- Keep migration edits in `supabase/migrations/*`; do not apply undocumented manual SQL in normal flow.
- Do not expose DB credentials in docs/logs/screenshots.

## Supabase MCP Usage Pattern (Self-Hosted)
1. Ensure MCP tunnel is up:
   - `./scripts/supabase-selfhosted-tunnel.sh start mcp`
2. Verify server mapping:
   - `codex mcp get supabase`
   - expected URL: `http://127.0.0.1:18100/mcp`
3. Use MCP for read-first diagnostics (`execute_sql`, `get_logs`, `list_migrations`, etc.).
4. For schema-changing work, prefer migration files + Supabase CLI over ad hoc MCP writes.
5. If MCP tool output is stale/broken for a specific method, fallback to CLI/psql and log the fallback in validation notes.

## Stripe CLI Usage Pattern
1. Use Stripe CLI only for local/test webhook simulation.
2. Start forwarding:
   - `stripe listen --forward-to http://127.0.0.1:3000/api/webhooks/stripe`
3. Set emitted signing secret (`whsec_...`) into local `STRIPE_WEBHOOK_SECRET`.
4. Trigger deterministic events:
   - `stripe trigger payment_intent.succeeded`
   - `stripe trigger payment_intent.payment_failed`
   - `stripe trigger transfer.created`
   - `stripe trigger transfer.failed`
5. Record webhook test outcomes in validation logs for payment-impacting changes.

### Stripe CLI Hard Rules
- Never commit API keys or webhook signing secrets.
- Avoid live-mode side effects for local validation.
- Preserve webhook idempotency checks when replaying/triggering events.

## Stripe MCP Usage Pattern
1. Use Stripe MCP for account data lookup, billing state inspection, and controlled support operations.
2. Prefer discovery tools first (`list_*` or `search_stripe_resources`) before ID-specific fetches.
3. Treat write operations (`create_refund`, `cancel_subscription`, `update_subscription`) as high risk:
   - confirm scope in task notes,
   - log evidence in validation/changelog.
4. Keep customer financial data redacted in docs/logs.

## Chrome DevTools MCP Usage Pattern
1. Navigate to changed route.
2. Validate render state and key interactions.
3. Check console messages and failed network requests.
4. Capture screenshots for desktop and mobile.
5. Store evidence in `docs/logs/validations/`.

## Payments Cutover and Incident Runbook
- Canonical runbook:
  - `docs/references/payments-cutover-runbook.md`
- Minimum commands for go/no-go gate:
  - `./scripts/supabase-cli-selfhosted.sh migration list`
  - `npm run payments:check-compliance-policies`
  - `npm run payments:check-ledger`
  - `PLAYWRIGHT_AUTH_E2E=true npm run e2e:auth-smoke`

## Supabase Usage Pattern
1. Inspect migrations before changing schema.
2. Validate RLS and ownership constraints.
3. Prefer safe/forward migrations over destructive changes.
4. If MCP context is stale, use the self-hosted Supabase operational path documented in `docs/references/legacy/caudals-context-legacy.md` and `docs/references/legacy/db-runbook.md`.

## GitHub Usage Pattern
1. Keep PR descriptions aligned with phase task IDs.
2. Link completed tasks to validation evidence.
