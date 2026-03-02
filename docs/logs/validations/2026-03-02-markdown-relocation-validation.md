# 2026-03-02 Markdown Relocation Validation

## Checks
1. Root markdown files limited to `AGENTS.md` and `ARCHITECTURE.md`.
2. Moved markdown files exist at their new `docs/` paths.
3. Active doc references updated to `docs/PLAN.md` and related moved files.
4. No markdown remains outside `docs/` except the two allowed root files.

## Command Evidence
- `ls -1 *.md`
- `ls -1 docs/{README.md,PLAN.md,DESIGN.md,FRONTEND.md,PRODUCT_SENSE.md,QUALITY_SCORE.md,RELIABILITY.md,SECURITY.md}`
- `rg -n "\\b(PLAN|DESIGN|FRONTEND|PRODUCT_SENSE|QUALITY_SCORE|RELIABILITY|SECURITY|README)\\.md\\b" AGENTS.md ARCHITECTURE.md docs -g '*.md'`
- `rg --files -g '*.md' | grep -v '^docs/' | grep -v '^AGENTS\\.md$' | grep -v '^ARCHITECTURE\\.md$'`

## Result
PASS
