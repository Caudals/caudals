# Localization QA Runbook (EN/ES)

## Purpose
Keep production copy parity between English source strings and Spanish translations.

## Commands
1. Missing-key guardrail (required in CI):
   - `npm run i18n:check-parity`
2. Optional strict orphan-key check (local audit):
   - `npm run i18n:check-parity -- --strict-orphans`

## Source of Truth
- English source keys: `translations-source.json`
- Spanish dictionary used at runtime: `lib/i18n/es.json`

## Failure Interpretation
- `missingCount > 0`:
  - one or more English source keys are missing in `lib/i18n/es.json`.
  - must be fixed before merge/release.
- `emptyValueCount > 0`:
  - one or more Spanish values are empty/non-string.
  - must be fixed before merge/release.
- `orphanCount > 0`:
  - Spanish keys exist that are not in current source list.
  - not blocking unless strict mode is enabled; review during translation cleanup.

## Update Workflow
1. Add or update source string(s).
2. Add matching ES translations in `lib/i18n/es.json`.
3. Run `npm run i18n:check-parity`.
4. Capture output in validation logs for localization-impacting changes.
