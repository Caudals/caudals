-- Reverts 084 only while the ledger is still empty. Once any ledger entry,
-- lot or hold exists, or any account has a balance or a freeze, the credit
-- ledger is financial evidence: switch BILLING_CREDITS_ENABLED off and repair
-- forward instead. Zero-balance accounts are a derived backfill and go with
-- the schema.
BEGIN;
DO $$ BEGIN
  IF to_regnamespace('billing') IS NOT NULL AND (
       EXISTS (SELECT 1 FROM billing.ledger_entry)
    OR EXISTS (SELECT 1 FROM billing.credit_lot)
    OR EXISTS (SELECT 1 FROM billing.credit_hold)
    OR EXISTS (SELECT 1 FROM billing.credit_account
               WHERE available_ucr <> 0 OR held_ucr <> 0 OR frozen_reason IS NOT NULL)) THEN
    RAISE EXCEPTION 'billing rollback refused: the credit ledger holds rows; disable BILLING_CREDITS_ENABLED and repair forward';
  END IF;
END $$;
DROP TRIGGER IF EXISTS billing_account_sync ON evals.workspace_entitlement;
DROP SCHEMA IF EXISTS billing CASCADE;
DELETE FROM public.evals_migration_history WHERE name = '084_billing_core.sql';
COMMIT;
