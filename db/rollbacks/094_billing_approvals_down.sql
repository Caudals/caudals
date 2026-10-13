-- Reverts 094 only while nothing depends on it: no approval request, no
-- stored reconciliation report and no recorded price notice. Once ops used
-- the two-person rule, the daily reconciliation ran or an increase notice
-- went out, repair forward instead (those rows are the audit evidence).
-- Restores the L-10 (088) bodies of the price-book functions it replaced.
BEGIN;
DO $$ DECLARE used boolean := false; t text; BEGIN
  FOREACH t IN ARRAY ARRAY['billing.approval_request','billing.reconciliation_report'] LOOP
    IF to_regclass(t) IS NOT NULL THEN EXECUTE format('SELECT %L::boolean OR EXISTS (SELECT 1 FROM %s)', used, t) INTO used; END IF;
  END LOOP;
  IF used OR EXISTS (SELECT 1 FROM billing.price_book_revision WHERE notice_sent_at IS NOT NULL) THEN
    RAISE EXCEPTION 'billing approvals rollback refused: approvals, reconciliation reports or price notices exist; repair forward';
  END IF;
END $$;

DROP TRIGGER IF EXISTS ledger_entry_two_person ON billing.ledger_entry;
DROP FUNCTION IF EXISTS
  billing.request_approval(uuid, text, bigint, bigint, jsonb, text, text),
  billing.approve_request(uuid, uuid, text),
  billing.complete_approval(uuid, uuid, jsonb),
  billing.close_approval(uuid, uuid, text),
  billing.list_approvals(text, integer),
  billing.require_second_approver(),
  billing.set_account_freeze(uuid, boolean, text, text),
  billing.extend_lot_expiry(uuid, uuid, timestamptz, text, text),
  billing.price_notice_recipients(uuid),
  billing.price_increases(uuid),
  billing.record_price_notice(uuid, jsonb),
  billing.reconciliation_checks(date, boolean),
  billing.record_reconciliation(date, boolean, integer, integer, boolean, jsonb),
  billing.reconciliation_reports(boolean, date, integer),
  billing.search_accounts(text, integer),
  billing.credit_usage(timestamptz, timestamptz),
  billing.fraud_queue(integer),
  billing.orders_lookup(uuid[], text[]);
DROP FUNCTION IF EXISTS billing._approval_view(billing.approval_request);
DROP TABLE IF EXISTS billing.approval_request;
DROP TABLE IF EXISTS billing.reconciliation_report;
DROP FUNCTION IF EXISTS billing.approval_request_guard(), billing._ops_admin(uuid);

-- The 088 bodies.
CREATE OR REPLACE FUNCTION billing.price_book_at(p_at timestamptz DEFAULT now()) RETURNS billing.price_book_revision
LANGUAGE sql STABLE SET search_path = pg_catalog AS $$
  SELECT * FROM billing.price_book_revision
  WHERE status IN ('scheduled','active','retired') AND effective_at <= coalesce(p_at, now())
  ORDER BY effective_at DESC LIMIT 1
$$;

