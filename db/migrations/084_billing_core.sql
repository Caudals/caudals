-- Billing core: the append-only, idempotent credit ledger (launch spec v2
-- §6.1, §6.2, §6.8–§6.10, §6.16; package L-09).
--
-- Unit of account: 1 credit = €0.01 excl. VAT, stored as micro-credits
-- (1 credit = 1,000,000 µcr) in bigint columns ending in _ucr.
--
-- One billing.credit_account per workspace holds the derived balances:
-- available_ucr (spendable) and held_ucr (reserved by open holds). Every
-- movement is a billing.ledger_entry written in the same transaction as the
-- balance change; entries are append-only (a trigger rejects UPDATE, DELETE
-- and TRUNCATE) and corrections are new reversal entries. Credits live in
-- billing.credit_lot rows (one per purchase, grant, allowance or bonus); a
-- lot's held_ucr is the part of its remaining_ucr reserved by holds. Holds
-- and spends take lots oldest-expiring first; expiry removes only the part of
-- a lot that is not held. billing.credit_hold tracks each hold from held to
-- captured, released or expired.
--
-- Writes go only through the SECURITY DEFINER functions below, each
-- idempotent by key: a replay returns the original entry and a replay with
-- different values raises IDEMPOTENCY_CONFLICT. Runtime and worker roles read
-- their own workspace's rows under RLS and cannot write any billing table.
--
-- Lock order (compatible with lib/evals/budget/ledger.ts): provider account
-- -> workspace and run budgets -> billing.credit_account -> lots and holds.
-- Every function locks the workspace's credit_account row first and never
-- touches evals budget rows, so per-workspace billing writes serialise on
-- that one row and cannot form a cycle with the budget locks.
--
-- Backfill: one account per workspace, starting at zero; plan managed ->
-- billing_mode contract, free -> free. A trigger on
-- evals.workspace_entitlement creates the account for new workspaces and keeps
-- billing_mode in step with the plan.
--
-- Forward repair: additive only. The rollback refuses to run once any ledger
-- entry, lot or hold exists, or any account has a balance or a freeze.
BEGIN;

CREATE SCHEMA billing;
REVOKE ALL ON SCHEMA billing FROM PUBLIC;

/* ------------------------------------------------------------- tables --- */

CREATE TABLE billing.credit_account (
  org_id uuid PRIMARY KEY REFERENCES evals.workspace(id),
  billing_mode text NOT NULL CHECK (billing_mode IN ('free','credits','contract')),
  available_ucr bigint NOT NULL DEFAULT 0 CHECK (available_ucr >= 0),
  held_ucr bigint NOT NULL DEFAULT 0 CHECK (held_ucr >= 0),
  frozen_reason text CHECK (frozen_reason IS NULL OR length(frozen_reason) BETWEEN 3 AND 500),
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE billing.credit_lot (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES billing.credit_account(org_id),
  source text NOT NULL CHECK (source IN ('purchase','bonus','grant','promo','allowance','contract_allowance','adjustment')),
  granted_ucr bigint NOT NULL CHECK (granted_ucr > 0),
  remaining_ucr bigint NOT NULL CHECK (remaining_ucr >= 0),
  held_ucr bigint NOT NULL DEFAULT 0 CHECK (held_ucr >= 0),
  expired_ucr bigint NOT NULL DEFAULT 0 CHECK (expired_ucr >= 0),
  -- Euros actually paid per credit (refunds and revenue); 0 for free credits.
  unit_price_eur numeric(18,10) NOT NULL DEFAULT 0 CHECK (unit_price_eur >= 0),
  expires_at timestamptz,
  order_id uuid,
  campaign text CHECK (campaign IS NULL OR campaign ~ '^[a-z0-9][a-z0-9_.:-]{0,79}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, id),
  CHECK (held_ucr <= remaining_ucr),
  CHECK (remaining_ucr + expired_ucr <= granted_ucr)
);
CREATE INDEX credit_lot_spendable ON billing.credit_lot (org_id, expires_at, created_at, id) WHERE remaining_ucr > held_ucr;
CREATE INDEX credit_lot_expiring ON billing.credit_lot (expires_at) WHERE remaining_ucr > held_ucr AND expires_at IS NOT NULL;

CREATE TABLE billing.credit_hold (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES billing.credit_account(org_id),
  hold_key text NOT NULL CHECK (length(hold_key) BETWEEN 3 AND 200),
  amount_ucr bigint NOT NULL CHECK (amount_ucr > 0),
  captured_ucr bigint NOT NULL DEFAULT 0 CHECK (captured_ucr >= 0),
  released_ucr bigint NOT NULL DEFAULT 0 CHECK (released_ucr >= 0),
  capture_requested_ucr bigint CHECK (capture_requested_ucr IS NULL OR capture_requested_ucr >= 0),
  state text NOT NULL DEFAULT 'held' CHECK (state IN ('held','captured','released','expired')),
  -- Lots reserved at hold time, oldest-expiring first: [{"lot": uuid, "ucr": n}].
  lot_allocations jsonb NOT NULL CHECK (jsonb_typeof(lot_allocations) = 'array'),
  request_fingerprint text NOT NULL CHECK (request_fingerprint ~ '^[0-9a-f]{64}$'),
  run_id uuid,
  attempt_id uuid,
  case_unit_id uuid,
  price_book_revision_id uuid,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  settled_at timestamptz,
  UNIQUE (org_id, hold_key),
  UNIQUE (org_id, id),
  CHECK (captured_ucr <= amount_ucr),
  CHECK (state = 'captured' OR captured_ucr = 0),
  CHECK ((state = 'held' AND released_ucr = 0 AND settled_at IS NULL)
      OR (state <> 'held' AND captured_ucr + released_ucr = amount_ucr AND settled_at IS NOT NULL))
);
CREATE INDEX credit_hold_open ON billing.credit_hold (expires_at) WHERE state = 'held';
CREATE INDEX credit_hold_attempt ON billing.credit_hold (org_id, attempt_id) WHERE attempt_id IS NOT NULL;

CREATE TABLE billing.ledger_entry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES billing.credit_account(org_id),
  -- The account version this entry produced: a gapless-per-write order.
  account_version bigint NOT NULL,
  entry_type text NOT NULL CHECK (entry_type IN ('purchase','grant','allowance','bonus','hold','release','capture',
    'action','refund','adjustment','expiry','chargeback','reversal')),
  -- Signed change of the account's total credits (available + held). Holds and
  -- releases move credits between the two buckets and have amount 0.
  amount_ucr bigint NOT NULL,
  available_delta_ucr bigint NOT NULL,
  held_delta_ucr bigint NOT NULL,
  available_after_ucr bigint NOT NULL CHECK (available_after_ucr >= 0),
  held_after_ucr bigint NOT NULL CHECK (held_after_ucr >= 0),
  -- Lots touched, as [{"lot": uuid, "ucr": n}] with n > 0. For hold, release
  -- and capture n moves the lot's held part; otherwise its remaining part, in
  -- the direction of amount_ucr (capture always consumes).
  lot_allocations jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(lot_allocations) = 'array'),
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 3 AND 240),
  request_fingerprint text NOT NULL CHECK (request_fingerprint ~ '^[0-9a-f]{64}$'),
  hold_id uuid,
  reverses_entry_id uuid,
  meter text CHECK (meter IS NULL OR meter ~ '^[a-z][a-z0-9_]{1,63}$'),
  ref_kind text CHECK (ref_kind IS NULL OR ref_kind ~ '^[a-z][a-z0-9_]{1,39}$'),
  ref_id text CHECK (ref_id IS NULL OR length(ref_id) BETWEEN 1 AND 255),
  run_id uuid,
  attempt_id uuid,
  case_unit_id uuid,
  price_book_revision_id uuid,
  actor_id text NOT NULL CHECK (length(actor_id) BETWEEN 1 AND 255),
  actor_kind text NOT NULL CHECK (actor_kind IN ('user','system','worker')),
  reason text CHECK (reason IS NULL OR length(reason) BETWEEN 3 AND 2000),
  request_id text CHECK (request_id IS NULL OR length(request_id) BETWEEN 1 AND 200),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, idempotency_key),
  UNIQUE (org_id, account_version),
  UNIQUE (org_id, id),
  FOREIGN KEY (org_id, hold_id) REFERENCES billing.credit_hold(org_id, id),
  FOREIGN KEY (org_id, reverses_entry_id) REFERENCES billing.ledger_entry(org_id, id),
  CHECK (amount_ucr = available_delta_ucr + held_delta_ucr),
  CHECK ((entry_type IN ('hold','release','capture')) = (hold_id IS NOT NULL)),
  CHECK (entry_type <> 'reversal' OR reverses_entry_id IS NOT NULL),
  CHECK (entry_type NOT IN ('adjustment','reversal') OR reason IS NOT NULL),
  CONSTRAINT ledger_entry_direction CHECK (CASE entry_type
    WHEN 'hold' THEN held_delta_ucr > 0 AND available_delta_ucr = -held_delta_ucr
    WHEN 'release' THEN held_delta_ucr < 0 AND available_delta_ucr = -held_delta_ucr
    WHEN 'capture' THEN held_delta_ucr <= 0 AND available_delta_ucr = 0
    WHEN 'expiry' THEN available_delta_ucr < 0 AND held_delta_ucr = 0
    WHEN 'action' THEN available_delta_ucr <= 0 AND held_delta_ucr = 0
    WHEN 'chargeback' THEN available_delta_ucr <= 0 AND held_delta_ucr = 0
    WHEN 'adjustment' THEN available_delta_ucr <> 0 AND held_delta_ucr = 0
    WHEN 'reversal' THEN available_delta_ucr <> 0 AND held_delta_ucr = 0
    ELSE available_delta_ucr > 0 AND held_delta_ucr = 0 END)
);
-- An entry is reversed or refunded at most once.
CREATE UNIQUE INDEX ledger_entry_reversed_once ON billing.ledger_entry (org_id, reverses_entry_id) WHERE reverses_entry_id IS NOT NULL;
CREATE INDEX ledger_entry_timeline ON billing.ledger_entry (org_id, created_at DESC, id DESC);
CREATE INDEX ledger_entry_run ON billing.ledger_entry (org_id, run_id) WHERE run_id IS NOT NULL;

