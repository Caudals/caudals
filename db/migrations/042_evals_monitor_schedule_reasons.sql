-- Preserve the reason for a schedule's current paused state without rewriting WP-13 history.
BEGIN;

ALTER TABLE evals.monitor_schedule ADD COLUMN reason_code text;
GRANT UPDATE(reason_code) ON evals.monitor_schedule TO evals_runtime;

COMMIT;
