-- Reverts 091 only while nothing has been bought or configured. Once any
-- order, Stripe event, billing profile, first-bonus claim, auto-recharge or
-- cap setting, Stripe customer or alert exists, or the ledger holds a money
-- refund (a negative `refund` entry), the rows are financial evidence:
-- set BILLING_STRIPE_MODE aside, close payments and repair forward instead.
BEGIN;
DO $$ BEGIN
  IF to_regclass('billing.top_up_order') IS NOT NULL AND (
       EXISTS (SELECT 1 FROM billing.top_up_order)
    OR EXISTS (SELECT 1 FROM billing.stripe_event)
    OR EXISTS (SELECT 1 FROM billing.billing_profile)
    OR EXISTS (SELECT 1 FROM billing.first_bonus_claim)
    OR EXISTS (SELECT 1 FROM billing.auto_recharge)
    OR EXISTS (SELECT 1 FROM billing.spend_cap)
    OR EXISTS (SELECT 1 FROM billing.stripe_customer)
    OR EXISTS (SELECT 1 FROM billing.alert_state)
    OR EXISTS (SELECT 1 FROM billing.ledger_entry WHERE entry_type = 'refund' AND amount_ucr < 0)) THEN
    RAISE EXCEPTION 'billing payments rollback refused: payments data exists; repair forward';
  END IF;
END $$;

DROP FUNCTION IF EXISTS
  billing.workspace_label(uuid),
  billing.stripe_webhook_backlog(integer),
  billing.mark_alert_sent(uuid, text, text),
  billing.claim_alert(uuid, text, text, jsonb),
  billing.attach_payment_intent(uuid, uuid, text, text),
  billing.claim_auto_recharge(uuid, boolean),
  billing.auto_recharge_due(integer),
  billing.lift_purchase_limits(uuid, text),
  billing.record_dispute(uuid, uuid, text, text, text),
  billing.record_charge_refunded(uuid, uuid, text, bigint, text),
  billing.finish_top_up_refund(uuid, uuid, text),
  billing.begin_top_up_refund(uuid, uuid, text, text),
  billing._refund_order(billing.top_up_order, text, text),
  billing.record_payment_failure(uuid, uuid, text, text, text),
  billing.record_payment_details(uuid, uuid, text, text, text, text, text, boolean, text, text[]),
  billing.record_purchase(uuid, uuid, boolean, bigint, text, text, text, text, text),
  billing.find_top_up_order(uuid, text, text, text),
  billing.stripe_event_finish(text, text, text, uuid, uuid),
  billing.stripe_event_begin(text, text, boolean, text, text, text, timestamptz),
  billing.set_spend_cap(uuid, text, uuid, bigint, numeric, text),
  billing.set_auto_recharge(uuid, boolean, bigint, bigint, integer, bigint, text),
  billing.purchase_limits(uuid),
  billing.first_bonus_available(uuid, text),
  billing.close_checkout(uuid, uuid, text),
  billing.attach_checkout_session(uuid, uuid, text, timestamptz),
  billing.create_top_up_order(uuid, text, bigint, boolean, text, text),
  billing.save_stripe_customer(uuid, boolean, text),
  billing.save_profile(uuid, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text),
  billing._take_order_lots(uuid, uuid, bigint),
  billing._create_order(uuid, text, text, bigint, boolean, text, bigint, integer, text),
  billing._expire_stale_checkouts(uuid),
  billing._purchase_limits(uuid),
  billing._first_bonus_open(uuid, text, text),
  billing._order(uuid, uuid),
  billing._audit_event(uuid, text, text, jsonb),
  billing.purchase_expiry(timestamptz),
  billing.pack_bonus_percent(bigint),
  billing._owner(uuid);

DROP TABLE IF EXISTS billing.alert_state, billing.spend_cap, billing.auto_recharge, billing.first_bonus_claim,
  billing.stripe_event, billing.top_up_order, billing.stripe_customer, billing.billing_profile;

ALTER TABLE billing.ledger_entry DROP CONSTRAINT ledger_entry_direction;
ALTER TABLE billing.ledger_entry ADD CONSTRAINT ledger_entry_direction CHECK (CASE entry_type
    WHEN 'hold' THEN held_delta_ucr > 0 AND available_delta_ucr = -held_delta_ucr
    WHEN 'release' THEN held_delta_ucr < 0 AND available_delta_ucr = -held_delta_ucr
    WHEN 'capture' THEN held_delta_ucr <= 0 AND available_delta_ucr = 0
    WHEN 'expiry' THEN available_delta_ucr < 0 AND held_delta_ucr = 0
    WHEN 'action' THEN available_delta_ucr <= 0 AND held_delta_ucr = 0
    WHEN 'chargeback' THEN available_delta_ucr <= 0 AND held_delta_ucr = 0
    WHEN 'adjustment' THEN available_delta_ucr <> 0 AND held_delta_ucr = 0
    WHEN 'reversal' THEN available_delta_ucr <> 0 AND held_delta_ucr = 0
    ELSE available_delta_ucr > 0 AND held_delta_ucr = 0 END);

DELETE FROM public.evals_migration_history WHERE name = '091_billing_payments.sql';
COMMIT;
