# 2026-03-03 - Validation Log (Tooling/MCP Runbook Hardening)

## Doc Verification

1. `rg -n "Supabase CLI Usage Pattern|Supabase MCP Usage Pattern|Stripe CLI Usage Pattern|Stripe MCP Usage Pattern" docs/references/tooling-and-mcp.md`
- Result: PASS
- Verified all new agent runbook sections exist.

2. `rg -n "tooling-and-mcp.md" docs/README.md docs/index.md`
- Result: PASS
- Verified onboarding docs reference the detailed tooling runbook.

3. `git diff -- docs/references/tooling-and-mcp.md docs/README.md`
- Result: PASS
- Verified changes are documentation-only and scoped to tooling guidance.

## Policy/Contract Checks

- Confirmed self-hosted Supabase CLI guidance explicitly requires `--db-url` and warns against `--linked`.
- Confirmed security language preserves secret-handling constraints for DB credentials, Stripe keys, and webhook secrets.
