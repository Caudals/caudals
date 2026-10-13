-- Ops billing console and reconciliation (launch spec v2 §6.4, §6.9, §6.13,
-- §6.15; package L-16).
--
-- Two-person approvals. A credit action above 10,000 credits (€100) or a
-- money refund above €100 net needs a second platform admin.
-- billing.approval_request keeps each pending action: the workspace, the
-- action and its payload (with its SHA-256), the requester, the approver, an
-- expiry (24 hours) and what the execution produced. The approver must be a
-- different platform admin, must name the payload hash they reviewed, and the
-- action runs as them in the transaction that marks the request approved.
-- A backstop trigger on billing.ledger_entry refuses any credit entry above
-- the threshold written by a person (actor kind 'user') unless the
-- transaction carries an approval that this person approved for this
-- workspace (billing.approval_id, set only by billing.approve_request).
--
-- Account controls: billing.set_account_freeze (freeze or unfreeze, refused
-- while a payment dispute is open) and billing.extend_lot_expiry (only
-- later, only for unexpired lots with credits left). Neither moves credits,
-- so neither writes a ledger entry; both write an audit event with before
-- and after values. Grants, adjustments, reversals, run refunds and money
-- refunds keep their L-09/L-12 functions, which already write the ledger
-- entry and the audit event.
--
-- Price notices (§6.4). A revision that raises any rate takes effect only
-- when its notice was sent at least 30 days before its effective date. Until
-- then billing.price_book_at, the hourly activation and manual activation
-- skip it; a held revision whose date has passed can be cancelled back to a
-- draft and rescheduled. billing.record_price_notice records the notice
-- (scheduled raising revisions only, never later than 30 days before the
-- date) and billing.price_notice_recipients lists the credit workspaces whose
-- owners used a raised model (or any run, when a meter rises) in the last 90
-- days.
--
-- Reconciliation (§6.13, P-49). billing.reconciliation_checks compares paid
-- orders with ledger purchases, refunds and chargebacks, invoices and
-- rectifying invoices with the orders, open holds older than 25 hours, the
-- account invariants and the shadow diff for one UTC day; the application
-- adds the Stripe balance transactions and keeps the result in
-- billing.reconciliation_report (append-only).
--
-- Ops reads: account search, credit usage per workspace and the fraud queue
-- (flagged sign-ups, top-up velocity, risk flags, disputes and freezes).
--
-- Everything is platform-admin or service only, through SECURITY DEFINER
-- functions granted to the web runtime (and the scheduler inside it).
--
-- Forward repair: additive. The rollback restores the L-10 price-book
-- functions and refuses once an approval or a reconciliation report exists,
-- or a revision records a notice.
BEGIN;
SET LOCAL lock_timeout = '10s';

/* ---------------------------------------------------------- approvals --- */

-- 10,000 credits (€100) in micro-credits, and €100 net in cents.
CREATE FUNCTION billing.two_person_threshold_ucr() RETURNS bigint
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$ SELECT 10000000000::bigint $$;
CREATE FUNCTION billing.two_person_threshold_cents() RETURNS bigint
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$ SELECT 10000::bigint $$;

CREATE TABLE billing.approval_request (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES billing.credit_account(org_id),
  action text NOT NULL CHECK (action IN ('grant','adjust','reversal','run_refund','money_refund')),
  -- Credits the action moves (magnitude) and, for money refunds, the net euros in cents.
  amount_ucr bigint NOT NULL CHECK (amount_ucr >= 0),
  net_cents bigint CHECK (net_cents IS NULL OR net_cents >= 0),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object' AND octet_length(payload::text) <= 8192),
  payload_sha256 text NOT NULL CHECK (payload_sha256 ~ '^[0-9a-f]{64}$'),
  reason text NOT NULL CHECK (length(reason) BETWEEN 3 AND 2000),
  requested_by text NOT NULL CHECK (length(requested_by) BETWEEN 1 AND 255),
  requested_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','executed','rejected','cancelled')),
  approved_by text,
  approved_at timestamptz,
  decided_by text,
  decided_at timestamptz,
  decision_reason text CHECK (decision_reason IS NULL OR length(decision_reason) BETWEEN 3 AND 2000),
  executed_at timestamptz,
  result jsonb CHECK (result IS NULL OR (jsonb_typeof(result) = 'object' AND octet_length(result::text) <= 16384)),
  request_id text CHECK (request_id IS NULL OR length(request_id) BETWEEN 1 AND 200),
  UNIQUE (org_id, id),
  CHECK (expires_at > requested_at AND expires_at <= requested_at + interval '7 days'),
  CHECK (approved_by IS NULL OR approved_by <> requested_by),
  CHECK ((status IN ('approved','executed')) = (approved_by IS NOT NULL AND approved_at IS NOT NULL)),
  CHECK ((status = 'executed') = (executed_at IS NOT NULL)),
  CHECK ((status IN ('rejected','cancelled')) = (decided_by IS NOT NULL AND decided_at IS NOT NULL AND decision_reason IS NOT NULL)),
  CHECK (status <> 'rejected' OR decided_by <> requested_by),
  CHECK (status <> 'cancelled' OR decided_by = requested_by),
  CHECK ((action = 'money_refund') = (net_cents IS NOT NULL))
);
-- One open request per workspace and payload: a repeated request returns it.
CREATE UNIQUE INDEX approval_request_open ON billing.approval_request (org_id, payload_sha256) WHERE status IN ('pending','approved');
CREATE INDEX approval_request_recent ON billing.approval_request (requested_at DESC, id DESC);

-- Only the decision columns move, forward only; nothing is deleted.
CREATE FUNCTION billing.approval_request_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE fixed text[] := ARRAY['id','org_id','action','amount_ucr','net_cents','payload','payload_sha256','reason','requested_by',
  'requested_at','expires_at','request_id'];
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'LEDGER_APPEND_ONLY' USING ERRCODE = '55000'; END IF;
  IF (SELECT jsonb_object_agg(k, to_jsonb(NEW) -> k) FROM unnest(fixed) k)
     IS DISTINCT FROM (SELECT jsonb_object_agg(k, to_jsonb(OLD) -> k) FROM unnest(fixed) k) THEN
    RAISE EXCEPTION 'APPROVAL_IMMUTABLE' USING ERRCODE = '55000';
  END IF;
  IF NOT ((OLD.status = 'pending' AND NEW.status IN ('approved','rejected','cancelled'))
       OR (OLD.status = 'approved' AND NEW.status IN ('approved','executed'))) THEN
    RAISE EXCEPTION 'APPROVAL_NOT_PENDING' USING ERRCODE = '55000';
  END IF;
  IF OLD.status = 'approved' AND (NEW.approved_by IS DISTINCT FROM OLD.approved_by OR NEW.approved_at IS DISTINCT FROM OLD.approved_at) THEN
    RAISE EXCEPTION 'APPROVAL_IMMUTABLE' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER approval_request_guard BEFORE UPDATE OR DELETE ON billing.approval_request
  FOR EACH ROW EXECUTE FUNCTION billing.approval_request_guard();
CREATE TRIGGER approval_request_no_truncate BEFORE TRUNCATE ON billing.approval_request
  FOR EACH STATEMENT EXECUTE FUNCTION billing.reject_ledger_mutation();

ALTER TABLE billing.approval_request ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing.approval_request FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_read ON billing.approval_request FOR SELECT
  USING (org_id = nullif(current_setting('evals.org_id', true), '')::uuid);
REVOKE ALL ON billing.approval_request FROM PUBLIC;
GRANT SELECT ON billing.approval_request TO evals_runtime;

-- A person acting on billing: platform admins only (never a service or a customer).
CREATE FUNCTION billing._ops_admin(p_org_id uuid) RETURNS text
LANGUAGE plpgsql STABLE SET search_path = pg_catalog AS $$
DECLARE actor text := billing._actor();
BEGIN
  PERFORM billing._tenant(p_org_id);
  IF billing.actor_kind(actor) <> 'user' OR NOT evals.is_admin() THEN RAISE EXCEPTION 'SCOPE_DENIED' USING ERRCODE = '42501'; END IF;
  RETURN actor;
END $$;

CREATE FUNCTION billing._approval_view(a billing.approval_request) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = pg_catalog AS $$
  SELECT jsonb_build_object('status', a.status, 'approved_by', a.approved_by, 'decided_by', a.decided_by, 'executed_at', a.executed_at)
