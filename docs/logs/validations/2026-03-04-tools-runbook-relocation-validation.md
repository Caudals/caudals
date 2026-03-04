# 2026-03-04 - Tooling Runbook Relocation Validation

## Commands
1. Path/reference sweep:

```bash
rg -n "docs/references/tooling-and-mcp\.md|docs/TOOLS\.md" AGENTS.md ARCHITECTURE.md docs
```

Result: all active references point to `docs/TOOLS.md`; no references to old path remain.

2. Type check:

```bash
npm run typecheck
```

Result: pass.

## Manual Checks
- Verified `docs/TOOLS.md` exists with full operational content.
- Verified `docs/index.md` lists `docs/TOOLS.md` in structure and read/write matrix.
