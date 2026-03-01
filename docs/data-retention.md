# Data Retention and Artifact Cleanup

Last updated: 2026-03-01  
Task: `S7-T07`

## Objective

Reduce storage and privacy risk from stale export artifacts and temporary uploads.

## Cleanup Job

Script: `scripts/cleanup-expired-artifacts.ts`  
NPM command: `npm run cleanup:expired`

What it does:

1. Loads `dataset_exports` rows in statuses: `ready`, `expired`, `failed`, `cancelled`.
2. Marks expired `ready` exports as `expired` and removes stored file objects.
3. Purges old file references for terminal export states after retention threshold.
4. Cleans old temporary objects in configured storage prefixes.

## Default Retention Controls

- Export artifact purge threshold: `30` days (`EXPORT_RETENTION_DELETE_AFTER_DAYS`)
- Temp artifact threshold: `2` days (`TEMP_ARTIFACT_RETENTION_DAYS`)
- Temp prefixes default:
  - `dataset-files/temp/`
  - `dataset-images/temp/`

## Environment Flags

- `RETENTION_DRY_RUN=true` -> report actions without deleting/updating
- `RETENTION_TEMP_PREFIXES=prefix-a/,prefix-b/`
- `EXPORT_RETENTION_DELETE_AFTER_DAYS=<number>`
- `TEMP_ARTIFACT_RETENTION_DAYS=<number>`

## Suggested Schedule

Run daily via cron/systemd timer in production.

Example cron:

```bash
0 3 * * * cd /path/to/repo && npm run cleanup:expired >> /var/log/caudals-retention.log 2>&1
```

## Safety

- Start with `RETENTION_DRY_RUN=true` in staging and first production runs.
- Monitor log output for deleted keys and updated export rows.
- Keep DB migration and rollback process aligned with `docs/db-runbook.md`.
