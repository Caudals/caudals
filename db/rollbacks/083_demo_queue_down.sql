-- Reverts 083 only when nothing would be lost. Prefer forward repair.
--
-- Before running it: set DEMO_QUEUE_ENABLED=false and DEMO_FALLBACK_ENABLED=false,
-- deploy a pre-083 app image only after the queue has drained (no run waiting
-- with started_at NULL) and every requested report email has been sent or
-- dropped. Pre-083 images treat a waiting run as started, so they would run it
-- immediately rather than lose it.
--
-- The fallback spend record is kept: the rollback refuses to drop
-- demo.fallback_usage while it holds rows.
-- The append-only analytics INSERT grant is intentionally retained: other
-- server emitters (including L-02) may already depend on it.
BEGIN;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM demo.fallback_usage) THEN
    RAISE EXCEPTION 'Forward repair required: demo.fallback_usage holds the fallback spend record';
  END IF;
  IF EXISTS (SELECT 1 FROM demo.run WHERE notify_email_ciphertext IS NOT NULL) THEN
    RAISE EXCEPTION 'Report emails are still pending: send or drop them first';
  END IF;
  IF EXISTS (SELECT 1 FROM demo.run WHERE started_at IS NULL AND queued_at IS NOT NULL AND phase NOT IN ('done','failed')) THEN
    RAISE EXCEPTION 'Runs are still waiting in the queue: drain it first';
  END IF;
END $$;
DROP TABLE demo.fallback_usage;
DROP INDEX IF EXISTS demo.demo_run_notify;
DROP INDEX IF EXISTS demo.demo_run_queue;
ALTER TABLE demo.run
  DROP CONSTRAINT IF EXISTS run_notify_consent,
  DROP COLUMN IF EXISTS fallback_cost_eur,
  DROP COLUMN IF EXISTS model_used,
  DROP COLUMN IF EXISTS notified_at,
  DROP COLUMN IF EXISTS notify_requested_at,
  DROP COLUMN IF EXISTS notify_email_ciphertext,
  DROP COLUMN IF EXISTS started_at,
  DROP COLUMN IF EXISTS queued_at;
DELETE FROM public.evals_migration_history WHERE name = '083_demo_queue.sql';
COMMIT;