-- Nightly verifier results (no tenant data beyond workspace ids and issue codes).
CREATE TABLE billing.verification_run (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checked_at timestamptz NOT NULL DEFAULT now(),
  actor_id text NOT NULL,
  accounts integer NOT NULL CHECK (accounts >= 0),
  drift_accounts integer NOT NULL CHECK (drift_accounts >= 0),
  drift jsonb NOT NULL DEFAULT '[]'::jsonb
);
CREATE INDEX verification_run_recent ON billing.verification_run (checked_at DESC);

CREATE FUNCTION billing.reject_ledger_mutation() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  RAISE EXCEPTION 'LEDGER_APPEND_ONLY' USING ERRCODE = '55000';
END $$;
CREATE TRIGGER ledger_entry_append_only BEFORE UPDATE OR DELETE ON billing.ledger_entry
  FOR EACH ROW EXECUTE FUNCTION billing.reject_ledger_mutation();
CREATE TRIGGER ledger_entry_no_truncate BEFORE TRUNCATE ON billing.ledger_entry
  FOR EACH STATEMENT EXECUTE FUNCTION billing.reject_ledger_mutation();
CREATE TRIGGER verification_run_append_only BEFORE UPDATE OR DELETE ON billing.verification_run
  FOR EACH ROW EXECUTE FUNCTION billing.reject_ledger_mutation();

