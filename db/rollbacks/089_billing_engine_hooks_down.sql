-- Reverts 089 only while nothing depends on it: no run or generation job has
-- frozen a price-book revision, and no shadow entry or report exists.
-- Otherwise the snapshots and the shadow ledger are billing evidence: repair
-- forward instead. The workspace budget window columns are dropped with the
-- rest (settled stays the lifetime total, as before 089).
BEGIN;
DO $$ BEGIN
  IF to_regclass('billing.shadow_entry') IS NOT NULL AND (
       EXISTS (SELECT 1 FROM billing.shadow_entry)
    OR EXISTS (SELECT 1 FROM billing.shadow_report)
    OR EXISTS (SELECT 1 FROM evals.run WHERE price_book_revision_id IS NOT NULL)
    OR EXISTS (SELECT 1 FROM evals.generation_job WHERE price_book_revision_id IS NOT NULL)) THEN
    RAISE EXCEPTION 'engine hooks rollback refused: runs or jobs froze a price book, or shadow entries exist; repair forward';
  END IF;
END $$;
DROP FUNCTION IF EXISTS billing.record_shadow_report(date);
DROP FUNCTION IF EXISTS billing.shadow_diff(date, uuid);
DROP FUNCTION IF EXISTS billing.run_refund_candidates(integer);
DROP FUNCTION IF EXISTS billing.shadow_expire_holds(integer);
DROP FUNCTION IF EXISTS billing.shadow_refund_run(uuid, uuid, text);
DROP FUNCTION IF EXISTS billing.shadow_charge(uuid, text, text, text, bigint, numeric, uuid, uuid, uuid, jsonb);
DROP FUNCTION IF EXISTS billing.shadow_release(uuid, text, text);
DROP FUNCTION IF EXISTS billing.shadow_capture(uuid, text, bigint, jsonb, jsonb);
DROP FUNCTION IF EXISTS billing.shadow_hold(uuid, text, bigint, uuid, uuid, uuid, uuid, uuid, jsonb);
DROP FUNCTION IF EXISTS billing._shadow_insert(uuid, text, text, bigint, bigint, bigint, jsonb);
DROP TABLE IF EXISTS billing.shadow_report, billing.shadow_entry;
DROP FUNCTION IF EXISTS billing.action_pricing(uuid, text, uuid, uuid);
DROP FUNCTION IF EXISTS billing.engine_pricing(uuid, uuid, integer, uuid, uuid, uuid, uuid, uuid);
DROP FUNCTION IF EXISTS billing._pricing_context(uuid, uuid, uuid, uuid, uuid, uuid);
ALTER TABLE evals.execution_budget DROP CONSTRAINT IF EXISTS execution_budget_period;
ALTER TABLE evals.execution_budget DROP COLUMN IF EXISTS period_base, DROP COLUMN IF EXISTS period_start;
COMMENT ON COLUMN evals.run.reason_code IS NULL;
COMMENT ON COLUMN evals.execution_workflow.reason_code IS NULL;
COMMENT ON COLUMN evals.workflow_step.reason_code IS NULL;
COMMENT ON COLUMN evals.generation_job.reason_code IS NULL;
DROP TRIGGER IF EXISTS frozen_price_book ON evals.run;
DROP TRIGGER IF EXISTS frozen_price_book ON evals.generation_job;
DROP FUNCTION IF EXISTS evals.freeze_price_book();
ALTER TABLE evals.run DROP COLUMN IF EXISTS price_book_revision_id;
ALTER TABLE evals.generation_job DROP COLUMN IF EXISTS price_book_revision_id;
DELETE FROM public.evals_migration_history WHERE name = '089_billing_engine_hooks.sql';
COMMIT;
