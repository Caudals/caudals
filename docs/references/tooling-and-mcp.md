# Tooling and MCP Reference

## Primary Tooling
- Terminal: local build/test/lint, file ops, repo diagnostics.
- Supabase tooling: schema/data checks, migrations, policy validation.
- GitHub MCP: PR/issues/review workflows.
- Chrome DevTools MCP: UI verification and screenshot capture.

## Chrome DevTools MCP Usage Pattern
1. Navigate to changed route.
2. Validate render state and key interactions.
3. Check console messages and failed network requests.
4. Capture screenshots for desktop and mobile.
5. Store evidence in `docs/logs/validations/`.

## Supabase Usage Pattern
1. Inspect migrations before changing schema.
2. Validate RLS and ownership constraints.
3. Prefer safe/forward migrations over destructive changes.
4. If MCP context is stale, use the self-hosted Supabase operational path documented in `docs/references/legacy/caudals-context-legacy.md` and `docs/references/legacy/db-runbook.md`.

## GitHub Usage Pattern
1. Keep PR descriptions aligned with phase task IDs.
2. Link completed tasks to validation evidence.
