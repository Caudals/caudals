# 2026-03-03 - Validation Log (Self-Hosted Supabase Agent Access)

## Connectivity Checks

1. `ssh -o BatchMode=yes root@161.35.200.8 'echo connected'`
- Result: PASS
- Verified VPS SSH access path for tunnel and remote config operations.

2. `curl -i -s http://127.0.0.1:18100/mcp`
- Result: PASS
- Returned `405 Method Not Allowed` with `Allow: POST`, confirming MCP route reachability through tunnel.

3. `curl -s -X POST http://127.0.0.1:18100/mcp -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","clientInfo":{"name":"curl","version":"1.0"},"capabilities":{}}}'`
- Result: PASS
- Returned MCP initialize response with `serverInfo.name="supabase"` and protocol `2024-11-05`.

## Codex MCP Validation

1. `codex mcp list`
- Result: PASS
- Verified `supabase` server enabled at `http://127.0.0.1:18100/mcp`.

2. `codex exec -C /Users/mario/Documents/caudals "Use the supabase MCP server and list available tool names only."`
- Result: PASS
- Supabase MCP started and exposed toolset.

3. `codex exec -C /Users/mario/Documents/caudals "Use the supabase MCP server to run list_tables and return only the number of tables."`
- Result: PASS with caveat
- `list_tables` currently errors (`PgMetaDatabaseError: there is no parameter $1`).
- Fallback MCP tool `execute_sql` succeeded and returned table count.

## Supabase CLI Validation (Primary)

1. `./scripts/supabase-selfhosted-tunnel.sh start all`
- Result: PASS
- Verified MCP + DB tunnels established.

2. `./scripts/supabase-cli-selfhosted.sh migration list`
- Result: PASS
- Verified Supabase CLI can connect to self-hosted remote DB via tunnel + explicit `--db-url`.

3. `./scripts/supabase-cli-selfhosted.sh db push --dry-run`
- Result: PASS
- Verified migration push path resolves and enumerates pending migrations without applying changes.

## Syntax/Integrity Checks

1. `bash -n scripts/supabase-selfhosted-tunnel.sh scripts/supabase-cli-selfhosted.sh`
- Result: PASS

2. `codex mcp get supabase`
- Result: PASS
- Verified Codex MCP server definition persisted in config.