$$;

-- Opens a request for an action above the threshold. Repeating the same
-- payload while it is open returns the open request.
CREATE FUNCTION billing.request_approval(p_org_id uuid, p_action text, p_amount_ucr bigint, p_net_cents bigint, p_payload jsonb,
  p_reason text, p_request_id text DEFAULT NULL)
RETURNS billing.approval_request
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE actor text := billing._ops_admin(p_org_id); v_reason text; v_hash text; r billing.approval_request;
BEGIN
  v_reason := billing._reason(p_reason, true);
  IF p_action IS NULL OR p_action NOT IN ('grant','adjust','reversal','run_refund','money_refund') OR p_amount_ucr IS NULL OR p_amount_ucr < 0
     OR p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' OR (p_action = 'money_refund') <> (p_net_cents IS NOT NULL)
     OR (p_request_id IS NOT NULL AND length(p_request_id) > 200) THEN
    RAISE EXCEPTION 'INPUT_INVALID';
  END IF;
  IF (p_action = 'money_refund' AND p_net_cents <= billing.two_person_threshold_cents())
     OR (p_action <> 'money_refund' AND p_amount_ucr <= billing.two_person_threshold_ucr()) THEN
    RAISE EXCEPTION 'APPROVAL_NOT_REQUIRED';
  END IF;
  v_hash := billing._fingerprint(jsonb_build_object('action', p_action, 'payload', p_payload));
  PERFORM pg_advisory_xact_lock(hashtextextended('billing-approval:' || p_org_id::text || ':' || v_hash, 0));
  SELECT * INTO r FROM billing.approval_request WHERE org_id = p_org_id AND payload_sha256 = v_hash AND status IN ('pending','approved');
  IF FOUND AND (r.status = 'approved' OR r.expires_at > now()) THEN RETURN r; END IF;
  IF FOUND THEN
    -- The open request expired: close it so a new one can open.
    UPDATE billing.approval_request SET status = 'cancelled', decided_by = requested_by, decided_at = now(),
      decision_reason = 'Expired without a second approval' WHERE id = r.id;
  END IF;
  INSERT INTO billing.approval_request (org_id, action, amount_ucr, net_cents, payload, payload_sha256, reason, requested_by, expires_at, request_id)
  VALUES (p_org_id, p_action, p_amount_ucr, p_net_cents, p_payload, v_hash, v_reason, actor, now() + interval '24 hours', p_request_id)
  RETURNING * INTO r;
  INSERT INTO evals.audit_event (org_id, actor_id, action, subject_id, details)
  VALUES (p_org_id, actor, 'billing.approval_requested', r.id::text, jsonb_build_object('action', r.action, 'amount_ucr', r.amount_ucr,
    'net_cents', r.net_cents, 'payload_sha256', r.payload_sha256, 'reason', r.reason, 'expires_at', r.expires_at, 'request_id', p_request_id,
    'before', NULL, 'after', billing._approval_view(r)));
  RETURN r;
END $$;

-- The second admin approves the payload they reviewed. The action then runs
-- in this transaction as the approver; billing.complete_approval closes it.
-- An approved request whose execution has not finished (a money refund
-- waiting for Stripe) can be retried by the same approver.
CREATE FUNCTION billing.approve_request(p_org_id uuid, p_id uuid, p_payload_sha256 text)
RETURNS billing.approval_request
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE actor text := billing._ops_admin(p_org_id); r billing.approval_request;
BEGIN
  SELECT * INTO r FROM billing.approval_request WHERE org_id = p_org_id AND id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'APPROVAL_NOT_FOUND'; END IF;
  IF r.requested_by = actor THEN RAISE EXCEPTION 'APPROVER_MUST_DIFFER'; END IF;
  IF p_payload_sha256 IS DISTINCT FROM r.payload_sha256 THEN RAISE EXCEPTION 'APPROVAL_PAYLOAD_MISMATCH'; END IF;
  IF r.status = 'approved' AND r.approved_by = actor THEN
    PERFORM set_config('billing.approval_id', r.id::text, true);
    RETURN r;
  END IF;
  IF r.status <> 'pending' THEN RAISE EXCEPTION 'APPROVAL_NOT_PENDING'; END IF;
  IF r.expires_at <= now() THEN RAISE EXCEPTION 'APPROVAL_EXPIRED'; END IF;
  UPDATE billing.approval_request SET status = 'approved', approved_by = actor, approved_at = now() WHERE id = r.id RETURNING * INTO r;
  PERFORM set_config('billing.approval_id', r.id::text, true);
  INSERT INTO evals.audit_event (org_id, actor_id, action, subject_id, details)
  VALUES (p_org_id, actor, 'billing.approval_approved', r.id::text, jsonb_build_object('action', r.action, 'amount_ucr', r.amount_ucr,
    'net_cents', r.net_cents, 'payload_sha256', r.payload_sha256, 'requested_by', r.requested_by,
    'before', jsonb_build_object('status', 'pending'), 'after', billing._approval_view(r)));
  RETURN r;
END $$;

-- Records what the approved action produced (entry ids, order status).
CREATE FUNCTION billing.complete_approval(p_org_id uuid, p_id uuid, p_result jsonb)
RETURNS billing.approval_request
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE actor text := billing._ops_admin(p_org_id); r billing.approval_request;
BEGIN
  SELECT * INTO r FROM billing.approval_request WHERE org_id = p_org_id AND id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'APPROVAL_NOT_FOUND'; END IF;
  IF r.status = 'executed' THEN RETURN r; END IF;
  IF r.status <> 'approved' OR r.approved_by <> actor THEN RAISE EXCEPTION 'APPROVAL_NOT_PENDING'; END IF;
  UPDATE billing.approval_request SET status = 'executed', executed_at = now(), result = coalesce(p_result, '{}'::jsonb)
  WHERE id = r.id RETURNING * INTO r;
  PERFORM set_config('billing.approval_id', '', true);
  INSERT INTO evals.audit_event (org_id, actor_id, action, subject_id, details)
  VALUES (p_org_id, actor, 'billing.approval_executed', r.id::text, jsonb_build_object('action', r.action, 'result', r.result,
    'requested_by', r.requested_by, 'before', jsonb_build_object('status', 'approved'), 'after', billing._approval_view(r)));
  RETURN r;
END $$;

-- Closes a pending request: the requester cancels it, another admin rejects it.
CREATE FUNCTION billing.close_approval(p_org_id uuid, p_id uuid, p_reason text)
RETURNS billing.approval_request
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE actor text := billing._ops_admin(p_org_id); r billing.approval_request; v_reason text;
BEGIN
  v_reason := billing._reason(p_reason, true);
  SELECT * INTO r FROM billing.approval_request WHERE org_id = p_org_id AND id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'APPROVAL_NOT_FOUND'; END IF;
  IF r.status IN ('rejected','cancelled') THEN RETURN r; END IF;
  IF r.status <> 'pending' THEN RAISE EXCEPTION 'APPROVAL_NOT_PENDING'; END IF;
  UPDATE billing.approval_request SET status = CASE WHEN actor = r.requested_by THEN 'cancelled' ELSE 'rejected' END,
    decided_by = actor, decided_at = now(), decision_reason = v_reason
  WHERE id = r.id RETURNING * INTO r;
  INSERT INTO evals.audit_event (org_id, actor_id, action, subject_id, details)
  VALUES (p_org_id, actor, 'billing.approval_' || r.status, r.id::text, jsonb_build_object('action', r.action, 'reason', v_reason,
    'requested_by', r.requested_by, 'before', jsonb_build_object('status', 'pending'), 'after', billing._approval_view(r)));
  RETURN r;
END $$;

