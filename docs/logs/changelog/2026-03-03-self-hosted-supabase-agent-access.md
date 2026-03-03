# 2026-03-03 - Self-Hosted Supabase Agent Access Setup

## Scope

- Configured Codex MCP and Supabase CLI workflows to target the self-hosted Supabase instance running on the Caudals VPS.
- Implemented localhost SSH-tunnel operational path so agent DB and MCP access does not require public DB exposure.

## Completed Work

- Updated Codex MCP configuration:
  - `~/.codex/config.toml`
  - `mcp_servers.supabase` now points to `http://127.0.0.1:18100/mcp` (self-hosted tunnel endpoint).
  - Preserved prior cloud endpoint as `mcp_servers.supabase-cloud`.

- Added reusable local tunnel automation:
  - `scripts/supabase-selfhosted-tunnel.sh`
  - Supports `start|stop|status` for `mcp|db|all`.
  - Uses SSH control sockets and dynamically resolves `supabase-db` container IP for direct Postgres access.

- Added Supabase CLI wrapper for self-hosted remote DB:
  - `scripts/supabase-cli-selfhosted.sh`
  - Auto-starts DB tunnel and runs Supabase commands with explicit `--db-url`.
  - Forces `PGSSLMODE=disable` for non-TLS self-hosted Postgres tunnel.

- Added local secret/env bootstrap output:
  - `~/.config/caudals/supabase-selfhosted.env` (local-only, not committed)
  - Stores SSH host, local tunnel ports, DB credentials, and public URL.

- Enabled self-hosted MCP route on VPS Kong config for localhost/bridge-restricted access and restarted services.
  - Updated `/supabase/supabase/docker/volumes/api/kong.yml` on VPS.
  - Restarted `supabase-kong`, `supabase-meta`, `supabase-studio`.
  - Corrected reserved-role password mismatch for `supabase_read_only_user` using `supabase_admin`.

- Updated repo operational docs:
  - `docs/README.md` with self-hosted tunnel + CLI workflow.