/* --------------------------------------------------------- read access --- */

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['credit_account','credit_lot','credit_hold','ledger_entry'] LOOP
    EXECUTE format('ALTER TABLE billing.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE billing.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY tenant_read ON billing.%I FOR SELECT USING (org_id = nullif(current_setting(''evals.org_id'', true), '''')::uuid)', t);
  END LOOP;
END $$;
-- Platform-level verifier history: no policy, reached only through functions.
ALTER TABLE billing.verification_run ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing.verification_run FORCE ROW LEVEL SECURITY;

REVOKE ALL ON ALL TABLES IN SCHEMA billing FROM PUBLIC;
DO $$ DECLARE r text; BEGIN
  FOREACH r IN ARRAY ARRAY['evals_runtime','evals_worker','evals_browser','evals_document'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('GRANT USAGE ON SCHEMA billing TO %I', r);
      EXECUTE format('GRANT SELECT ON billing.credit_account, billing.credit_lot, billing.credit_hold, billing.ledger_entry TO %I', r);
    END IF;
  END LOOP;
END $$;

/* ------------------------------------------------------------- helpers --- */

CREATE FUNCTION billing.mode_for_plan(p_plan text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$
  SELECT CASE p_plan WHEN 'free' THEN 'free' WHEN 'managed' THEN 'contract' ELSE 'credits' END
$$;

-- Service identities set by the deployed services; anything else is a person.
CREATE FUNCTION billing.actor_kind(p_actor text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$
  SELECT CASE
    WHEN p_actor ~ '^service:evals-(worker|browser|documents)' THEN 'worker'
    WHEN p_actor ~ '^(service|system):' THEN 'system'
    ELSE 'user' END
$$;

CREATE FUNCTION billing._fingerprint(p jsonb) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$
  SELECT encode(sha256(convert_to(p::text, 'UTF8')), 'hex')
$$;

CREATE FUNCTION billing._actor() RETURNS text
LANGUAGE plpgsql STABLE SET search_path = pg_catalog AS $$
DECLARE a text := evals.actor_id();
BEGIN
  IF a IS NULL THEN RAISE EXCEPTION 'SCOPE_DENIED' USING ERRCODE = '42501'; END IF;
  RETURN a;
END $$;

-- Tenant functions act only on the workspace the transaction is scoped to.
CREATE FUNCTION billing._tenant(p_org_id uuid) RETURNS void
LANGUAGE plpgsql STABLE SET search_path = pg_catalog AS $$
BEGIN
  PERFORM billing._actor();
  IF p_org_id IS NULL OR p_org_id IS DISTINCT FROM evals.org_id() THEN
    RAISE EXCEPTION 'SCOPE_DENIED' USING ERRCODE = '42501';
  END IF;
END $$;

-- Credit-creating and cross-tenant functions: platform admins and service
-- (system) identities only. Customers and workers never qualify.
CREATE FUNCTION billing._privileged() RETURNS void
LANGUAGE plpgsql STABLE SET search_path = pg_catalog AS $$
BEGIN
  IF NOT (evals.is_admin() OR billing.actor_kind(billing._actor()) = 'system') THEN
    RAISE EXCEPTION 'SCOPE_DENIED' USING ERRCODE = '42501';
  END IF;
END $$;

CREATE FUNCTION billing._check(p_key text, p_amount bigint, p_allow_zero boolean) RETURNS void
LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog AS $$
BEGIN
  IF p_key IS NULL OR p_key !~ '^[A-Za-z0-9][A-Za-z0-9:._/@-]{2,199}$' THEN RAISE EXCEPTION 'INPUT_INVALID'; END IF;
  -- 10^15 µcr (10^9 credits) per operation keeps JSON allocations exact.
  IF p_amount IS NULL OR p_amount > 1000000000000000 OR p_amount < 0 OR (p_amount = 0 AND NOT p_allow_zero) THEN
    RAISE EXCEPTION 'INPUT_INVALID';
  END IF;
END $$;

CREATE FUNCTION billing._reason(p_reason text, p_required boolean) RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog AS $$
DECLARE r text := nullif(btrim(p_reason), '');
BEGIN
  IF r IS NULL AND p_required THEN RAISE EXCEPTION 'REASON_REQUIRED'; END IF;
  IF r IS NOT NULL AND length(r) NOT BETWEEN 3 AND 2000 THEN RAISE EXCEPTION 'REASON_REQUIRED'; END IF;
  RETURN r;
END $$;

CREATE FUNCTION billing._lock_account(p_org_id uuid) RETURNS billing.credit_account
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE a billing.credit_account;
BEGIN
  SELECT * INTO a FROM billing.credit_account WHERE org_id = p_org_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ACCOUNT_MISSING'; END IF;
  RETURN a;
END $$;

CREATE FUNCTION billing._entry(p_org_id uuid, p_key text) RETURNS billing.ledger_entry
LANGUAGE sql STABLE SET search_path = pg_catalog AS $$
  SELECT * FROM billing.ledger_entry WHERE org_id = p_org_id AND idempotency_key = p_key
$$;

-- Applies one movement to the locked account and appends its entry.
CREATE FUNCTION billing._post(p_org_id uuid, p_type text, p_key text, p_fingerprint text,
  p_available_delta bigint, p_held_delta bigint, p_allocations jsonb, p_refs jsonb)
RETURNS billing.ledger_entry
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE a billing.credit_account; e billing.ledger_entry; actor text := billing._actor();
BEGIN
  UPDATE billing.credit_account SET available_ucr = available_ucr + p_available_delta,
    held_ucr = held_ucr + p_held_delta, version = version + 1, updated_at = now()
  WHERE org_id = p_org_id RETURNING * INTO a;
  INSERT INTO billing.ledger_entry (org_id, account_version, entry_type, amount_ucr, available_delta_ucr, held_delta_ucr,
    available_after_ucr, held_after_ucr, lot_allocations, idempotency_key, request_fingerprint, hold_id, reverses_entry_id,
    meter, ref_kind, ref_id, run_id, attempt_id, case_unit_id, price_book_revision_id, actor_id, actor_kind, reason,
    request_id, metadata)
  VALUES (p_org_id, a.version, p_type, p_available_delta + p_held_delta, p_available_delta, p_held_delta,
    a.available_ucr, a.held_ucr, coalesce(p_allocations, '[]'::jsonb), p_key, p_fingerprint,
    (p_refs->>'hold_id')::uuid, (p_refs->>'reverses_entry_id')::uuid, p_refs->>'meter', p_refs->>'ref_kind', p_refs->>'ref_id',
    (p_refs->>'run_id')::uuid, (p_refs->>'attempt_id')::uuid, (p_refs->>'case_unit_id')::uuid,
    (p_refs->>'price_book_revision_id')::uuid, actor, billing.actor_kind(actor), p_refs->>'reason', p_refs->>'request_id',
    coalesce(nullif(p_refs->'metadata', 'null'::jsonb), '{}'::jsonb))
  RETURNING * INTO e;
  RETURN e;
END $$;

-- Creates a lot and the entry that adds it to the available balance.
CREATE FUNCTION billing._credit(p_org_id uuid, p_type text, p_source text, p_key text, p_fingerprint text,
  p_amount bigint, p_expires_at timestamptz, p_unit_price numeric, p_order_id uuid, p_campaign text, p_refs jsonb)
RETURNS billing.ledger_entry
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE lot uuid;
BEGIN
  INSERT INTO billing.credit_lot (org_id, source, granted_ucr, remaining_ucr, unit_price_eur, expires_at, order_id, campaign)
  VALUES (p_org_id, p_source, p_amount, p_amount, coalesce(p_unit_price, 0), p_expires_at, p_order_id, p_campaign)
  RETURNING id INTO lot;
  RETURN billing._post(p_org_id, p_type, p_key, p_fingerprint, p_amount, 0,
    jsonb_build_array(jsonb_build_object('lot', lot, 'ucr', p_amount)), p_refs);
END $$;

-- Takes the free part of unexpired lots, oldest-expiring first. 'hold' moves
-- it to the lots' held part; 'consume' removes it. Raises CREDITS_EXHAUSTED
-- when short, unless p_allow_partial.
CREATE FUNCTION billing._take(p_org_id uuid, p_amount bigint, p_mode text, p_allow_partial boolean)
RETURNS jsonb
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE l record; need bigint := p_amount; chunk bigint; allocations jsonb := '[]'::jsonb;
BEGIN
  IF need > 0 THEN
    FOR l IN SELECT id, remaining_ucr - held_ucr AS free FROM billing.credit_lot
      WHERE org_id = p_org_id AND remaining_ucr > held_ucr AND (expires_at IS NULL OR expires_at > now())
      ORDER BY expires_at ASC NULLS LAST, created_at, id FOR UPDATE
    LOOP
      chunk := least(need, l.free);
      IF p_mode = 'hold' THEN
        UPDATE billing.credit_lot SET held_ucr = held_ucr + chunk WHERE id = l.id;
      ELSE
        UPDATE billing.credit_lot SET remaining_ucr = remaining_ucr - chunk WHERE id = l.id;
      END IF;
      allocations := allocations || jsonb_build_array(jsonb_build_object('lot', l.id, 'ucr', chunk));
      need := need - chunk;
      EXIT WHEN need = 0;
    END LOOP;
  END IF;
  IF need > 0 AND NOT p_allow_partial THEN RAISE EXCEPTION 'CREDITS_EXHAUSTED'; END IF;
  RETURN jsonb_build_object('allocations', allocations, 'taken', p_amount - need);
END $$;

-- Expires the unheld part of every due lot of a locked account, one entry
-- per lot. Held parts expire once their hold is released.
CREATE FUNCTION billing._expire_lots(p_org_id uuid, OUT n_lots integer, OUT n_ucr bigint)
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE l record; chunk bigint;
BEGIN
  n_lots := 0; n_ucr := 0;
  FOR l IN SELECT * FROM billing.credit_lot c
    WHERE c.org_id = p_org_id AND c.expires_at <= now() AND c.remaining_ucr > c.held_ucr
    ORDER BY c.expires_at, c.created_at, c.id FOR UPDATE
  LOOP
    chunk := l.remaining_ucr - l.held_ucr;
    UPDATE billing.credit_lot c SET remaining_ucr = c.remaining_ucr - chunk, expired_ucr = c.expired_ucr + chunk WHERE c.id = l.id;
    PERFORM billing._post(p_org_id, 'expiry', 'expiry:' || l.id || ':' || (l.expired_ucr + chunk),
      billing._fingerprint(jsonb_build_object('fn', 'expiry', 'lot', l.id, 'ucr', chunk)), -chunk, 0,
      jsonb_build_array(jsonb_build_object('lot', l.id, 'ucr', chunk)),
      jsonb_build_object('metadata', jsonb_build_object('source', l.source, 'expires_at', l.expires_at)));
    n_lots := n_lots + 1; n_ucr := n_ucr + chunk;
  END LOOP;
END $$;

-- Returns a hold's reserved credits to the available balance.
CREATE FUNCTION billing._release_hold(p_hold billing.credit_hold, p_state text, p_reason text, p_request_id text)
RETURNS billing.ledger_entry
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE alloc jsonb;
BEGIN
  FOR alloc IN SELECT value FROM jsonb_array_elements(p_hold.lot_allocations) WITH ORDINALITY ORDER BY ordinality LOOP
    UPDATE billing.credit_lot SET held_ucr = held_ucr - (alloc->>'ucr')::bigint
    WHERE org_id = p_hold.org_id AND id = (alloc->>'lot')::uuid;
  END LOOP;
  UPDATE billing.credit_hold SET state = p_state, released_ucr = amount_ucr, settled_at = now() WHERE id = p_hold.id;
  RETURN billing._post(p_hold.org_id, 'release', 'release:' || p_hold.hold_key, p_hold.request_fingerprint,
    p_hold.amount_ucr, -p_hold.amount_ucr, p_hold.lot_allocations,
    jsonb_build_object('hold_id', p_hold.id, 'run_id', p_hold.run_id, 'attempt_id', p_hold.attempt_id,
      'case_unit_id', p_hold.case_unit_id, 'price_book_revision_id', p_hold.price_book_revision_id,
      'reason', p_reason, 'request_id', p_request_id,
      'metadata', CASE WHEN p_state = 'expired' THEN jsonb_build_object('expired', true) ELSE '{}'::jsonb END));
END $$;

-- Writes the inverse of a credit or debit entry against the same lots.
CREATE FUNCTION billing._reverse(p_org_id uuid, p_type text, p_key text, p_fingerprint text, p_entry_id uuid, p_refs jsonb)
RETURNS billing.ledger_entry
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE t billing.ledger_entry; alloc jsonb; l billing.credit_lot;
BEGIN
  SELECT * INTO t FROM billing.ledger_entry WHERE org_id = p_org_id AND id = p_entry_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'ENTRY_NOT_FOUND'; END IF;
  IF t.entry_type NOT IN ('purchase','grant','allowance','bonus','adjustment','refund','action','capture') OR t.amount_ucr = 0 THEN
    RAISE EXCEPTION 'ENTRY_NOT_REVERSIBLE';
  END IF;
  IF EXISTS (SELECT 1 FROM billing.ledger_entry WHERE org_id = p_org_id AND reverses_entry_id = t.id) THEN
    RAISE EXCEPTION 'ENTRY_ALREADY_REVERSED';
  END IF;
  FOR alloc IN SELECT value FROM jsonb_array_elements(t.lot_allocations) WITH ORDINALITY ORDER BY ordinality LOOP
    SELECT * INTO l FROM billing.credit_lot WHERE org_id = p_org_id AND id = (alloc->>'lot')::uuid FOR UPDATE;
    IF t.amount_ucr > 0 THEN
      -- Credits added by the entry come back out of the same lots.
      IF l.remaining_ucr - l.held_ucr < (alloc->>'ucr')::bigint THEN RAISE EXCEPTION 'REVERSAL_EXCEEDS_REMAINING'; END IF;
      UPDATE billing.credit_lot SET remaining_ucr = remaining_ucr - (alloc->>'ucr')::bigint WHERE id = l.id;
    ELSE
      -- Credits the entry consumed go back to the lots they came from.
      UPDATE billing.credit_lot SET remaining_ucr = remaining_ucr + (alloc->>'ucr')::bigint WHERE id = l.id;
    END IF;
  END LOOP;
  RETURN billing._post(p_org_id, p_type, p_key, p_fingerprint, -t.amount_ucr, 0, t.lot_allocations,
    p_refs || jsonb_build_object('reverses_entry_id', t.id, 'run_id', coalesce(p_refs->>'run_id', t.run_id::text),
      'metadata', jsonb_build_object('reversed_type', t.entry_type)));
END $$;

CREATE FUNCTION billing._audit(p_action text, p_entry billing.ledger_entry) RETURNS void
LANGUAGE sql SET search_path = pg_catalog AS $$
  INSERT INTO evals.audit_event (org_id, actor_id, action, subject_id, details)
  VALUES (p_entry.org_id, p_entry.actor_id, p_action, p_entry.id::text, jsonb_build_object(
    'entry_type', p_entry.entry_type, 'amount_ucr', p_entry.amount_ucr, 'reason', p_entry.reason,
    'before', jsonb_build_object('available_ucr', p_entry.available_after_ucr - p_entry.available_delta_ucr,
                                 'held_ucr', p_entry.held_after_ucr - p_entry.held_delta_ucr),
    'after', jsonb_build_object('available_ucr', p_entry.available_after_ucr, 'held_ucr', p_entry.held_after_ucr)))
$$;

/* ---------------------------------------------------- public functions --- */

-- Adds free credits as a new lot: an ops grant or promo, a bonus, a monthly
-- allowance or a contract allowance. Purchases go through record_purchase
-- (L-12). Platform admins (reason required) and service identities only.
CREATE FUNCTION billing.grant(p_org_id uuid, p_key text, p_amount_ucr bigint, p_source text, p_expires_at timestamptz,
  p_reason text DEFAULT NULL, p_campaign text DEFAULT NULL, p_ref_kind text DEFAULT NULL, p_ref_id text DEFAULT NULL,
  p_request_id text DEFAULT NULL)
RETURNS billing.ledger_entry
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE fp text; e billing.ledger_entry; entry_key text := 'grant:' || p_key; reason text; is_user boolean;
BEGIN
  PERFORM billing._tenant(p_org_id);
  PERFORM billing._privileged();
  PERFORM billing._check(p_key, p_amount_ucr, false);
  IF p_source IS NULL OR p_source NOT IN ('grant','promo','bonus','allowance','contract_allowance')
     OR (p_expires_at IS NOT NULL AND p_expires_at <= now()) THEN
    RAISE EXCEPTION 'INPUT_INVALID';
  END IF;
  is_user := billing.actor_kind(evals.actor_id()) = 'user';
  reason := billing._reason(p_reason, is_user);
  fp := billing._fingerprint(jsonb_build_object('fn', 'grant', 'amount', p_amount_ucr, 'source', p_source,
    'expires_at', extract(epoch FROM p_expires_at), 'campaign', p_campaign, 'ref_kind', p_ref_kind, 'ref_id', p_ref_id));
  PERFORM billing._lock_account(p_org_id);
  e := billing._entry(p_org_id, entry_key);
  IF e.id IS NOT NULL THEN
    IF e.request_fingerprint <> fp THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF;
    RETURN e;
  END IF;
  e := billing._credit(p_org_id,
    CASE p_source WHEN 'bonus' THEN 'bonus' WHEN 'allowance' THEN 'allowance' WHEN 'contract_allowance' THEN 'allowance' ELSE 'grant' END,
    p_source, entry_key, fp, p_amount_ucr, p_expires_at, 0, NULL, p_campaign,
    jsonb_build_object('ref_kind', p_ref_kind, 'ref_id', p_ref_id, 'reason', reason, 'request_id', p_request_id));
  IF is_user THEN PERFORM billing._audit('billing.grant', e); END IF;
  RETURN e;
END $$;

-- Reserves credits for one unit of work (key 'attempt:<id>' on the engine
-- path). Defaults to a 24-hour hold. Raises CREDITS_EXHAUSTED when the
-- unexpired, unheld credits are short, and ACCOUNT_FROZEN on a frozen account.
CREATE FUNCTION billing.hold(p_org_id uuid, p_key text, p_amount_ucr bigint, p_expires_at timestamptz DEFAULT NULL,
  p_run_id uuid DEFAULT NULL, p_attempt_id uuid DEFAULT NULL, p_case_unit_id uuid DEFAULT NULL,
  p_price_book_revision_id uuid DEFAULT NULL, p_request_id text DEFAULT NULL)
RETURNS billing.ledger_entry
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE a billing.credit_account; h billing.credit_hold; fp text; taken jsonb;
BEGIN
  PERFORM billing._tenant(p_org_id);
  PERFORM billing._check(p_key, p_amount_ucr, false);
  IF p_expires_at IS NOT NULL AND p_expires_at <= now() THEN RAISE EXCEPTION 'INPUT_INVALID'; END IF;
  fp := billing._fingerprint(jsonb_build_object('fn', 'hold', 'amount', p_amount_ucr, 'expires_at', extract(epoch FROM p_expires_at),
    'run_id', p_run_id, 'attempt_id', p_attempt_id, 'case_unit_id', p_case_unit_id, 'price_book_revision_id', p_price_book_revision_id));
  a := billing._lock_account(p_org_id);
  SELECT * INTO h FROM billing.credit_hold WHERE org_id = p_org_id AND hold_key = p_key;
  IF FOUND THEN
    IF h.request_fingerprint <> fp THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF;
    RETURN billing._entry(p_org_id, 'hold:' || p_key);
  END IF;
  IF a.frozen_reason IS NOT NULL THEN RAISE EXCEPTION 'ACCOUNT_FROZEN'; END IF;
  PERFORM billing._expire_lots(p_org_id);
  taken := billing._take(p_org_id, p_amount_ucr, 'hold', false);
  INSERT INTO billing.credit_hold (org_id, hold_key, amount_ucr, lot_allocations, request_fingerprint, run_id, attempt_id,
    case_unit_id, price_book_revision_id, expires_at)
  VALUES (p_org_id, p_key, p_amount_ucr, taken->'allocations', fp, p_run_id, p_attempt_id, p_case_unit_id,
    p_price_book_revision_id, coalesce(p_expires_at, now() + interval '24 hours'))
  RETURNING * INTO h;
  RETURN billing._post(p_org_id, 'hold', 'hold:' || p_key, fp, -p_amount_ucr, p_amount_ucr, taken->'allocations',
    jsonb_build_object('hold_id', h.id, 'run_id', p_run_id, 'attempt_id', p_attempt_id, 'case_unit_id', p_case_unit_id,
      'price_book_revision_id', p_price_book_revision_id, 'request_id', p_request_id));
END $$;

-- Settles a hold: charges min(p_amount_ucr, hold) from the hold's lots in
-- order (oldest-expiring first) and releases the rest. Any overage is ours
-- and recorded in the capture's metadata. Returns the capture entry, then the
-- release entry when part of the hold was released.
CREATE FUNCTION billing.capture(p_org_id uuid, p_key text, p_amount_ucr bigint, p_request_id text DEFAULT NULL,
  p_metadata jsonb DEFAULT NULL)
RETURNS SETOF billing.ledger_entry
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE h billing.credit_hold; fp text; ce billing.ledger_entry; captured bigint; need bigint; chunk bigint; reserved bigint;
  alloc jsonb; consumed jsonb := '[]'::jsonb; returned jsonb := '[]'::jsonb; refs jsonb;
BEGIN
  PERFORM billing._tenant(p_org_id);
  PERFORM billing._check(p_key, p_amount_ucr, true);
  IF p_metadata IS NOT NULL AND jsonb_typeof(p_metadata) <> 'object' THEN RAISE EXCEPTION 'INPUT_INVALID'; END IF;
  fp := billing._fingerprint(jsonb_build_object('fn', 'capture', 'amount', p_amount_ucr));
  PERFORM billing._lock_account(p_org_id);
  SELECT * INTO h FROM billing.credit_hold WHERE org_id = p_org_id AND hold_key = p_key FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'HOLD_NOT_FOUND'; END IF;
  IF h.state = 'captured' THEN
    ce := billing._entry(p_org_id, 'capture:' || p_key);
    IF ce.request_fingerprint <> fp THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF;
    RETURN QUERY SELECT * FROM billing.ledger_entry
      WHERE org_id = p_org_id AND idempotency_key IN ('capture:' || p_key, 'release:' || p_key) ORDER BY account_version;
    RETURN;
  END IF;
  IF h.state <> 'held' THEN RAISE EXCEPTION 'HOLD_NOT_OPEN'; END IF;
  captured := least(p_amount_ucr, h.amount_ucr);
  need := captured;
  FOR alloc IN SELECT value FROM jsonb_array_elements(h.lot_allocations) WITH ORDINALITY ORDER BY ordinality LOOP
    reserved := (alloc->>'ucr')::bigint;
    chunk := least(need, reserved);
    UPDATE billing.credit_lot SET remaining_ucr = remaining_ucr - chunk, held_ucr = held_ucr - reserved
    WHERE org_id = p_org_id AND id = (alloc->>'lot')::uuid;
    IF chunk > 0 THEN consumed := consumed || jsonb_build_array(jsonb_build_object('lot', alloc->'lot', 'ucr', chunk)); END IF;
    IF reserved > chunk THEN returned := returned || jsonb_build_array(jsonb_build_object('lot', alloc->'lot', 'ucr', reserved - chunk)); END IF;
    need := need - chunk;
  END LOOP;
  UPDATE billing.credit_hold SET state = 'captured', captured_ucr = captured, released_ucr = amount_ucr - captured,
    capture_requested_ucr = p_amount_ucr, settled_at = now() WHERE id = h.id;
  refs := jsonb_build_object('hold_id', h.id, 'run_id', h.run_id, 'attempt_id', h.attempt_id, 'case_unit_id', h.case_unit_id,
    'price_book_revision_id', h.price_book_revision_id, 'request_id', p_request_id);
  RETURN NEXT billing._post(p_org_id, 'capture', 'capture:' || p_key, fp, 0, -captured, consumed,
    refs || jsonb_build_object('metadata', coalesce(p_metadata, '{}'::jsonb)
      || jsonb_build_object('requested_ucr', p_amount_ucr, 'overage_ucr', greatest(p_amount_ucr - h.amount_ucr, 0))));
  IF h.amount_ucr > captured THEN
    RETURN NEXT billing._post(p_org_id, 'release', 'release:' || p_key, fp, h.amount_ucr - captured, -(h.amount_ucr - captured),
      returned, refs);
  END IF;
END $$;

-- Releases a hold in full: the customer pays nothing for failed, cancelled or
-- unknown work. Replays (and releases of a hold that already expired) return
-- the original release entry. A captured hold raises HOLD_NOT_OPEN.
CREATE FUNCTION billing.release(p_org_id uuid, p_key text, p_reason text DEFAULT NULL, p_request_id text DEFAULT NULL)
RETURNS billing.ledger_entry
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE h billing.credit_hold; reason text;
BEGIN
  PERFORM billing._tenant(p_org_id);
  PERFORM billing._check(p_key, 0, true);
  reason := billing._reason(p_reason, false);
  PERFORM billing._lock_account(p_org_id);
  SELECT * INTO h FROM billing.credit_hold WHERE org_id = p_org_id AND hold_key = p_key FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'HOLD_NOT_FOUND'; END IF;
  IF h.state IN ('released','expired') THEN RETURN billing._entry(p_org_id, 'release:' || p_key); END IF;
  IF h.state <> 'held' THEN RAISE EXCEPTION 'HOLD_NOT_OPEN'; END IF;
  RETURN billing._release_hold(h, 'released', reason, p_request_id);
END $$;

-- Charges a platform meter (website question, page read, graded answer…) for
-- completed work, key 'unit:<case_unit_id>' or similar. Consumes unexpired,
-- unheld credits oldest-expiring first; raises CREDITS_EXHAUSTED when short
-- unless p_allow_partial, which charges what is there and records the
-- shortfall in the entry's metadata.
CREATE FUNCTION billing.charge_action(p_org_id uuid, p_key text, p_meter text, p_amount_ucr bigint,
  p_quantity numeric DEFAULT 1, p_run_id uuid DEFAULT NULL, p_case_unit_id uuid DEFAULT NULL,
  p_price_book_revision_id uuid DEFAULT NULL, p_allow_partial boolean DEFAULT false, p_request_id text DEFAULT NULL)
RETURNS billing.ledger_entry
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE fp text; e billing.ledger_entry; entry_key text := 'action:' || p_key; taken jsonb; charged bigint;
BEGIN
  PERFORM billing._tenant(p_org_id);
  PERFORM billing._check(p_key, p_amount_ucr, false);
  IF p_meter IS NULL OR p_meter !~ '^[a-z][a-z0-9_]{1,63}$' OR p_quantity IS NULL OR p_quantity <= 0 OR p_quantity > 1000000 THEN
    RAISE EXCEPTION 'INPUT_INVALID';
  END IF;
  fp := billing._fingerprint(jsonb_build_object('fn', 'action', 'meter', p_meter, 'amount', p_amount_ucr,
    'quantity', trim_scale(p_quantity), 'run_id', p_run_id, 'case_unit_id', p_case_unit_id,
    'price_book_revision_id', p_price_book_revision_id, 'allow_partial', coalesce(p_allow_partial, false)));
  PERFORM billing._lock_account(p_org_id);
  e := billing._entry(p_org_id, entry_key);
  IF e.id IS NOT NULL THEN
    IF e.request_fingerprint <> fp THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF;
    RETURN e;
  END IF;
  PERFORM billing._expire_lots(p_org_id);
  taken := billing._take(p_org_id, p_amount_ucr, 'consume', coalesce(p_allow_partial, false));
  charged := (taken->>'taken')::bigint;
  RETURN billing._post(p_org_id, 'action', entry_key, fp, -charged, 0, taken->'allocations',
    jsonb_build_object('meter', p_meter, 'run_id', p_run_id, 'case_unit_id', p_case_unit_id,
      'price_book_revision_id', p_price_book_revision_id, 'request_id', p_request_id,
      'metadata', jsonb_build_object('quantity', trim_scale(p_quantity), 'requested_ucr', p_amount_ucr,
        'shortfall_ucr', p_amount_ucr - charged)));
END $$;

-- Ops correction of the available balance, + or −, with a required reason.
-- A positive adjustment is a new lot (p_expires_at, NULL = never); a negative
-- one consumes unheld credits oldest-expiring first.
CREATE FUNCTION billing.adjust(p_org_id uuid, p_key text, p_amount_ucr bigint, p_reason text,
  p_expires_at timestamptz DEFAULT NULL, p_request_id text DEFAULT NULL)
RETURNS billing.ledger_entry
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE fp text; e billing.ledger_entry; entry_key text := 'adjust:' || p_key; reason text; taken jsonb; refs jsonb;
BEGIN
  PERFORM billing._tenant(p_org_id);
  PERFORM billing._privileged();
  PERFORM billing._check(p_key, abs(p_amount_ucr), false);
  IF p_expires_at IS NOT NULL AND (p_amount_ucr < 0 OR p_expires_at <= now()) THEN RAISE EXCEPTION 'INPUT_INVALID'; END IF;
  reason := billing._reason(p_reason, true);
  fp := billing._fingerprint(jsonb_build_object('fn', 'adjust', 'amount', p_amount_ucr, 'expires_at', extract(epoch FROM p_expires_at)));
  PERFORM billing._lock_account(p_org_id);
  e := billing._entry(p_org_id, entry_key);
  IF e.id IS NOT NULL THEN
    IF e.request_fingerprint <> fp THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF;
    RETURN e;
  END IF;
  refs := jsonb_build_object('reason', reason, 'request_id', p_request_id);
  IF p_amount_ucr > 0 THEN
    e := billing._credit(p_org_id, 'adjustment', 'adjustment', entry_key, fp, p_amount_ucr, p_expires_at, 0, NULL, NULL, refs);
  ELSE
    PERFORM billing._expire_lots(p_org_id);
    taken := billing._take(p_org_id, -p_amount_ucr, 'consume', false);
    e := billing._post(p_org_id, 'adjustment', entry_key, fp, p_amount_ucr, 0, taken->'allocations', refs);
  END IF;
  PERFORM billing._audit('billing.adjust', e);
  RETURN e;
END $$;

-- Corrects one entry with a reversal entry against the same lots. Credit
-- entries (purchase, grant, allowance, bonus, adjustment, refund) need their
-- lots to still hold the credits; debit entries (action, capture, negative
-- adjustment) return credits to their lots. Each entry is reversed once.
CREATE FUNCTION billing.reverse(p_org_id uuid, p_key text, p_entry_id uuid, p_reason text, p_request_id text DEFAULT NULL)
RETURNS billing.ledger_entry
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE fp text; e billing.ledger_entry; entry_key text := 'reverse:' || p_key; reason text;
BEGIN
  PERFORM billing._tenant(p_org_id);
  PERFORM billing._privileged();
  PERFORM billing._check(p_key, 0, true);
  IF p_entry_id IS NULL THEN RAISE EXCEPTION 'INPUT_INVALID'; END IF;
  reason := billing._reason(p_reason, true);
  fp := billing._fingerprint(jsonb_build_object('fn', 'reverse', 'entry_id', p_entry_id));
  PERFORM billing._lock_account(p_org_id);
  e := billing._entry(p_org_id, entry_key);
  IF e.id IS NOT NULL THEN
    IF e.request_fingerprint <> fp THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF;
    RETURN e;
  END IF;
  e := billing._reverse(p_org_id, 'reversal', entry_key, fp, p_entry_id,
    jsonb_build_object('reason', reason, 'request_id', p_request_id));
  PERFORM billing._audit('billing.reverse', e);
  RETURN e;
END $$;

-- Refunds every capture and action charged to a run that is not yet reversed,
-- with the idempotent key run-refund:<run_id> (one refund entry per charge).
-- Groundwork for the run-refund reconciler (L-11). A replay returns the
-- refund entries already written.
CREATE FUNCTION billing.refund_run(p_org_id uuid, p_run_id uuid, p_reason text, p_request_id text DEFAULT NULL)
RETURNS SETOF billing.ledger_entry
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE prefix text := 'run-refund:' || p_run_id || ':'; reason text; t billing.ledger_entry; e billing.ledger_entry;
  user_actor boolean;
BEGIN
  PERFORM billing._tenant(p_org_id);
  PERFORM billing._privileged();
  IF p_run_id IS NULL THEN RAISE EXCEPTION 'INPUT_INVALID'; END IF;
  reason := billing._reason(p_reason, true);
  user_actor := billing.actor_kind(evals.actor_id()) = 'user';
  PERFORM billing._lock_account(p_org_id);
  IF EXISTS (SELECT 1 FROM billing.ledger_entry WHERE org_id = p_org_id AND entry_type = 'refund' AND run_id = p_run_id
      AND left(idempotency_key, length(prefix)) = prefix) THEN
    RETURN QUERY SELECT * FROM billing.ledger_entry WHERE org_id = p_org_id AND entry_type = 'refund' AND run_id = p_run_id
      AND left(idempotency_key, length(prefix)) = prefix ORDER BY account_version;
    RETURN;
  END IF;
  FOR t IN SELECT * FROM billing.ledger_entry x WHERE x.org_id = p_org_id AND x.run_id = p_run_id
      AND x.entry_type IN ('capture','action') AND x.amount_ucr < 0
      AND NOT EXISTS (SELECT 1 FROM billing.ledger_entry r WHERE r.org_id = p_org_id AND r.reverses_entry_id = x.id)
      ORDER BY x.account_version
  LOOP
    e := billing._reverse(p_org_id, 'refund', prefix || t.id,
      billing._fingerprint(jsonb_build_object('fn', 'refund_run', 'run_id', p_run_id, 'entry_id', t.id)), t.id,
      jsonb_build_object('run_id', p_run_id, 'reason', reason, 'request_id', p_request_id));
    IF user_actor THEN PERFORM billing._audit('billing.refund_run', e); END IF;
    RETURN NEXT e;
  END LOOP;
END $$;

-- Daily/hourly job: releases holds past their expiry (state 'expired') and
-- expires the unheld part of due lots, for p_org_id or, when NULL, up to
-- p_limit due accounts per call. Service identities and platform admins only.
CREATE FUNCTION billing.expire_due(p_org_id uuid DEFAULT NULL, p_limit integer DEFAULT 100)
RETURNS TABLE (org_id uuid, holds_expired integer, lots_expired integer, expired_ucr bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
#variable_conflict use_column
DECLARE o uuid; h billing.credit_hold; n integer; x record;
BEGIN
  PERFORM billing._privileged();
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'INPUT_INVALID'; END IF;
  FOR o IN SELECT due.org_id FROM (
      SELECT ch.org_id FROM billing.credit_hold ch WHERE ch.state = 'held' AND ch.expires_at <= now()
      UNION SELECT cl.org_id FROM billing.credit_lot cl WHERE cl.expires_at <= now() AND cl.remaining_ucr > cl.held_ucr
    ) due WHERE p_org_id IS NULL OR due.org_id = p_org_id ORDER BY due.org_id LIMIT p_limit
  LOOP
    PERFORM billing._lock_account(o);
    n := 0;
    FOR h IN SELECT * FROM billing.credit_hold ch WHERE ch.org_id = o AND ch.state = 'held' AND ch.expires_at <= now()
        ORDER BY ch.expires_at, ch.id FOR UPDATE LOOP
      PERFORM billing._release_hold(h, 'expired', 'hold_expired', NULL);
      n := n + 1;
    END LOOP;
    SELECT * INTO x FROM billing._expire_lots(o);
    org_id := o; holds_expired := n; lots_expired := x.n_lots; expired_ucr := x.n_ucr;
    RETURN NEXT;
  END LOOP;
END $$;

-- Checks the §6.9 invariants for one account (the scoped workspace) or, for
-- service identities and platform admins, every account (p_org_id NULL).
-- issues is empty when the account is consistent.
CREATE FUNCTION billing.verify_account(p_org_id uuid DEFAULT NULL)
RETURNS TABLE (org_id uuid, billing_mode text, available_ucr bigint, held_ucr bigint, entries_available_ucr bigint,
  entries_held_ucr bigint, lots_remaining_ucr bigint, lots_held_ucr bigint, open_holds_ucr bigint, issues text[])
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
#variable_conflict use_column
BEGIN
  PERFORM billing._actor();
  IF p_org_id IS NULL OR p_org_id IS DISTINCT FROM evals.org_id() THEN PERFORM billing._privileged(); END IF;
  RETURN QUERY
  WITH acc AS (
    SELECT * FROM billing.credit_account a WHERE p_org_id IS NULL OR a.org_id = p_org_id
  ), ent AS (
    SELECT e.org_id, sum(e.available_delta_ucr)::bigint AS av, sum(e.held_delta_ucr)::bigint AS hd,
      bool_or(e.amount_ucr <> e.available_delta_ucr + e.held_delta_ucr) AS bad
    FROM billing.ledger_entry e JOIN acc ON acc.org_id = e.org_id GROUP BY e.org_id
  ), latest AS (
    SELECT DISTINCT ON (e.org_id) e.org_id, e.available_after_ucr, e.held_after_ucr
    FROM billing.ledger_entry e JOIN acc ON acc.org_id = e.org_id ORDER BY e.org_id, e.account_version DESC
  ), lots AS (
    SELECT l.org_id, sum(l.remaining_ucr)::bigint AS rem, sum(l.held_ucr)::bigint AS hd,
      bool_or(l.remaining_ucr < 0 OR l.held_ucr < 0 OR l.held_ucr > l.remaining_ucr
        OR l.remaining_ucr + l.expired_ucr > l.granted_ucr) AS bad
    FROM billing.credit_lot l JOIN acc ON acc.org_id = l.org_id GROUP BY l.org_id
  ), holds AS (
    SELECT h.org_id, coalesce(sum(h.amount_ucr) FILTER (WHERE h.state = 'held'), 0)::bigint AS open,
      bool_or(h.captured_ucr > h.amount_ucr OR (h.state <> 'held' AND h.captured_ucr + h.released_ucr <> h.amount_ucr)) AS bad
    FROM billing.credit_hold h JOIN acc ON acc.org_id = h.org_id GROUP BY h.org_id
  ), effects AS (
    -- Every lot's state must equal the sum of the entries' allocations on it.
    SELECT e.org_id, (x.value->>'lot')::uuid AS lot_id,
      sum(CASE WHEN e.entry_type IN ('hold','release') THEN 0
               WHEN e.entry_type = 'capture' THEN -(x.value->>'ucr')::bigint
               WHEN e.amount_ucr > 0 THEN (x.value->>'ucr')::bigint
               ELSE -(x.value->>'ucr')::bigint END)::bigint AS rem,
      sum(CASE WHEN e.entry_type = 'hold' THEN (x.value->>'ucr')::bigint
               WHEN e.entry_type IN ('release','capture') THEN -(x.value->>'ucr')::bigint
               ELSE 0 END)::bigint AS hd
    FROM billing.ledger_entry e JOIN acc ON acc.org_id = e.org_id
    CROSS JOIN LATERAL jsonb_array_elements(e.lot_allocations) x
    GROUP BY e.org_id, (x.value->>'lot')::uuid
  ), lot_drift AS (
    SELECT coalesce(l.org_id, f.org_id) AS org_id, true AS bad
    FROM (SELECT cl.* FROM billing.credit_lot cl JOIN acc ON acc.org_id = cl.org_id) l
    FULL JOIN effects f ON f.lot_id = l.id
    WHERE l.id IS NULL OR f.lot_id IS NULL OR f.rem <> l.remaining_ucr OR f.hd <> l.held_ucr
    GROUP BY coalesce(l.org_id, f.org_id)
  )
  SELECT acc.org_id, acc.billing_mode, acc.available_ucr, acc.held_ucr, coalesce(ent.av, 0), coalesce(ent.hd, 0),
    coalesce(lots.rem, 0), coalesce(lots.hd, 0), coalesce(holds.open, 0),
    array_remove(ARRAY[
      CASE WHEN acc.available_ucr < 0 THEN 'available_negative' END,
      CASE WHEN acc.held_ucr < 0 THEN 'held_negative' END,
      CASE WHEN coalesce(ent.av, 0) <> acc.available_ucr THEN 'entries_available_mismatch' END,
      CASE WHEN coalesce(ent.hd, 0) <> acc.held_ucr THEN 'entries_held_mismatch' END,
      CASE WHEN coalesce(ent.bad, false) THEN 'entry_amount_mismatch' END,
      CASE WHEN latest.org_id IS NOT NULL AND (latest.available_after_ucr <> acc.available_ucr
        OR latest.held_after_ucr <> acc.held_ucr) THEN 'running_balance_mismatch' END,
      CASE WHEN coalesce(lots.rem, 0) <> acc.available_ucr + acc.held_ucr THEN 'lots_balance_mismatch' END,
      CASE WHEN coalesce(lots.hd, 0) <> acc.held_ucr THEN 'lots_held_mismatch' END,
      CASE WHEN coalesce(lots.bad, false) THEN 'lot_out_of_bounds' END,
      CASE WHEN coalesce(holds.open, 0) <> acc.held_ucr THEN 'open_holds_mismatch' END,
      CASE WHEN coalesce(holds.bad, false) THEN 'hold_out_of_bounds' END,
      CASE WHEN lot_drift.org_id IS NOT NULL THEN 'lot_ledger_mismatch' END
    ]::text[], NULL)
  FROM acc
  LEFT JOIN ent ON ent.org_id = acc.org_id
  LEFT JOIN latest ON latest.org_id = acc.org_id
  LEFT JOIN lots ON lots.org_id = acc.org_id
  LEFT JOIN holds ON holds.org_id = acc.org_id
  LEFT JOIN lot_drift ON lot_drift.org_id = acc.org_id
  ORDER BY acc.org_id;
END $$;

-- The nightly verifier: checks every account and records the outcome.
CREATE FUNCTION billing.record_verification()
RETURNS billing.verification_run
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE r billing.verification_run;
BEGIN
  PERFORM billing._privileged();
  INSERT INTO billing.verification_run (actor_id, accounts, drift_accounts, drift)
  SELECT billing._actor(), count(*)::integer, (count(*) FILTER (WHERE cardinality(v.issues) > 0))::integer,
    coalesce(jsonb_agg(jsonb_build_object('org_id', v.org_id, 'issues', to_jsonb(v.issues)) ORDER BY v.org_id)
      FILTER (WHERE cardinality(v.issues) > 0), '[]'::jsonb)
  FROM billing.verify_account(NULL) v
  RETURNING * INTO r;
  RETURN r;
END $$;

/* -------------------------------------------- accounts for workspaces --- */

-- New workspaces get an account, and billing_mode follows the plan.
CREATE FUNCTION billing.sync_account_mode() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  INSERT INTO billing.credit_account (org_id, billing_mode) VALUES (NEW.org_id, billing.mode_for_plan(NEW.plan))
  ON CONFLICT (org_id) DO UPDATE SET billing_mode = EXCLUDED.billing_mode,
    version = billing.credit_account.version + 1, updated_at = now()
  WHERE billing.credit_account.billing_mode IS DISTINCT FROM EXCLUDED.billing_mode;
  RETURN NULL;
END $$;

INSERT INTO billing.credit_account (org_id, billing_mode)
SELECT w.id, billing.mode_for_plan(coalesce(e.plan, 'managed'))
FROM evals.workspace w LEFT JOIN evals.workspace_entitlement e ON e.org_id = w.id
ON CONFLICT (org_id) DO NOTHING;

CREATE TRIGGER billing_account_sync AFTER INSERT OR UPDATE OF plan ON evals.workspace_entitlement
  FOR EACH ROW EXECUTE FUNCTION billing.sync_account_mode();

/* ---------------------------------------------------------- execution --- */

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA billing FROM PUBLIC;
-- Tenant-scoped movements: the web runtime (and the scheduler, a member of
-- evals_runtime) and every worker role.
DO $$ DECLARE r text; BEGIN
  FOREACH r IN ARRAY ARRAY['evals_runtime','evals_worker','evals_browser','evals_document'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION
        billing.hold(uuid, text, bigint, timestamptz, uuid, uuid, uuid, uuid, text),
        billing.capture(uuid, text, bigint, text, jsonb),
        billing.release(uuid, text, text, text),
        billing.charge_action(uuid, text, text, bigint, numeric, uuid, uuid, uuid, boolean, text),
        billing.verify_account(uuid) TO %I', r);
    END IF;
  END LOOP;
END $$;
-- Credit creation, corrections and platform jobs: the web runtime and the
-- scheduler only, and inside them only platform admins or service identities.
GRANT EXECUTE ON FUNCTION
  billing.grant(uuid, text, bigint, text, timestamptz, text, text, text, text, text),
  billing.adjust(uuid, text, bigint, text, timestamptz, text),
  billing.reverse(uuid, text, uuid, text, text),
  billing.refund_run(uuid, uuid, text, text),
  billing.expire_due(uuid, integer),
  billing.record_verification()
TO evals_runtime;

COMMIT;