-- Requests across workspaces for the console; pending past their expiry read 'expired'.
CREATE FUNCTION billing.list_approvals(p_status text DEFAULT NULL, p_limit integer DEFAULT 100)
RETURNS TABLE (id uuid, org_id uuid, workspace text, action text, amount_ucr bigint, net_cents bigint, payload jsonb, payload_sha256 text,
  reason text, requested_by text, requested_at timestamptz, expires_at timestamptz, status text, approved_by text, approved_at timestamptz,
  decided_by text, decided_at timestamptz, decision_reason text, executed_at timestamptz, result jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
#variable_conflict use_column
BEGIN
  IF billing.actor_kind(billing._actor()) <> 'user' OR NOT evals.is_admin() THEN RAISE EXCEPTION 'SCOPE_DENIED' USING ERRCODE = '42501'; END IF;
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 500
     OR (p_status IS NOT NULL AND p_status NOT IN ('open','pending','approved','executed','rejected','cancelled','expired')) THEN
    RAISE EXCEPTION 'INPUT_INVALID';
  END IF;
  RETURN QUERY
  SELECT a.id, a.org_id, w.name, a.action, a.amount_ucr, a.net_cents, a.payload, a.payload_sha256, a.reason, a.requested_by, a.requested_at,
    a.expires_at, s.status, a.approved_by, a.approved_at, a.decided_by, a.decided_at, a.decision_reason, a.executed_at, a.result
  FROM billing.approval_request a
  JOIN evals.workspace w ON w.id = a.org_id
  CROSS JOIN LATERAL (SELECT CASE WHEN a.status = 'pending' AND a.expires_at <= now() THEN 'expired' ELSE a.status END AS status) s
  WHERE p_status IS NULL OR s.status = p_status OR (p_status = 'open' AND s.status IN ('pending','approved'))
  ORDER BY a.requested_at DESC, a.id DESC LIMIT p_limit;
END $$;

-- Backstop: a credit entry above the threshold written by a person needs an
-- approval this person approved for this workspace in this transaction.
CREATE FUNCTION billing.require_second_approver() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_id text := nullif(current_setting('billing.approval_id', true), '');
BEGIN
  IF v_id IS NULL OR v_id !~ '^[0-9a-f-]{36}$' OR NOT EXISTS (
      SELECT 1 FROM billing.approval_request a WHERE a.id = v_id::uuid AND a.org_id = NEW.org_id AND a.status = 'approved'
        AND a.approved_by = NEW.actor_id AND a.amount_ucr >= abs(NEW.amount_ucr)) THEN
    RAISE EXCEPTION 'SECOND_APPROVER_REQUIRED' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER ledger_entry_two_person BEFORE INSERT ON billing.ledger_entry
  FOR EACH ROW WHEN (NEW.actor_kind = 'user' AND NEW.entry_type IN ('grant','bonus','allowance','adjustment','reversal','refund')
    AND abs(NEW.amount_ucr) > 10000000000)
  EXECUTE FUNCTION billing.require_second_approver();

/* ---------------------------------------------------- account controls --- */

-- Freezes (no new holds or purchases; work in flight finishes) or unfreezes
-- an account. Unfreezing is refused while a payment dispute is open.
CREATE FUNCTION billing.set_account_freeze(p_org_id uuid, p_frozen boolean, p_reason text, p_request_id text DEFAULT NULL)
RETURNS billing.credit_account
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE actor text := billing._ops_admin(p_org_id); a billing.credit_account; r billing.credit_account; v_reason text;
BEGIN
  v_reason := billing._reason(p_reason, true);
  IF p_frozen IS NULL OR (p_request_id IS NOT NULL AND length(p_request_id) > 200) THEN RAISE EXCEPTION 'INPUT_INVALID'; END IF;
  a := billing._lock_account(p_org_id);
  IF p_frozen = (a.frozen_reason IS NOT NULL) THEN RETURN a; END IF;
  IF NOT p_frozen AND EXISTS (SELECT 1 FROM billing.top_up_order WHERE org_id = p_org_id AND status = 'disputed') THEN
    RAISE EXCEPTION 'DISPUTE_OPEN';
  END IF;
  UPDATE billing.credit_account SET frozen_reason = CASE WHEN p_frozen THEN left('ops: ' || v_reason, 500) END,
    version = version + 1, updated_at = now()
  WHERE org_id = p_org_id RETURNING * INTO r;
  INSERT INTO evals.audit_event (org_id, actor_id, action, subject_id, details)
  VALUES (p_org_id, actor, CASE WHEN p_frozen THEN 'billing.account_frozen' ELSE 'billing.account_unfrozen' END, p_org_id::text,
    jsonb_build_object('reason', v_reason, 'request_id', p_request_id, 'before', jsonb_build_object('frozen_reason', a.frozen_reason),
      'after', jsonb_build_object('frozen_reason', r.frozen_reason)));
  RETURN r;
END $$;

-- Moves a lot's expiry later. Only unexpired lots with credits left; never
-- earlier, never a lot that does not expire, at most 36 months ahead.
CREATE FUNCTION billing.extend_lot_expiry(p_org_id uuid, p_lot_id uuid, p_expires_at timestamptz, p_reason text,
  p_request_id text DEFAULT NULL)
RETURNS billing.credit_lot
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE actor text := billing._ops_admin(p_org_id); l billing.credit_lot; r billing.credit_lot; v_reason text;
BEGIN
  v_reason := billing._reason(p_reason, true);
  IF p_lot_id IS NULL OR p_expires_at IS NULL OR p_expires_at > now() + interval '36 months'
     OR (p_request_id IS NOT NULL AND length(p_request_id) > 200) THEN
    RAISE EXCEPTION 'INPUT_INVALID';
  END IF;
  PERFORM billing._lock_account(p_org_id);
  SELECT * INTO l FROM billing.credit_lot WHERE org_id = p_org_id AND id = p_lot_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'LOT_NOT_FOUND'; END IF;
  IF l.expires_at = p_expires_at THEN RETURN l; END IF;
  IF l.expires_at IS NULL OR l.expires_at <= now() OR l.remaining_ucr = 0 THEN RAISE EXCEPTION 'LOT_NOT_EXTENDABLE'; END IF;
  IF p_expires_at <= l.expires_at THEN RAISE EXCEPTION 'INPUT_INVALID'; END IF;
  UPDATE billing.credit_lot SET expires_at = p_expires_at WHERE id = l.id RETURNING * INTO r;
  INSERT INTO evals.audit_event (org_id, actor_id, action, subject_id, details)
  VALUES (p_org_id, actor, 'billing.lot_expiry_extended', l.id::text, jsonb_build_object('reason', v_reason, 'request_id', p_request_id,
    'source', l.source, 'remaining_ucr', l.remaining_ucr, 'before', jsonb_build_object('expires_at', l.expires_at),
    'after', jsonb_build_object('expires_at', r.expires_at)));
  RETURN r;
END $$;

/* ------------------------------------------------------- price notices --- */

-- Whether a revision may take effect: it raises no rate, or its notice went
-- out at least 30 days before its effective date (§6.4).
CREATE FUNCTION billing.price_notice_ok(p_raises boolean, p_notice_sent_at timestamptz, p_effective_at timestamptz) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$
  SELECT NOT coalesce(p_raises, false) OR (p_notice_sent_at IS NOT NULL AND p_effective_at IS NOT NULL
    AND p_notice_sent_at <= p_effective_at - interval '30 days')
$$;

CREATE OR REPLACE FUNCTION billing.price_book_at(p_at timestamptz DEFAULT now()) RETURNS billing.price_book_revision
LANGUAGE sql STABLE SET search_path = pg_catalog AS $$
  SELECT * FROM billing.price_book_revision
  WHERE status IN ('scheduled','active','retired') AND effective_at <= coalesce(p_at, now())
    AND (NOT coalesce(raises_prices, false) OR (notice_sent_at IS NOT NULL AND notice_sent_at <= effective_at - interval '30 days'))
  ORDER BY effective_at DESC LIMIT 1
$$;

CREATE OR REPLACE FUNCTION billing._activate_due() RETURNS SETOF billing.price_book_revision
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE r billing.price_book_revision; old billing.price_book_revision;
BEGIN
  FOR r IN SELECT * FROM billing.price_book_revision WHERE status = 'scheduled' AND effective_at <= now()
      AND billing.price_notice_ok(raises_prices, notice_sent_at, effective_at)
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
    -- A notice is recorded once, never withdrawn, and only while it can still count.
    IF NEW.notice_sent_at IS DISTINCT FROM OLD.notice_sent_at AND (OLD.notice_sent_at IS NOT NULL OR NEW.notice_sent_at IS NULL) THEN
      RAISE EXCEPTION 'PRICE_BOOK_IMMUTABLE' USING ERRCODE = '55000';
    END IF;
    RETURN NEW;
  ELSIF OLD.status = 'scheduled' AND NEW.status = 'draft' THEN
    -- A revision held back for a missing notice never took effect: it may go back to draft.
    IF OLD.effective_at <= now() AND billing.price_notice_ok(OLD.raises_prices, OLD.notice_sent_at, OLD.effective_at) THEN
      RAISE EXCEPTION 'PRICE_BOOK_IN_EFFECT' USING ERRCODE = '55000';
    END IF;
    RETURN NEW;
  ELSIF OLD.status = 'scheduled' AND NEW.status = 'active' THEN
    IF NEW.effective_at > now() OR NEW.effective_at > OLD.effective_at OR NEW.raises_prices IS DISTINCT FROM OLD.raises_prices
       OR NEW.activated_at IS NULL OR NOT billing.price_notice_ok(OLD.raises_prices, OLD.notice_sent_at, OLD.effective_at) THEN
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
  IF r.effective_at <= now() AND billing.price_notice_ok(r.raises_prices, r.notice_sent_at, r.effective_at) THEN
    RAISE EXCEPTION 'PRICE_BOOK_IN_EFFECT';
  END IF;
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
    IF EXISTS (SELECT 1 FROM billing.price_book_revision WHERE status = 'scheduled' AND id <> r.id AND effective_at < r.effective_at
        AND billing.price_notice_ok(raises_prices, notice_sent_at, effective_at)) THEN
      RAISE EXCEPTION 'SCHEDULE_CONFLICT';
    END IF;
    UPDATE billing.price_book_revision SET status = 'retired', retired_at = now() WHERE status = 'active';
    UPDATE billing.price_book_revision SET status = 'active', effective_at = now(), activated_at = now()
    WHERE id = r.id RETURNING * INTO r;
    PERFORM billing._price_audit('billing.price_book.activated', r, jsonb_build_object('brought_forward', true));
    RETURN r;
  END IF;
  IF NOT billing.price_notice_ok(r.raises_prices, r.notice_sent_at, r.effective_at) THEN RAISE EXCEPTION 'NOTICE_NOT_SENT'; END IF;
  PERFORM billing._activate_due();
  SELECT * INTO r FROM billing.price_book_revision WHERE id = r.id;
  RETURN r;
END $$;

-- The revision a scheduled one follows: the one that would be in effect just before it.
CREATE FUNCTION billing._price_book_before(r billing.price_book_revision) RETURNS billing.price_book_revision
LANGUAGE sql STABLE SET search_path = pg_catalog AS $$
  SELECT * FROM billing.price_book_revision p
  WHERE p.id <> r.id AND p.status IN ('scheduled','active','retired') AND p.effective_at < r.effective_at
    AND billing.price_notice_ok(p.raises_prices, p.notice_sent_at, p.effective_at)
  ORDER BY p.effective_at DESC LIMIT 1
$$;

-- What rises in a revision against the one it follows: models (by provider,
-- model and prompt tier) and meters.
CREATE FUNCTION billing.price_increases(p_revision_id uuid)
RETURNS TABLE (kind text, provider text, model_id text, label text, before_ucr jsonb, after_ucr jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE r billing.price_book_revision; prev billing.price_book_revision;
BEGIN
  PERFORM billing._privileged();
  SELECT * INTO r FROM billing.price_book_revision WHERE id = p_revision_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'PRICE_BOOK_NOT_FOUND'; END IF;
  prev := CASE WHEN r.effective_at IS NULL THEN billing.price_book_at(now()) ELSE billing._price_book_before(r) END;
  IF prev.id IS NULL THEN RETURN; END IF;
  RETURN QUERY
  SELECT 'model'::text, n.provider, n.model_id, n.label,
    jsonb_build_object('input', o.input_ucr_per_m, 'output', o.output_ucr_per_m, 'cached', o.cached_ucr_per_m),
    jsonb_build_object('input', n.input_ucr_per_m, 'output', n.output_ucr_per_m, 'cached', n.cached_ucr_per_m)
  FROM billing.model_rate n JOIN billing.model_rate o
    ON o.revision_id = prev.id AND o.provider = n.provider AND o.model_id IS NOT DISTINCT FROM n.model_id AND o.min_input_tokens = n.min_input_tokens
  WHERE n.revision_id = r.id AND (n.input_ucr_per_m > o.input_ucr_per_m OR n.output_ucr_per_m > o.output_ucr_per_m
    OR coalesce(n.cached_ucr_per_m, n.input_ucr_per_m) > coalesce(o.cached_ucr_per_m, o.input_ucr_per_m))
  UNION ALL
  SELECT 'meter'::text, NULL::text, n.meter, n.label, jsonb_build_object('unit', o.ucr_per_unit), jsonb_build_object('unit', n.ucr_per_unit)
  FROM billing.action_rate n JOIN billing.action_rate o ON o.revision_id = prev.id AND o.meter = n.meter
  WHERE n.revision_id = r.id AND n.ucr_per_unit > o.ucr_per_unit;
END $$;

-- Who must hear about an increase: credit workspaces (not contract, not
-- deleted) that used a raised model in the last 90 days (completed engine
-- calls), or ran anything when a meter rises, with their owners' addresses.
CREATE FUNCTION billing.price_notice_recipients(p_revision_id uuid)
RETURNS TABLE (org_id uuid, workspace text, billing_mode text, owner_emails text[], models text[])
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
#variable_conflict use_column
BEGIN
  PERFORM billing._privileged();
  RETURN QUERY
  WITH rises AS (
    SELECT i.kind, i.provider, i.model_id, i.label FROM billing.price_increases(p_revision_id) i
  ), used AS (
    SELECT DISTINCT a.org_id, x.label
    FROM evals.execution_attempt a
    CROSS JOIN LATERAL billing.provider_revision_rate_key(a.provider_revision_id) k
    JOIN rises x ON x.kind = 'model' AND x.provider = k.provider AND (x.model_id IS NULL OR x.model_id = k.model_key)
    WHERE a.created_at > now() - interval '90 days' AND a.status = 'completed'
    UNION
    SELECT DISTINCT r.org_id, 'Platform meters'::text FROM evals.run r
    WHERE EXISTS (SELECT 1 FROM rises WHERE rises.kind = 'meter') AND r.created_at > now() - interval '90 days'
  )
  SELECT w.id, w.name, c.billing_mode,
    coalesce((SELECT array_agg(DISTINCT lower(u.email) ORDER BY lower(u.email)) FROM evals.membership m JOIN public.auth_user u ON u.id = m.user_id
      WHERE m.org_id = w.id AND m.role = 'owner' AND u.email IS NOT NULL), ARRAY[]::text[]),
    array_agg(DISTINCT used.label ORDER BY used.label)
  FROM used JOIN evals.workspace w ON w.id = used.org_id AND w.deleted_at IS NULL
  JOIN billing.credit_account c ON c.org_id = w.id AND c.billing_mode <> 'contract'
  GROUP BY w.id, w.name, c.billing_mode
  ORDER BY w.name, w.id
  LIMIT 5000;
END $$;

-- Records that the increase notice went out (in-app and email). Scheduled
-- raising revisions only, once, and no later than 30 days before the date.
CREATE FUNCTION billing.record_price_notice(p_revision_id uuid, p_details jsonb DEFAULT '{}'::jsonb)
RETURNS billing.price_book_revision
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE r billing.price_book_revision; rec record; n integer := 0;
BEGIN
  PERFORM billing._privileged();
  PERFORM pg_advisory_xact_lock(hashtext('billing.price_book'));
  SELECT * INTO r FROM billing.price_book_revision WHERE id = p_revision_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PRICE_BOOK_NOT_FOUND'; END IF;
  IF r.status <> 'scheduled' THEN RAISE EXCEPTION 'PRICE_BOOK_TRANSITION'; END IF;
  IF NOT coalesce(r.raises_prices, false) THEN RAISE EXCEPTION 'NOTICE_NOT_REQUIRED'; END IF;
  IF r.notice_sent_at IS NOT NULL THEN RETURN r; END IF;
  IF now() > r.effective_at - interval '30 days' THEN RAISE EXCEPTION 'NOTICE_TOO_LATE'; END IF;
  UPDATE billing.price_book_revision SET notice_sent_at = now() WHERE id = r.id RETURNING * INTO r;
  -- The in-app notice, once per recipient workspace (deterministic event id).
  FOR rec IN SELECT * FROM billing.price_notice_recipients(r.id) LOOP
    PERFORM evals.record_notice(rec.org_id, 'price_increase:' || r.id, 'price_increase', jsonb_build_object('revision', r.revision,
      'effectiveAt', r.effective_at, 'models', to_jsonb(rec.models),
      'subjectTitle', array_to_string(rec.models, ', ') || ' · ' || to_char(r.effective_at AT TIME ZONE 'UTC', 'YYYY-MM-DD')));
    n := n + 1;
  END LOOP;
  PERFORM billing._price_audit('billing.price_book.notice_sent', r, jsonb_build_object('workspaces', n, 'notice', coalesce(p_details, '{}'::jsonb)));
  RETURN r;
END $$;

/* ----------------------------------------------------- reconciliation --- */

CREATE TABLE billing.reconciliation_report (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  day date NOT NULL,
  livemode boolean NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  actor_id text NOT NULL CHECK (length(actor_id) BETWEEN 1 AND 255),
  -- Unexplained differences (must be 0) and explained notes.
  discrepancies integer NOT NULL CHECK (discrepancies >= 0),
  explained integer NOT NULL CHECK (explained >= 0),
  stripe_checked boolean NOT NULL,
  report jsonb NOT NULL CHECK (jsonb_typeof(report) = 'object' AND octet_length(report::text) <= 262144)
);
CREATE INDEX reconciliation_report_day ON billing.reconciliation_report (day DESC, generated_at DESC);
CREATE INDEX reconciliation_report_recent ON billing.reconciliation_report (generated_at DESC);
CREATE TRIGGER reconciliation_report_append_only BEFORE UPDATE OR DELETE ON billing.reconciliation_report
  FOR EACH ROW EXECUTE FUNCTION billing.reject_ledger_mutation();
CREATE TRIGGER reconciliation_report_no_truncate BEFORE TRUNCATE ON billing.reconciliation_report
  FOR EACH STATEMENT EXECUTE FUNCTION billing.reject_ledger_mutation();
-- Platform-level: reached only through functions.
ALTER TABLE billing.reconciliation_report ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing.reconciliation_report FORCE ROW LEVEL SECURITY;
REVOKE ALL ON billing.reconciliation_report FROM PUBLIC;

-- The database side of the daily reconciliation for one UTC day and one
-- Stripe mode. Each check lists up to 20 ids; counts are exact. Orders with
-- money movements on the day are returned for the Stripe match.
CREATE FUNCTION billing.reconciliation_checks(p_day date, p_livemode boolean) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE lo timestamptz; hi timestamptz; checks jsonb := '{}'::jsonb; notes jsonb := '{}'::jsonb; orders jsonb; accounts jsonb; shadow jsonb;
  ids text[]; n integer;
BEGIN
  PERFORM billing._privileged();
  IF p_day IS NULL OR p_livemode IS NULL THEN RAISE EXCEPTION 'INPUT_INVALID'; END IF;
  lo := p_day::timestamp AT TIME ZONE 'UTC';
  hi := lo + interval '1 day';

  -- Orders ↔ ledger purchases (every paid order of this mode, whenever paid).
  SELECT count(*), (array_agg(o.id::text ORDER BY o.paid_at))[1:20] INTO n, ids
  FROM billing.top_up_order o LEFT JOIN billing.ledger_entry e ON e.org_id = o.org_id AND e.id = o.purchase_entry_id
  WHERE o.livemode = p_livemode AND o.paid_at < hi AND o.status IN ('paid','refund_pending','refunded','disputed','charged_back')
    AND (e.id IS NULL OR e.entry_type <> 'purchase' OR e.amount_ucr <> o.base_ucr OR e.ref_id IS DISTINCT FROM o.id::text);
  checks := checks || jsonb_build_object('paid_order_purchase_mismatch', jsonb_build_object('count', n, 'ids', coalesce(to_jsonb(ids), '[]')));

  SELECT count(*), (array_agg(o.id::text ORDER BY o.paid_at))[1:20] INTO n, ids
  FROM billing.top_up_order o LEFT JOIN billing.ledger_entry e ON e.org_id = o.org_id AND e.id = o.bonus_entry_id
  WHERE o.livemode = p_livemode AND o.paid_at < hi AND o.purchase_entry_id IS NOT NULL
    AND ((coalesce(o.bonus_ucr, 0) > 0) <> (e.id IS NOT NULL) OR (e.id IS NOT NULL AND (e.entry_type <> 'bonus' OR e.amount_ucr <> o.bonus_ucr)));
  checks := checks || jsonb_build_object('paid_order_bonus_mismatch', jsonb_build_object('count', n, 'ids', coalesce(to_jsonb(ids), '[]')));

  SELECT count(*), (array_agg(e.id::text ORDER BY e.created_at))[1:20] INTO n, ids
  FROM billing.ledger_entry e
  LEFT JOIN billing.top_up_order o ON o.org_id = e.org_id AND o.purchase_entry_id = e.id
  LEFT JOIN billing.top_up_order r ON r.org_id = e.org_id AND r.id::text = e.ref_id
  WHERE e.entry_type = 'purchase' AND e.created_at < hi AND coalesce(o.livemode, r.livemode, p_livemode) = p_livemode
    AND (o.id IS NULL OR o.status NOT IN ('paid','refund_pending','refunded','disputed','charged_back'));
  checks := checks || jsonb_build_object('purchase_without_paid_order', jsonb_build_object('count', n, 'ids', coalesce(to_jsonb(ids), '[]')));

  -- Refunds: a refunded order removed its credits (refund entries, or the
  -- adjustment that mirrors a refund made in Stripe); refund entries belong
  -- to refunded orders; Stripe confirms within the hour.
  SELECT count(*), (array_agg(o.id::text ORDER BY o.refunded_at))[1:20] INTO n, ids
  FROM billing.top_up_order o
  WHERE o.livemode = p_livemode AND o.status = 'refunded' AND o.refunded_at < hi
    AND NOT EXISTS (SELECT 1 FROM billing.ledger_entry e WHERE e.org_id = o.org_id AND e.entry_type = 'refund' AND e.reverses_entry_id = o.purchase_entry_id)
    AND NOT EXISTS (SELECT 1 FROM billing.ledger_entry e WHERE e.org_id = o.org_id AND e.idempotency_key = 'external-refund:' || o.id)
    AND NOT ('refund_shortfall' = ANY(o.risk_flags));
  checks := checks || jsonb_build_object('refunded_order_without_refund_entries', jsonb_build_object('count', n, 'ids', coalesce(to_jsonb(ids), '[]')));

  SELECT count(*), (array_agg(e.id::text ORDER BY e.created_at))[1:20] INTO n, ids
  FROM billing.ledger_entry e JOIN billing.top_up_order o ON o.org_id = e.org_id AND o.id::text = e.ref_id
  WHERE e.entry_type = 'refund' AND e.ref_kind = 'top_up_order' AND e.created_at < hi AND o.livemode = p_livemode
    AND o.status NOT IN ('refund_pending','refunded');
  checks := checks || jsonb_build_object('refund_entry_without_refunded_order', jsonb_build_object('count', n, 'ids', coalesce(to_jsonb(ids), '[]')));

  SELECT count(*), (array_agg(o.id::text ORDER BY o.updated_at))[1:20] INTO n, ids
  FROM billing.top_up_order o WHERE o.livemode = p_livemode AND o.status = 'refund_pending' AND o.updated_at < least(hi, now()) - interval '1 hour';
  checks := checks || jsonb_build_object('refund_pending_unconfirmed', jsonb_build_object('count', n, 'ids', coalesce(to_jsonb(ids), '[]')));

  SELECT count(*), (array_agg(o.id::text ORDER BY o.updated_at))[1:20] INTO n, ids
  FROM billing.top_up_order o
  WHERE o.livemode = p_livemode AND o.status = 'charged_back' AND o.updated_at < hi
    AND NOT EXISTS (SELECT 1 FROM billing.ledger_entry e WHERE e.org_id = o.org_id AND e.idempotency_key = 'chargeback:' || o.id)
    AND NOT ('chargeback_shortfall' = ANY(o.risk_flags));
  checks := checks || jsonb_build_object('chargeback_without_entry', jsonb_build_object('count', n, 'ids', coalesce(to_jsonb(ids), '[]')));

  -- Invoices issued against orders paid: one invoice per paid order and one
  -- rectifying invoice per refunded order, with the order's amounts.
  SELECT count(*), (array_agg(o.id::text ORDER BY o.paid_at))[1:20] INTO n, ids
  FROM billing.top_up_order o LEFT JOIN billing.invoice i ON i.org_id = o.org_id AND i.order_id = o.id
  WHERE o.livemode = p_livemode AND o.purchase_entry_id IS NOT NULL AND o.paid_at < hi
    AND (i.id IS NULL OR o.invoice_id IS DISTINCT FROM i.id OR i.gross_cents <> o.gross_cents OR i.net_cents <> o.net_cents
      OR i.vat_cents <> o.vat_cents OR i.livemode <> o.livemode);
  checks := checks || jsonb_build_object('paid_order_invoice_mismatch', jsonb_build_object('count', n, 'ids', coalesce(to_jsonb(ids), '[]')));

  SELECT count(*), (array_agg(o.id::text ORDER BY o.refunded_at))[1:20] INTO n, ids
  FROM billing.top_up_order o LEFT JOIN billing.credit_note c ON c.org_id = o.org_id AND c.order_id = o.id
  WHERE o.livemode = p_livemode AND o.status = 'refunded' AND o.refunded_at < hi
    AND (c.id IS NULL OR c.gross_cents <> -o.gross_cents OR c.net_cents <> -o.net_cents OR c.vat_cents <> -o.vat_cents);
  checks := checks || jsonb_build_object('refunded_order_credit_note_mismatch', jsonb_build_object('count', n, 'ids', coalesce(to_jsonb(ids), '[]')));

  SELECT count(*), (array_agg(d.id::text ORDER BY d.created_at))[1:20] INTO n, ids
  FROM (SELECT i.id, i.org_id, i.order_id, i.created_at, 'invoice' AS k FROM billing.invoice i WHERE i.livemode = p_livemode AND i.created_at < hi
        UNION ALL SELECT c.id, c.org_id, c.order_id, c.created_at, 'credit_note' FROM billing.credit_note c WHERE c.livemode = p_livemode AND c.created_at < hi) d
  LEFT JOIN billing.top_up_order o ON o.org_id = d.org_id AND o.id = d.order_id
  WHERE o.id IS NULL OR o.purchase_entry_id IS NULL OR (d.k = 'credit_note' AND o.status NOT IN ('refunded'));
  checks := checks || jsonb_build_object('document_without_order', jsonb_build_object('count', n, 'ids', coalesce(to_jsonb(ids), '[]')));

  -- Holds: the hourly expiry releases a hold within an hour of its 24-hour expiry.
  SELECT count(*), (array_agg(h.id::text ORDER BY h.created_at))[1:20] INTO n, ids
  FROM billing.credit_hold h WHERE h.state = 'held' AND h.created_at < now() - interval '25 hours';
  checks := checks || jsonb_build_object('holds_open_over_25h', jsonb_build_object('count', n, 'ids', coalesce(to_jsonb(ids), '[]')));

  -- Account invariants (§6.9).
  SELECT count(*), (array_agg(v.org_id::text ORDER BY v.org_id))[1:20],
    coalesce(jsonb_agg(jsonb_build_object('org_id', v.org_id, 'issues', to_jsonb(v.issues)) ORDER BY v.org_id), '[]'::jsonb)
  INTO n, ids, accounts
  FROM billing.verify_account(NULL) v WHERE cardinality(v.issues) > 0;
  checks := checks || jsonb_build_object('inconsistent_accounts', jsonb_build_object('count', n, 'ids', coalesce(to_jsonb(ids), '[]'), 'details', accounts));

  -- Shadow drift for the day (L-11).
  shadow := billing.shadow_diff(p_day, NULL);
  checks := checks || jsonb_build_object('shadow_drift', jsonb_build_object('count', coalesce((shadow->>'mismatches')::int, 0), 'ids', '[]'::jsonb,
    'details', shadow->'checks'));

  -- Explained: test-mode documents voided by ops, orders flagged for manual review.
  SELECT count(*) INTO n FROM billing.invoice_document d WHERE d.livemode = p_livemode AND d.status = 'voided';
  notes := notes || jsonb_build_object('voided_test_documents', n);
  SELECT count(*) INTO n FROM billing.top_up_order o WHERE o.livemode = p_livemode AND o.paid_at < hi
    AND o.risk_flags && ARRAY['partial_refund_review','refund_shortfall','chargeback_shortfall','external_refund'];
  notes := notes || jsonb_build_object('orders_flagged_for_review', n);

  SELECT coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'org_id', o.org_id, 'status', o.status, 'paid_at', o.paid_at,
      'refunded_at', o.refunded_at, 'gross_cents', o.gross_cents, 'net_cents', o.net_cents, 'charge', o.stripe_charge_id,
      'refund', o.stripe_refund_id, 'payment_intent', o.stripe_payment_intent_id) ORDER BY o.paid_at), '[]'::jsonb)
  INTO orders
  FROM billing.top_up_order o
  WHERE o.livemode = p_livemode AND ((o.paid_at >= lo AND o.paid_at < hi) OR (o.refunded_at >= lo AND o.refunded_at < hi));

  RETURN jsonb_build_object('day', p_day, 'livemode', p_livemode, 'from', lo, 'to', hi, 'checked_at', now(),
    'checks', checks, 'notes', notes, 'orders', orders,
    'totals', (SELECT jsonb_build_object(
      'orders_paid', count(*) FILTER (WHERE o.paid_at >= lo AND o.paid_at < hi),
      'gross_paid_cents', coalesce(sum(o.gross_cents) FILTER (WHERE o.paid_at >= lo AND o.paid_at < hi), 0),
      'orders_refunded', count(*) FILTER (WHERE o.refunded_at >= lo AND o.refunded_at < hi),
      'gross_refunded_cents', coalesce(sum(o.gross_cents) FILTER (WHERE o.refunded_at >= lo AND o.refunded_at < hi), 0),
      'credits_purchased_ucr', coalesce((SELECT sum(e.amount_ucr) FROM billing.ledger_entry e JOIN billing.top_up_order x
        ON x.org_id = e.org_id AND x.purchase_entry_id = e.id WHERE x.livemode = p_livemode AND e.created_at >= lo AND e.created_at < hi), 0))
      FROM billing.top_up_order o WHERE o.livemode = p_livemode));