CREATE OR REPLACE FUNCTION billing._activate_due() RETURNS SETOF billing.price_book_revision
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE r billing.price_book_revision; old billing.price_book_revision;
BEGIN
  FOR r IN SELECT * FROM billing.price_book_revision WHERE status = 'scheduled' AND effective_at <= now()
      ORDER BY effective_at FOR UPDATE LOOP
    UPDATE billing.price_book_revision SET status = 'retired', retired_at = now() WHERE status = 'active' RETURNING * INTO old;
    UPDATE billing.price_book_revision SET status = 'active', activated_at = now() WHERE id = r.id RETURNING * INTO r;
    PERFORM billing._price_audit('billing.price_book.activated', r, jsonb_build_object('retired_revision', old.revision));
    RETURN NEXT r;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION billing.price_book_revision_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE lifecycle text[] := ARRAY['status','effective_at','raises_prices','notice_sent_at','scheduled_by','scheduled_at','activated_at','retired_at'];
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'draft' THEN RAISE EXCEPTION 'PRICE_BOOK_IMMUTABLE' USING ERRCODE = '55000'; END IF;
    RETURN OLD;
  END IF;
  IF OLD.status = 'draft' THEN
    IF NEW.status NOT IN ('draft','scheduled') THEN RAISE EXCEPTION 'PRICE_BOOK_TRANSITION' USING ERRCODE = '55000'; END IF;
    RETURN NEW;
  END IF;
  IF (to_jsonb(NEW) - lifecycle) IS DISTINCT FROM (to_jsonb(OLD) - lifecycle) THEN
    RAISE EXCEPTION 'PRICE_BOOK_IMMUTABLE' USING ERRCODE = '55000';
  END IF;
  IF OLD.status = 'scheduled' AND NEW.status = 'scheduled' THEN
    IF NEW.effective_at IS DISTINCT FROM OLD.effective_at OR NEW.raises_prices IS DISTINCT FROM OLD.raises_prices
       OR NEW.scheduled_at IS DISTINCT FROM OLD.scheduled_at OR NEW.scheduled_by IS DISTINCT FROM OLD.scheduled_by THEN
      RAISE EXCEPTION 'PRICE_BOOK_IMMUTABLE' USING ERRCODE = '55000';
    END IF;
    RETURN NEW;
  ELSIF OLD.status = 'scheduled' AND NEW.status = 'draft' THEN
    IF OLD.effective_at <= now() THEN RAISE EXCEPTION 'PRICE_BOOK_IN_EFFECT' USING ERRCODE = '55000'; END IF;
    RETURN NEW;
  ELSIF OLD.status = 'scheduled' AND NEW.status = 'active' THEN
    IF NEW.effective_at > now() OR NEW.effective_at > OLD.effective_at OR NEW.raises_prices IS DISTINCT FROM OLD.raises_prices
       OR NEW.activated_at IS NULL THEN
      RAISE EXCEPTION 'PRICE_BOOK_TRANSITION' USING ERRCODE = '55000';
    END IF;
    RETURN NEW;
  ELSIF OLD.status = 'active' AND NEW.status IN ('active','retired') THEN
    IF NEW.effective_at IS DISTINCT FROM OLD.effective_at OR NEW.raises_prices IS DISTINCT FROM OLD.raises_prices
       OR NEW.scheduled_at IS DISTINCT FROM OLD.scheduled_at OR NEW.scheduled_by IS DISTINCT FROM OLD.scheduled_by
       OR NEW.activated_at IS DISTINCT FROM OLD.activated_at OR NEW.notice_sent_at IS DISTINCT FROM OLD.notice_sent_at THEN
      RAISE EXCEPTION 'PRICE_BOOK_IMMUTABLE' USING ERRCODE = '55000';
    END IF;
    RETURN NEW;
  ELSIF OLD.status = 'retired' THEN
    RAISE EXCEPTION 'PRICE_BOOK_IMMUTABLE' USING ERRCODE = '55000';
  END IF;
  RAISE EXCEPTION 'PRICE_BOOK_TRANSITION' USING ERRCODE = '55000';
END $$;

CREATE OR REPLACE FUNCTION billing.cancel_price_book(p_revision_id uuid) RETURNS billing.price_book_revision
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE r billing.price_book_revision;
BEGIN
  PERFORM billing._privileged();
  PERFORM pg_advisory_xact_lock(hashtext('billing.price_book'));
  SELECT * INTO r FROM billing.price_book_revision WHERE id = p_revision_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PRICE_BOOK_NOT_FOUND'; END IF;
  IF r.status <> 'scheduled' THEN RAISE EXCEPTION 'PRICE_BOOK_TRANSITION'; END IF;
  IF r.effective_at <= now() THEN RAISE EXCEPTION 'PRICE_BOOK_IN_EFFECT'; END IF;
  UPDATE billing.price_book_revision SET status = 'draft', effective_at = NULL, raises_prices = NULL, scheduled_by = NULL,
    scheduled_at = NULL, notice_sent_at = NULL
  WHERE id = r.id RETURNING * INTO r;
  PERFORM billing._price_audit('billing.price_book.cancelled', r, '{}'::jsonb);
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION billing.activate_price_book(p_revision_id uuid) RETURNS billing.price_book_revision
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE r billing.price_book_revision;
BEGIN
  PERFORM billing._privileged();
  PERFORM pg_advisory_xact_lock(hashtext('billing.price_book'));
  SELECT * INTO r FROM billing.price_book_revision WHERE id = p_revision_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PRICE_BOOK_NOT_FOUND'; END IF;
  IF r.status = 'active' THEN RETURN r; END IF;
  IF r.status <> 'scheduled' THEN RAISE EXCEPTION 'PRICE_BOOK_TRANSITION'; END IF;
  IF r.effective_at > now() THEN
    IF r.raises_prices THEN RAISE EXCEPTION 'NOTICE_PERIOD_REQUIRED'; END IF;
    IF EXISTS (SELECT 1 FROM billing.price_book_revision WHERE status = 'scheduled' AND id <> r.id AND effective_at < r.effective_at) THEN
      RAISE EXCEPTION 'SCHEDULE_CONFLICT';
    END IF;
    UPDATE billing.price_book_revision SET status = 'retired', retired_at = now() WHERE status = 'active';
    UPDATE billing.price_book_revision SET status = 'active', effective_at = now(), activated_at = now()
    WHERE id = r.id RETURNING * INTO r;
    PERFORM billing._price_audit('billing.price_book.activated', r, jsonb_build_object('brought_forward', true));
    RETURN r;
  END IF;
  PERFORM billing._activate_due();
  SELECT * INTO r FROM billing.price_book_revision WHERE id = r.id;
  RETURN r;
END $$;

DROP FUNCTION IF EXISTS billing._price_book_before(billing.price_book_revision), billing.price_notice_ok(boolean, timestamptz, timestamptz),
  billing.two_person_threshold_ucr(), billing.two_person_threshold_cents();
COMMIT;
