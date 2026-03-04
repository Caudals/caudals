# 2026-03-03 - Tooling/MCP Agent Runbook Hardening

## Scope

- Expanded agent-facing docs to give explicit operational instructions for Supabase and Stripe CLI/MCP usage.
- Added hard rules for self-hosted Supabase CLI execution with mandatory `--db-url`.

## Completed Work

- Updated tooling runbook:
  - `docs/TOOLS.md`
  - Added:
    - tool selection matrix,
    - self-hosted Supabase CLI workflow and hard rules (`--db-url`, no `--linked`),
    - self-hosted Supabase MCP usage and fallback guidance,
    - Stripe CLI workflow for webhook forward/trigger,
    - Stripe MCP usage and write-operation safety notes.

- Added onboarding cross-link:
  - `docs/README.md`
  - Added pointer from self-hosted Supabase section to `docs/TOOLS.md` for detailed agent instructions.