END $$;

CREATE FUNCTION billing.record_reconciliation(p_day date, p_livemode boolean, p_discrepancies integer, p_explained integer,
  p_stripe_checked boolean, p_report jsonb)
RETURNS billing.reconciliation_report
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE r billing.reconciliation_report;
BEGIN
  PERFORM billing._privileged();
  IF p_day IS NULL OR p_livemode IS NULL OR p_discrepancies IS NULL OR p_discrepancies < 0 OR p_explained IS NULL OR p_explained < 0
     OR p_stripe_checked IS NULL OR p_report IS NULL OR jsonb_typeof(p_report) <> 'object' OR p_day > (now() AT TIME ZONE 'UTC')::date THEN
    RAISE EXCEPTION 'INPUT_INVALID';
  END IF;
  INSERT INTO billing.reconciliation_report (day, livemode, actor_id, discrepancies, explained, stripe_checked, report)
  VALUES (p_day, p_livemode, billing._actor(), p_discrepancies, p_explained, p_stripe_checked, p_report)
  RETURNING * INTO r;
  RETURN r;
END $$;

-- Stored reports, newest first, with the full report for one day (the latest run of it) when asked.
CREATE FUNCTION billing.reconciliation_reports(p_livemode boolean, p_day date DEFAULT NULL, p_limit integer DEFAULT 60)
RETURNS TABLE (id uuid, day date, livemode boolean, generated_at timestamptz, actor_id text, discrepancies integer, explained integer,
  stripe_checked boolean, report jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
#variable_conflict use_column
BEGIN
  PERFORM billing._privileged();
  IF p_livemode IS NULL OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 400 THEN RAISE EXCEPTION 'INPUT_INVALID'; END IF;
  IF p_day IS NOT NULL THEN
    RETURN QUERY SELECT r.id, r.day, r.livemode, r.generated_at, r.actor_id, r.discrepancies, r.explained, r.stripe_checked, r.report
      FROM billing.reconciliation_report r WHERE r.livemode = p_livemode AND r.day = p_day ORDER BY r.generated_at DESC LIMIT 1;
    RETURN;
  END IF;
  RETURN QUERY SELECT r.id, r.day, r.livemode, r.generated_at, r.actor_id, r.discrepancies, r.explained, r.stripe_checked, NULL::jsonb
    FROM billing.reconciliation_report r WHERE r.livemode = p_livemode ORDER BY r.day DESC, r.generated_at DESC LIMIT p_limit;
END $$;

-- Orders behind Stripe movements the day's orders did not match: by order
-- id (Checkout metadata) or PaymentIntent. Services and platform admins.
CREATE FUNCTION billing.orders_lookup(p_order_ids uuid[], p_payment_intents text[])
RETURNS TABLE (id uuid, org_id uuid, status text, livemode boolean, paid_at timestamptz, refunded_at timestamptz,
  payment_intent text, purchase_entry_id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
#variable_conflict use_column
BEGIN
  PERFORM billing._privileged();
  RETURN QUERY SELECT o.id, o.org_id, o.status, o.livemode, o.paid_at, o.refunded_at, o.stripe_payment_intent_id, o.purchase_entry_id
    FROM billing.top_up_order o
    WHERE o.id = ANY ((coalesce(p_order_ids, ARRAY[]::uuid[]))[1:200])
       OR o.stripe_payment_intent_id = ANY ((coalesce(p_payment_intents, ARRAY[]::text[]))[1:200]);
END $$;

/* ------------------------------------------------------------ ops reads --- */

-- Account search for the console: workspace name or id, owner email or
-- domain, order or Stripe id. Platform admins.
CREATE FUNCTION billing.search_accounts(p_query text DEFAULT NULL, p_limit integer DEFAULT 50)
RETURNS TABLE (org_id uuid, workspace text, plan text, billing_mode text, available_ucr bigint, held_ucr bigint, frozen_reason text,
  owner_domain text, last_entry_at timestamptz, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
#variable_conflict use_column
DECLARE q text := nullif(lower(btrim(coalesce(p_query, ''))), '');
BEGIN
  IF billing.actor_kind(billing._actor()) <> 'user' OR NOT evals.is_admin() THEN RAISE EXCEPTION 'SCOPE_DENIED' USING ERRCODE = '42501'; END IF;
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 200 OR length(coalesce(q, '')) > 200 THEN RAISE EXCEPTION 'INPUT_INVALID'; END IF;
  RETURN QUERY
  SELECT w.id, w.name, e.plan, a.billing_mode, a.available_ucr, a.held_ucr, a.frozen_reason,
    (SELECT min(split_part(lower(u.email), '@', 2)) FROM evals.membership m JOIN public.auth_user u ON u.id = m.user_id
      WHERE m.org_id = w.id AND m.role = 'owner'),
    (SELECT max(l.created_at) FROM billing.ledger_entry l WHERE l.org_id = w.id),
    w.created_at
  FROM billing.credit_account a JOIN evals.workspace w ON w.id = a.org_id AND w.deleted_at IS NULL
  LEFT JOIN evals.workspace_entitlement e ON e.org_id = w.id
  WHERE q IS NULL OR position(q IN lower(w.name)) > 0 OR w.id::text LIKE q || '%'
    OR EXISTS (SELECT 1 FROM evals.membership m JOIN public.auth_user u ON u.id = m.user_id
      WHERE m.org_id = w.id AND m.role = 'owner' AND position(q IN lower(u.email)) > 0)
    OR EXISTS (SELECT 1 FROM billing.top_up_order o WHERE o.org_id = w.id AND (o.id::text = q OR lower(o.stripe_payment_intent_id) = q
      OR lower(o.stripe_checkout_session_id) = q OR lower(o.stripe_charge_id) = q))
  ORDER BY (a.frozen_reason IS NOT NULL) DESC, (a.available_ucr + a.held_ucr) DESC, w.created_at DESC
  LIMIT p_limit;
END $$;

-- Credits per workspace for a period: sold (and the euros paid), granted,
-- consumed (captures and meters, net of run refunds), returned by money
-- refunds and chargebacks, expired, plus the shadow-mode charges. Platform
-- roles (admins and operators) read it; amounts only.
CREATE FUNCTION billing.credit_usage(p_from timestamptz, p_to timestamptz)
RETURNS TABLE (org_id uuid, workspace text, plan text, billing_mode text, frozen boolean, available_ucr bigint, held_ucr bigint,
  sold_ucr bigint, sold_net_cents bigint, granted_ucr bigint, consumed_ucr bigint, returned_ucr bigint, refunded_ucr bigint,
  expired_ucr bigint, shadow_charged_ucr bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
#variable_conflict use_column
DECLARE actor text := billing._actor();
BEGIN
  IF billing.actor_kind(actor) <> 'system'
     AND NOT EXISTS (SELECT 1 FROM evals.platform_role WHERE user_id = actor AND role IN ('operator','platform_admin')) THEN
    RAISE EXCEPTION 'SCOPE_DENIED' USING ERRCODE = '42501';
  END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_to <= p_from OR p_to - p_from > interval '400 days' THEN RAISE EXCEPTION 'INPUT_INVALID'; END IF;
  RETURN QUERY
  WITH e AS (
    SELECT l.org_id,
      coalesce(sum(l.amount_ucr) FILTER (WHERE l.entry_type = 'purchase'), 0)::bigint AS sold,
      coalesce(sum(l.amount_ucr) FILTER (WHERE l.entry_type IN ('grant','bonus','allowance') OR (l.entry_type = 'adjustment' AND l.amount_ucr > 0)), 0)::bigint AS granted,
      coalesce(-sum(l.amount_ucr) FILTER (WHERE l.entry_type IN ('capture','action')), 0)::bigint AS consumed,
      coalesce(sum(l.amount_ucr) FILTER (WHERE l.entry_type = 'refund' AND l.amount_ucr > 0), 0)::bigint AS returned,
      coalesce(-sum(l.amount_ucr) FILTER (WHERE (l.entry_type = 'refund' AND l.amount_ucr < 0) OR l.entry_type = 'chargeback'), 0)::bigint AS refunded,
      coalesce(-sum(l.amount_ucr) FILTER (WHERE l.entry_type = 'expiry'), 0)::bigint AS expired
    FROM billing.ledger_entry l WHERE l.created_at >= p_from AND l.created_at < p_to GROUP BY l.org_id
  ), s AS (
    SELECT x.org_id, (coalesce(sum(x.amount_ucr) FILTER (WHERE x.kind IN ('capture','action')), 0)
      - coalesce(sum(x.amount_ucr) FILTER (WHERE x.kind = 'refund'), 0))::bigint AS charged
    FROM billing.shadow_entry x WHERE x.created_at >= p_from AND x.created_at < p_to GROUP BY x.org_id
  ), o AS (
    SELECT t.org_id, coalesce(sum(t.net_cents), 0)::bigint AS net FROM billing.top_up_order t
    WHERE t.paid_at >= p_from AND t.paid_at < p_to GROUP BY t.org_id
  )
  SELECT w.id, w.name, en.plan, a.billing_mode, a.frozen_reason IS NOT NULL, a.available_ucr, a.held_ucr,
    coalesce(e.sold, 0), coalesce(o.net, 0), coalesce(e.granted, 0), coalesce(e.consumed, 0), coalesce(e.returned, 0),
    coalesce(e.refunded, 0), coalesce(e.expired, 0), coalesce(s.charged, 0)
  FROM billing.credit_account a JOIN evals.workspace w ON w.id = a.org_id AND w.deleted_at IS NULL
  LEFT JOIN evals.workspace_entitlement en ON en.org_id = w.id
  LEFT JOIN e ON e.org_id = w.id LEFT JOIN s ON s.org_id = w.id LEFT JOIN o ON o.org_id = w.id
  ORDER BY coalesce(e.sold, 0) DESC, coalesce(e.consumed, 0) + coalesce(s.charged, 0) DESC, (a.available_ucr + a.held_ucr) DESC, w.name
  LIMIT 500;
END $$;

-- The fraud queue (§6.15): free sign-ups that probe many hosts or share a
-- company domain, top-up velocity and payment failures, orders with risk
-- flags, disputes and frozen accounts. Platform admins.
CREATE FUNCTION billing.fraud_queue(p_days integer DEFAULT 30) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE since timestamptz; signups jsonb; velocity jsonb; flagged jsonb; disputes jsonb; frozen jsonb;
BEGIN
  IF billing.actor_kind(billing._actor()) <> 'user' OR NOT evals.is_admin() THEN RAISE EXCEPTION 'SCOPE_DENIED' USING ERRCODE = '42501'; END IF;
  IF p_days IS NULL OR p_days NOT BETWEEN 1 AND 365 THEN RAISE EXCEPTION 'INPUT_INVALID'; END IF;
  since := now() - make_interval(days => p_days);
  WITH free AS (
    SELECT w.id, w.name, w.created_at,
      (SELECT min(split_part(lower(u.email), '@', 2)) FROM evals.membership m JOIN public.auth_user u ON u.id = m.user_id
        WHERE m.org_id = w.id AND m.role = 'owner') AS domain,
      (SELECT count(DISTINCT lower(split_part(split_part(tr.document->>'endpoint', '://', 2), '/', 1)))
        FROM evals.target_revision tr WHERE tr.org_id = w.id AND tr.created_at > now() - interval '30 days'
          AND tr.document->>'endpoint' LIKE 'http%') AS hosts,
      (SELECT count(*) FROM evals.run r WHERE r.org_id = w.id AND r.created_at > now() - interval '1 day') AS runs_day
    FROM evals.workspace w JOIN evals.workspace_entitlement e ON e.org_id = w.id AND e.plan = 'free'
    WHERE w.deleted_at IS NULL AND w.created_at > since
  ), shared AS (
    SELECT domain FROM free WHERE domain IS NOT NULL GROUP BY domain HAVING count(*) > 1
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object('org_id', f.id, 'workspace', f.name, 'created_at', f.created_at, 'domain', f.domain,
      'hosts', f.hosts, 'runs_last_day', f.runs_day, 'flags', to_jsonb(array_remove(ARRAY[
        CASE WHEN f.hosts >= 3 THEN 'many_hosts' END,
        CASE WHEN f.domain IN (SELECT domain FROM shared) THEN 'shared_domain' END,
        CASE WHEN f.runs_day >= 3 THEN 'many_runs' END], NULL))) ORDER BY f.created_at DESC), '[]'::jsonb)
  INTO signups
  FROM free f WHERE f.hosts >= 3 OR f.runs_day >= 3 OR f.domain IN (SELECT domain FROM shared);

  SELECT coalesce(jsonb_agg(jsonb_build_object('org_id', v.org_id, 'workspace', w.name, 'orders_24h', v.n24, 'orders', v.n,
      'failed', v.failed, 'paid_net_cents', v.paid) ORDER BY v.n24 DESC, v.failed DESC), '[]'::jsonb)
  INTO velocity
  FROM (SELECT o.org_id, count(*) AS n, count(*) FILTER (WHERE o.created_at > now() - interval '24 hours') AS n24,
          count(*) FILTER (WHERE o.status = 'failed' OR o.failure_count > 0) AS failed,
          coalesce(sum(o.net_cents) FILTER (WHERE o.paid_at IS NOT NULL), 0) AS paid, max(p.c) AS peak
        FROM billing.top_up_order o
        CROSS JOIN LATERAL (SELECT count(*) AS c FROM billing.top_up_order x
          WHERE x.org_id = o.org_id AND x.created_at BETWEEN o.created_at - interval '24 hours' AND o.created_at) p
        WHERE o.created_at > since GROUP BY o.org_id) v
  JOIN evals.workspace w ON w.id = v.org_id
  WHERE v.peak >= 3 OR v.failed >= 2;

  SELECT coalesce(jsonb_agg(jsonb_build_object('order_id', o.id, 'org_id', o.org_id, 'workspace', w.name, 'status', o.status,
      'livemode', o.livemode, 'net_cents', o.net_cents, 'card_country', o.card_country, 'flags', to_jsonb(o.risk_flags), 'created_at', o.created_at)
      ORDER BY o.created_at DESC), '[]'::jsonb)
  INTO flagged
  FROM billing.top_up_order o JOIN evals.workspace w ON w.id = o.org_id
  WHERE o.created_at > since AND cardinality(o.risk_flags) > 0;

  SELECT coalesce(jsonb_agg(jsonb_build_object('order_id', o.id, 'org_id', o.org_id, 'workspace', w.name, 'status', o.status,
      'livemode', o.livemode, 'net_cents', o.net_cents, 'dispute', o.stripe_dispute_id, 'updated_at', o.updated_at) ORDER BY o.updated_at DESC), '[]'::jsonb)
  INTO disputes
  FROM billing.top_up_order o JOIN evals.workspace w ON w.id = o.org_id
  WHERE o.status IN ('disputed','charged_back') OR (o.stripe_dispute_id IS NOT NULL AND o.updated_at > since);

  SELECT coalesce(jsonb_agg(jsonb_build_object('org_id', a.org_id, 'workspace', w.name, 'frozen_reason', a.frozen_reason,
      'available_ucr', a.available_ucr, 'updated_at', a.updated_at) ORDER BY a.updated_at DESC), '[]'::jsonb)
  INTO frozen
  FROM billing.credit_account a JOIN evals.workspace w ON w.id = a.org_id AND w.deleted_at IS NULL WHERE a.frozen_reason IS NOT NULL;

  RETURN jsonb_build_object('since', since, 'signups', signups, 'velocity', velocity, 'flagged_orders', flagged, 'disputes', disputes,
    'frozen_accounts', frozen);
END $$;

/* ------------------------------------------------------------- grants --- */

REVOKE ALL ON FUNCTION
  billing.two_person_threshold_ucr(), billing.two_person_threshold_cents(), billing.approval_request_guard(), billing._ops_admin(uuid),
  billing._approval_view(billing.approval_request), billing.request_approval(uuid, text, bigint, bigint, jsonb, text, text),
  billing.approve_request(uuid, uuid, text), billing.complete_approval(uuid, uuid, jsonb), billing.close_approval(uuid, uuid, text),
  billing.list_approvals(text, integer), billing.require_second_approver(),
  billing.set_account_freeze(uuid, boolean, text, text), billing.extend_lot_expiry(uuid, uuid, timestamptz, text, text),
  billing.price_notice_ok(boolean, timestamptz, timestamptz), billing._price_book_before(billing.price_book_revision),
  billing.price_increases(uuid), billing.price_notice_recipients(uuid), billing.record_price_notice(uuid, jsonb),
  billing.reconciliation_checks(date, boolean), billing.record_reconciliation(date, boolean, integer, integer, boolean, jsonb),
  billing.reconciliation_reports(boolean, date, integer), billing.search_accounts(text, integer),
  billing.credit_usage(timestamptz, timestamptz), billing.fraud_queue(integer), billing.orders_lookup(uuid[], text[])
FROM PUBLIC;
-- price_book_at keeps its grants (CREATE OR REPLACE); the notice rule it now
-- reads is executable wherever it is.
DO $$ DECLARE r text; BEGIN
  FOREACH r IN ARRAY ARRAY['evals_runtime','evals_worker','evals_browser','evals_document','evals_execution_admin'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION billing.price_notice_ok(boolean, timestamptz, timestamptz),
        billing.two_person_threshold_ucr(), billing.two_person_threshold_cents() TO %I', r);
    END IF;
  END LOOP;
END $$;
-- The web runtime and the scheduler (a member of evals_runtime). Inside,
-- console functions accept platform admins (credit_usage also operators);
-- report and notice functions also accept service identities.
GRANT EXECUTE ON FUNCTION
  billing.request_approval(uuid, text, bigint, bigint, jsonb, text, text),
  billing.approve_request(uuid, uuid, text),
  billing.complete_approval(uuid, uuid, jsonb),
  billing.close_approval(uuid, uuid, text),
  billing.list_approvals(text, integer),
  billing.set_account_freeze(uuid, boolean, text, text),
  billing.extend_lot_expiry(uuid, uuid, timestamptz, text, text),
  billing.price_increases(uuid),
  billing.price_notice_recipients(uuid),
  billing.record_price_notice(uuid, jsonb),
  billing.reconciliation_checks(date, boolean),
  billing.record_reconciliation(date, boolean, integer, integer, boolean, jsonb),
  billing.reconciliation_reports(boolean, date, integer),
  billing.orders_lookup(uuid[], text[]),
  billing.search_accounts(text, integer),
  billing.credit_usage(timestamptz, timestamptz),
  billing.fraud_queue(integer)
TO evals_runtime;

COMMIT;
