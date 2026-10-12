-- Reverts 088 only while the price book is still the seed and nothing has
-- used it: no ledger entry or hold references a revision, no operator
-- revision, FX rate or price check was added, and no route depends on a
-- free_model flag. Otherwise the price book is billing evidence: repair
-- forward instead.
BEGIN;
DO $$ BEGIN
  IF to_regclass('billing.price_book_revision') IS NOT NULL AND (
       EXISTS (SELECT 1 FROM billing.ledger_entry WHERE price_book_revision_id IS NOT NULL)
    OR EXISTS (SELECT 1 FROM billing.credit_hold WHERE price_book_revision_id IS NOT NULL)
    OR EXISTS (SELECT 1 FROM billing.price_book_revision WHERE revision > 2)
    OR EXISTS (SELECT 1 FROM billing.price_check)
    OR EXISTS (SELECT 1 FROM billing.fx_rate WHERE recorded_by <> 'system:migration-088')) THEN
    RAISE EXCEPTION 'price book rollback refused: the price book has been used or changed; repair forward';
  END IF;
END $$;
DROP TRIGGER IF EXISTS route_priced ON evals.platform_model_route;
DROP TRIGGER IF EXISTS route_priced ON evals.generation_provider_route;
DROP TRIGGER IF EXISTS route_priced ON evals.evaluation_model_route;
DROP FUNCTION IF EXISTS evals.assert_route_priced();
ALTER TABLE evals.provider_revision DROP COLUMN IF EXISTS free_model;
ALTER TABLE billing.ledger_entry DROP CONSTRAINT IF EXISTS ledger_entry_price_book_revision_fk;
ALTER TABLE billing.credit_hold DROP CONSTRAINT IF EXISTS credit_hold_price_book_revision_fk;
DROP FUNCTION IF EXISTS billing.estimate_stats(timestamptz, timestamptz);
DROP FUNCTION IF EXISTS billing.record_price_check(uuid, numeric, date, integer, integer, integer, jsonb);
DROP FUNCTION IF EXISTS billing.record_fx_rate(text, date, numeric, text);
DROP FUNCTION IF EXISTS billing.activate_due_price_books();
DROP FUNCTION IF EXISTS billing.activate_price_book(uuid);
DROP FUNCTION IF EXISTS billing.cancel_price_book(uuid);
DROP FUNCTION IF EXISTS billing.schedule_price_book(uuid, timestamptz);
DROP FUNCTION IF EXISTS billing.create_price_book_draft(text, text, numeric, numeric, date, text, uuid, jsonb, jsonb);
DROP FUNCTION IF EXISTS billing._activate_due();
DROP FUNCTION IF EXISTS billing._raises_prices(uuid, uuid);
DROP FUNCTION IF EXISTS billing._price_audit(text, billing.price_book_revision, jsonb);
DROP FUNCTION IF EXISTS billing.route_price_issues(uuid);
DROP FUNCTION IF EXISTS billing.provider_revision_rate_key(uuid);
DROP FUNCTION IF EXISTS billing.model_price_issue(text, text, text, boolean, numeric, numeric);
DROP FUNCTION IF EXISTS billing.rate_for(uuid, text, text, integer);
DROP FUNCTION IF EXISTS billing.price_book_at(timestamptz);
DROP FUNCTION IF EXISTS billing.model_key(text, text);
DROP FUNCTION IF EXISTS billing.model_provider(text, text);
-- The seed rows are removed with their tables (the guards fire per row, not on DROP).
DROP TABLE IF EXISTS billing.price_check, billing.fx_rate, billing.action_rate, billing.model_rate, billing.price_book_revision;
DROP FUNCTION IF EXISTS billing.price_book_rates_guard();
DROP FUNCTION IF EXISTS billing.price_book_revision_guard();
DELETE FROM public.evals_migration_history WHERE name = '088_billing_price_book.sql';
COMMIT;
