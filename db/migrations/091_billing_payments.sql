-- Billing payments: Stripe top-ups, auto-recharge, webhooks, refunds and
-- disputes (launch spec v2 §6.5, §6.6, §6.10, §6.14–§6.16; package L-12).
--
-- Money lives in Stripe, credits in the L-09 ledger (migration 084). This
-- migration adds what joins them:
--   billing_profile     fiscal details per workspace (legal name, NIF or VAT
--                       ID with its VIES status, address, billing email) and
--                       the tax treatment they imply (§6.14). Businesses only
--                       (D-05): every profile carries a business declaration.
--   stripe_customer     the Stripe customer and saved card per workspace and
--                       mode (test and live customers never mix).
--   top_up_order        one per Checkout session or auto-recharge charge:
--                       pack, credits, net/VAT/gross, tax treatment and a
--                       snapshot of the fiscal details, Stripe ids, status.
--   stripe_event        every signed webhook event (event id primary key),
--                       received and processed timestamps and status, so a
--                       replay is recognised and processing is idempotent.
--   first_bonus_claim   the +20 % first top-up bonus, once per workspace,
--                       per company domain and per tax ID (§6.5).
--   auto_recharge       settings and the threshold-crossing state (§6.6).
--   spend_cap           monthly, per-run and per-schedule caps (§6.10;
--                       enforced by L-11, edited by L-15).
--   alert_state         per-period deduplication of billing emails and
--                       alerts (receipts, auto-recharge outcomes, caps).
--
-- Every amount is derived here, not trusted from the caller: the pack table,
-- the bonus rule, the VAT rate for the treatment, the credits and the euro
-- unit price. A paid order becomes a `purchase` lot (unit price paid per
-- credit) and, when a bonus applies, a `bonus` lot (no price, so no VAT),
-- both lasting 24 months (D-10), through the L-09 internal helpers in the
-- same transaction as the order update. Keys `purchase:<order>` and
-- `purchase-bonus:<order>` make a replayed or duplicated event (Checkout
-- completion and payment_intent.succeeded both report one payment) produce
-- one purchase.
--
-- Ledger change: a money refund of an untouched purchase (D-10, 14 days) is
-- a `refund` entry that reverses the purchase and bonus entries, so `refund`
-- may now be negative when it reverses an entry. Run refunds (L-09/L-11)
-- stay positive. Disputes freeze the account; a lost dispute writes a
-- `chargeback` entry that removes what is left of the order's credits (never
-- below zero; the shortfall is recorded for the ops queue).
--
-- Writes go only through the SECURITY DEFINER functions below. Owner actions
-- (profile, checkout, auto-recharge, caps) accept workspace owners, platform
-- admins and service identities; payment, refund and dispute recording accept
-- platform admins and service identities only (the webhook runs as
-- system:stripe-webhook). Tables have RLS by org_id; the runtime role reads
-- its scoped workspace's rows and writes none.
--
-- Forward repair: additive. The rollback refuses once any order, profile,
-- event, claim or setting exists, or a negative refund entry exists.
BEGIN;

/* ------------------------------------------------------- ledger change --- */

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
    -- Credits returned (run refunds) are positive; a money refund removes the
    -- purchased credits by reversing the purchase or bonus entry.
    WHEN 'refund' THEN held_delta_ucr = 0 AND (available_delta_ucr > 0 OR (available_delta_ucr < 0 AND reverses_entry_id IS NOT NULL))
    ELSE available_delta_ucr > 0 AND held_delta_ucr = 0 END);

/* ------------------------------------------------------------- tables --- */

CREATE TABLE billing.billing_profile (
  org_id uuid PRIMARY KEY REFERENCES billing.credit_account(org_id),
  legal_name text NOT NULL CHECK (length(legal_name) BETWEEN 2 AND 200),
  country text NOT NULL CHECK (country ~ '^[A-Z]{2}$'),
  -- Normalised: upper case, no separators. EU VAT IDs keep their prefix (EL for Greece).
  tax_id text NOT NULL CHECK (tax_id ~ '^[A-Z0-9]{3,30}$'),
  tax_id_kind text NOT NULL CHECK (tax_id_kind IN ('es_nif','eu_vat','non_eu_business')),
  vies_status text NOT NULL CHECK (vies_status IN ('not_required','valid','invalid','unavailable')),
  vies_checked_at timestamptz,
  vies_consultation text CHECK (vies_consultation IS NULL OR length(vies_consultation) BETWEEN 1 AND 100),
  -- NULL while the treatment needs manual review (VIES unavailable, special territories).
  tax_treatment text CHECK (tax_treatment IN ('es_vat','eu_reverse_charge','non_eu_not_subject')),
  tax_review_reason text CHECK (tax_review_reason IS NULL OR tax_review_reason ~ '^[a-z][a-z0-9_]{2,63}$'),
  address_line1 text NOT NULL CHECK (length(address_line1) BETWEEN 2 AND 200),
  address_line2 text CHECK (address_line2 IS NULL OR length(address_line2) BETWEEN 1 AND 200),
  postal_code text NOT NULL CHECK (length(postal_code) BETWEEN 2 AND 20),
  city text NOT NULL CHECK (length(city) BETWEEN 1 AND 100),
  region text CHECK (region IS NULL OR length(region) BETWEEN 1 AND 100),
  billing_email text NOT NULL CHECK (length(billing_email) BETWEEN 6 AND 254 AND billing_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  business_declared_at timestamptz NOT NULL,
  -- Ops lifted the new-account purchase limits (§6.15).
  limits_lifted_at timestamptz,
  version bigint NOT NULL DEFAULT 1,
  updated_by text NOT NULL CHECK (length(updated_by) BETWEEN 1 AND 255),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((tax_treatment IS NULL) = (tax_review_reason IS NOT NULL))
);

CREATE TABLE billing.stripe_customer (
  org_id uuid NOT NULL REFERENCES billing.credit_account(org_id),
  livemode boolean NOT NULL,
  customer_id text NOT NULL UNIQUE CHECK (customer_id ~ '^cus_[A-Za-z0-9]{4,64}$'),
  -- The card saved at first purchase (setup_future_usage=off_session) for auto-recharge.
  payment_method_id text CHECK (payment_method_id IS NULL OR payment_method_id ~ '^(pm|card|src)_[A-Za-z0-9]{4,64}$'),
  card_brand text CHECK (card_brand IS NULL OR card_brand ~ '^[a-z_]{2,30}$'),
  card_last4 text CHECK (card_last4 IS NULL OR card_last4 ~ '^[0-9]{4}$'),
  card_country text CHECK (card_country IS NULL OR card_country ~ '^[A-Z]{2}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, livemode)
);

CREATE TABLE billing.top_up_order (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES billing.credit_account(org_id),
  kind text NOT NULL CHECK (kind IN ('checkout','auto_recharge')),
  livemode boolean NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','failed','canceled','expired',
    'refund_pending','refunded','disputed','charged_back')),
  -- The pack, by its net price; 1 credit = 1 euro cent.
  net_cents bigint NOT NULL CHECK (net_cents IN (2000,5000,10000,25000,50000)),
  vat_rate_bp integer NOT NULL CHECK (vat_rate_bp IN (0,2100)),
  vat_cents bigint NOT NULL CHECK (vat_cents >= 0),
  gross_cents bigint NOT NULL,
  currency text NOT NULL DEFAULT 'eur' CHECK (currency = 'eur'),
  tax_treatment text NOT NULL CHECK (tax_treatment IN ('es_vat','eu_reverse_charge','non_eu_not_subject')),
  -- The fiscal details the price was computed from (L-13 invoices from it).
  tax_snapshot jsonb NOT NULL CHECK (jsonb_typeof(tax_snapshot) = 'object'),
  base_ucr bigint NOT NULL CHECK (base_ucr > 0),
  pack_bonus_ucr bigint NOT NULL CHECK (pack_bonus_ucr >= 0),
  -- Offered when the order was created; whether it applies is settled at payment.
  first_bonus_ucr bigint NOT NULL DEFAULT 0 CHECK (first_bonus_ucr >= 0),
  bonus_ucr bigint CHECK (bonus_ucr IS NULL OR bonus_ucr >= 0),
  bonus_kind text CHECK (bonus_kind IS NULL OR bonus_kind IN ('pack','first_top_up')),
  first_paid boolean,
  buyer_domain text CHECK (buyer_domain IS NULL OR (length(buyer_domain) BETWEEN 3 AND 253 AND buyer_domain = lower(buyer_domain))),
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 3 AND 200),
  created_by text NOT NULL CHECK (length(created_by) BETWEEN 1 AND 255),
  request_id text CHECK (request_id IS NULL OR length(request_id) BETWEEN 1 AND 200),
  stripe_checkout_session_id text UNIQUE CHECK (stripe_checkout_session_id IS NULL OR stripe_checkout_session_id ~ '^cs_(test|live)_[A-Za-z0-9]{4,200}$'),
  checkout_expires_at timestamptz,
  stripe_payment_intent_id text UNIQUE CHECK (stripe_payment_intent_id IS NULL OR stripe_payment_intent_id ~ '^pi_[A-Za-z0-9]{4,64}$'),
  stripe_charge_id text UNIQUE CHECK (stripe_charge_id IS NULL OR stripe_charge_id ~ '^(ch|py)_[A-Za-z0-9]{4,64}$'),
  stripe_customer_id text CHECK (stripe_customer_id IS NULL OR stripe_customer_id ~ '^cus_[A-Za-z0-9]{4,64}$'),
  stripe_refund_id text CHECK (stripe_refund_id IS NULL OR stripe_refund_id ~ '^(re|pyr)_[A-Za-z0-9]{4,64}$'),
  stripe_dispute_id text CHECK (stripe_dispute_id IS NULL OR stripe_dispute_id ~ '^(dp|du)_[A-Za-z0-9]{4,64}$'),
  card_country text CHECK (card_country IS NULL OR card_country ~ '^[A-Z]{2}$'),
  risk_flags text[] NOT NULL DEFAULT '{}',
  failure_code text CHECK (failure_code IS NULL OR failure_code ~ '^[a-z][a-z0-9_]{1,63}$'),
  failure_count integer NOT NULL DEFAULT 0 CHECK (failure_count >= 0),
  purchase_entry_id uuid,
  bonus_entry_id uuid,
  -- First-touch attribution of the workspace, copied on its first payment (L-02).
  attribution jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(attribution) = 'object' AND octet_length(attribution::text) <= 4096),
  auto_recharge_crossing bigint,
  auto_recharge_attempt integer CHECK (auto_recharge_attempt IS NULL OR auto_recharge_attempt BETWEEN 1 AND 2),
  -- Invoice issued for the order (L-13 adds the invoice table and the reference).
  invoice_id uuid,
  refund_reason text CHECK (refund_reason IS NULL OR length(refund_reason) BETWEEN 3 AND 2000),
  paid_at timestamptz,
  failed_at timestamptz,
  refunded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, idempotency_key),
  UNIQUE (org_id, id),
  CHECK (gross_cents = net_cents + vat_cents),
  CHECK (vat_cents = (net_cents * vat_rate_bp + 5000) / 10000),
  CHECK ((tax_treatment = 'es_vat') = (vat_rate_bp = 2100)),
  CHECK (base_ucr = net_cents * 1000000),
  CHECK ((kind = 'auto_recharge') = (auto_recharge_crossing IS NOT NULL)),
  CHECK (status NOT IN ('paid','refund_pending','refunded','disputed','charged_back')
         OR (paid_at IS NOT NULL AND purchase_entry_id IS NOT NULL AND bonus_ucr IS NOT NULL AND first_paid IS NOT NULL))
);
CREATE INDEX top_up_order_recent ON billing.top_up_order (org_id, created_at DESC, id DESC);
CREATE INDEX top_up_order_paid ON billing.top_up_order (org_id, paid_at) WHERE paid_at IS NOT NULL;
CREATE INDEX top_up_order_open ON billing.top_up_order (org_id) WHERE status = 'pending';
CREATE UNIQUE INDEX top_up_order_auto_attempt ON billing.top_up_order (org_id, auto_recharge_crossing, auto_recharge_attempt)
  WHERE kind = 'auto_recharge';

CREATE TABLE billing.stripe_event (
  id text PRIMARY KEY CHECK (id ~ '^evt_[A-Za-z0-9]{4,200}$'),
  type text NOT NULL CHECK (type ~ '^[a-z_.]{3,100}$'),
  livemode boolean NOT NULL,
  api_version text CHECK (api_version IS NULL OR length(api_version) BETWEEN 1 AND 40),
  object_id text CHECK (object_id IS NULL OR length(object_id) BETWEEN 3 AND 255),
  payload_sha256 text NOT NULL CHECK (payload_sha256 ~ '^[0-9a-f]{64}$'),
  stripe_created_at timestamptz NOT NULL,
  org_id uuid REFERENCES billing.credit_account(org_id),
  order_id uuid,
  status text NOT NULL DEFAULT 'received' CHECK (status IN ('received','processed','ignored','failed')),
  outcome text CHECK (outcome IS NULL OR outcome ~ '^[a-z][a-z0-9_]{1,63}$'),
  deliveries integer NOT NULL DEFAULT 1 CHECK (deliveries > 0),
  received_at timestamptz NOT NULL DEFAULT now(),
  last_received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  CHECK ((status IN ('processed','ignored')) = (processed_at IS NOT NULL))
);
CREATE INDEX stripe_event_unprocessed ON billing.stripe_event (received_at) WHERE status IN ('received','failed');
CREATE INDEX stripe_event_order ON billing.stripe_event (org_id, order_id) WHERE order_id IS NOT NULL;

CREATE TABLE billing.first_bonus_claim (
  -- 'org:<uuid>', 'domain:<company domain>' or 'tax:<country>:<tax id>'.
  claim_key text PRIMARY KEY CHECK (claim_key ~ '^(org|domain|tax):[a-z0-9A-Z.:-]{3,255}$'),
  org_id uuid NOT NULL REFERENCES billing.credit_account(org_id),
  order_id uuid NOT NULL,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (org_id, order_id) REFERENCES billing.top_up_order(org_id, id)
);

CREATE TABLE billing.auto_recharge (
  org_id uuid PRIMARY KEY REFERENCES billing.credit_account(org_id),
  enabled boolean NOT NULL DEFAULT false,
  threshold_ucr bigint NOT NULL DEFAULT 500000000 CHECK (threshold_ucr BETWEEN 1000000 AND 100000000000),
  pack_cents bigint NOT NULL DEFAULT 5000 CHECK (pack_cents IN (2000,5000,10000,25000,50000)),
  monthly_max_count integer NOT NULL DEFAULT 3 CHECK (monthly_max_count BETWEEN 1 AND 31),
  monthly_max_cents bigint NOT NULL DEFAULT 30000 CHECK (monthly_max_cents BETWEEN 2000 AND 1000000),
  -- Armed while the balance is at or above the threshold; firing disarms it,
  -- so one crossing below the threshold fires one recharge.
  armed boolean NOT NULL DEFAULT true,
  crossing_seq bigint NOT NULL DEFAULT 0 CHECK (crossing_seq >= 0),
  in_flight_order_id uuid,
  failures integer NOT NULL DEFAULT 0 CHECK (failures BETWEEN 0 AND 2),
  retry_after timestamptz,
  last_failure_code text CHECK (last_failure_code IS NULL OR last_failure_code ~ '^[a-z][a-z0-9_]{1,63}$'),
  last_success_at timestamptz,
  disabled_reason text CHECK (disabled_reason IS NULL OR disabled_reason IN ('payment_failed','owner')),
  updated_by text NOT NULL CHECK (length(updated_by) BETWEEN 1 AND 255),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (org_id, in_flight_order_id) REFERENCES billing.top_up_order(org_id, id)
);

CREATE TABLE billing.spend_cap (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES billing.credit_account(org_id),
  scope text NOT NULL CHECK (scope IN ('workspace_monthly','per_run','schedule')),
  -- The schedule for scope 'schedule'; NULL otherwise.
  subject_id uuid,
  -- A fixed cap in µcr, or (per run) a multiple of the run's p90 estimate; NULL = default.
  cap_ucr bigint CHECK (cap_ucr IS NULL OR cap_ucr > 0),
  p90_multiplier numeric(5,2) CHECK (p90_multiplier IS NULL OR p90_multiplier BETWEEN 1 AND 100),
  updated_by text NOT NULL CHECK (length(updated_by) BETWEEN 1 AND 255),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((scope = 'schedule') = (subject_id IS NOT NULL)),
  CHECK (scope = 'per_run' OR p90_multiplier IS NULL)
);
CREATE UNIQUE INDEX spend_cap_scope ON billing.spend_cap (org_id, scope, coalesce(subject_id, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE TABLE billing.alert_state (
  org_id uuid NOT NULL REFERENCES billing.credit_account(org_id),
  kind text NOT NULL CHECK (kind ~ '^[a-z][a-z0-9_]{1,63}$'),
  -- The deduplication period or subject: '2026-10', an order id, a threshold…
  period_key text NOT NULL CHECK (length(period_key) BETWEEN 1 AND 120),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(payload) = 'object'),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, kind, period_key)
);

/* --------------------------------------------------------- read access --- */

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['billing_profile','stripe_customer','top_up_order','stripe_event','first_bonus_claim',
      'auto_recharge','spend_cap','alert_state'] LOOP
    EXECUTE format('ALTER TABLE billing.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE billing.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY tenant_read ON billing.%I FOR SELECT USING (org_id = nullif(current_setting(''evals.org_id'', true), '''')::uuid)', t);
  END LOOP;
END $$;
REVOKE ALL ON billing.billing_profile, billing.stripe_customer, billing.top_up_order, billing.stripe_event,
  billing.first_bonus_claim, billing.auto_recharge, billing.spend_cap, billing.alert_state FROM PUBLIC;
GRANT SELECT ON billing.billing_profile, billing.stripe_customer, billing.top_up_order, billing.stripe_event,
  billing.first_bonus_claim, billing.auto_recharge, billing.spend_cap, billing.alert_state TO evals_runtime;

/* ------------------------------------------------------------- helpers --- */

-- Owner actions: workspace owners, platform admins and service identities.
CREATE FUNCTION billing._owner(p_org_id uuid) RETURNS void
LANGUAGE plpgsql STABLE SET search_path = pg_catalog AS $$
DECLARE actor text := billing._actor();
BEGIN
  PERFORM billing._tenant(p_org_id);
  IF billing.actor_kind(actor) = 'system' OR evals.is_admin() THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM evals.membership m JOIN evals.workspace w ON w.id = m.org_id
      WHERE m.org_id = p_org_id AND m.user_id = actor AND m.role = 'owner' AND w.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'SCOPE_DENIED' USING ERRCODE = '42501';
  END IF;
END $$;

-- Pack bonus (§6.6), in percent of the base credits. Raises on an unknown pack.
CREATE FUNCTION billing.pack_bonus_percent(p_net_cents bigint) RETURNS integer
LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog AS $$
BEGIN
  RETURN CASE p_net_cents WHEN 2000 THEN 0 WHEN 5000 THEN 3 WHEN 10000 THEN 5 WHEN 25000 THEN 8 WHEN 50000 THEN 10
    ELSE NULL END;
END $$;

-- Purchased credits and their bonus last 24 months, to the end of that UTC day (D-10).
CREATE FUNCTION billing.purchase_expiry(p_at timestamptz) RETURNS timestamptz
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$
  SELECT (date_trunc('day', (p_at AT TIME ZONE 'UTC') + interval '24 months') + interval '1 day') AT TIME ZONE 'UTC'
$$;

CREATE FUNCTION billing._audit_event(p_org_id uuid, p_action text, p_subject text, p_details jsonb) RETURNS void
LANGUAGE sql SET search_path = pg_catalog AS $$
  INSERT INTO evals.audit_event (org_id, actor_id, action, subject_id, details)
  VALUES (p_org_id, billing._actor(), p_action, p_subject, p_details)
$$;

CREATE FUNCTION billing._order(p_org_id uuid, p_order_id uuid) RETURNS billing.top_up_order
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE o billing.top_up_order;
BEGIN
  SELECT * INTO o FROM billing.top_up_order WHERE org_id = p_org_id AND id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_NOT_FOUND'; END IF;
  RETURN o;
END $$;

-- Whether the first top-up bonus is still open for the workspace, its buyer's
-- company domain and its tax ID.
CREATE FUNCTION billing._first_bonus_open(p_org_id uuid, p_domain text, p_tax_key text) RETURNS boolean
LANGUAGE sql STABLE SET search_path = pg_catalog AS $$
  SELECT NOT EXISTS (SELECT 1 FROM billing.top_up_order WHERE org_id = p_org_id AND paid_at IS NOT NULL)
     AND NOT EXISTS (SELECT 1 FROM billing.first_bonus_claim WHERE claim_key = 'org:' || p_org_id
                       OR (p_domain IS NOT NULL AND claim_key = 'domain:' || p_domain)
                       OR (p_tax_key IS NOT NULL AND claim_key = 'tax:' || p_tax_key))
$$;

-- New accounts (§6.15): until 30 days after the first payment, purchases in
-- flight or kept total at most €100 net and at most 3 top-ups start per 24 h.
CREATE FUNCTION billing._purchase_limits(p_org_id uuid,
  OUT is_new boolean, OUT window_net_cents bigint, OUT recent_count integer, OUT lifted boolean)
LANGUAGE plpgsql STABLE SET search_path = pg_catalog AS $$
DECLARE first_paid timestamptz;
BEGIN
  SELECT min(paid_at) INTO first_paid FROM billing.top_up_order WHERE org_id = p_org_id AND paid_at IS NOT NULL;
  is_new := first_paid IS NULL OR first_paid > now() - interval '30 days';
  SELECT coalesce(sum(net_cents), 0)::bigint INTO window_net_cents FROM billing.top_up_order
    WHERE org_id = p_org_id AND status IN ('pending','paid','refund_pending','disputed','charged_back');
  SELECT count(*)::integer INTO recent_count FROM billing.top_up_order
    WHERE org_id = p_org_id AND created_at > now() - interval '24 hours' AND status NOT IN ('canceled','expired');
  SELECT p.limits_lifted_at IS NOT NULL INTO lifted FROM billing.billing_profile p WHERE p.org_id = p_org_id;
  lifted := coalesce(lifted, false);
END $$;

-- Expires checkout orders whose session has lapsed (the expired webhook may be late).
CREATE FUNCTION billing._expire_stale_checkouts(p_org_id uuid) RETURNS void
LANGUAGE sql SET search_path = pg_catalog AS $$
  UPDATE billing.top_up_order SET status = CASE WHEN stripe_checkout_session_id IS NULL THEN 'canceled' ELSE 'expired' END,
    updated_at = now()
  WHERE org_id = p_org_id AND kind = 'checkout' AND status = 'pending'
    AND ((checkout_expires_at IS NOT NULL AND checkout_expires_at < now() - interval '5 minutes')
      OR (stripe_checkout_session_id IS NULL AND created_at < now() - interval '1 hour'))
$$;

-- Creates an order from the pack and the workspace's billing profile. Every
-- amount is derived here. Raises BILLING_PROFILE_REQUIRED, TAX_REVIEW_REQUIRED,
-- ACCOUNT_FROZEN, PURCHASE_LIMIT, PURCHASE_RATE_LIMIT or INPUT_INVALID.
CREATE FUNCTION billing._create_order(p_org_id uuid, p_kind text, p_key text, p_net_cents bigint, p_livemode boolean,
  p_buyer_domain text, p_crossing bigint, p_attempt integer, p_request_id text)
RETURNS billing.top_up_order
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE a billing.credit_account; p billing.billing_profile; o billing.top_up_order; lim record; pct integer;
  base bigint; rate integer; tax_key text; snapshot jsonb;
BEGIN
  pct := billing.pack_bonus_percent(p_net_cents);
  IF pct IS NULL OR p_kind NOT IN ('checkout','auto_recharge') OR p_livemode IS NULL
     OR p_key IS NULL OR p_key !~ '^[A-Za-z0-9][A-Za-z0-9:._/@-]{2,199}$'
     OR (p_buyer_domain IS NOT NULL AND (p_buyer_domain !~ '^[a-z0-9.-]{3,253}$')) THEN
    RAISE EXCEPTION 'INPUT_INVALID';
  END IF;
  a := billing._lock_account(p_org_id);
  SELECT * INTO o FROM billing.top_up_order WHERE org_id = p_org_id AND idempotency_key = p_key;
  IF FOUND THEN
    IF o.net_cents <> p_net_cents OR o.kind <> p_kind OR o.livemode <> p_livemode THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF;
    RETURN o;
  END IF;
  IF a.frozen_reason IS NOT NULL THEN RAISE EXCEPTION 'ACCOUNT_FROZEN'; END IF;
  SELECT * INTO p FROM billing.billing_profile WHERE org_id = p_org_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'BILLING_PROFILE_REQUIRED'; END IF;
  IF p.tax_treatment IS NULL THEN RAISE EXCEPTION 'TAX_REVIEW_REQUIRED'; END IF;
  PERFORM billing._expire_stale_checkouts(p_org_id);
  SELECT * INTO lim FROM billing._purchase_limits(p_org_id);
  IF lim.is_new AND NOT lim.lifted THEN
    IF lim.window_net_cents + p_net_cents > 10000 THEN RAISE EXCEPTION 'PURCHASE_LIMIT'; END IF;
    IF lim.recent_count >= 3 THEN RAISE EXCEPTION 'PURCHASE_RATE_LIMIT'; END IF;
  END IF;
  base := p_net_cents * 1000000;
  rate := CASE p.tax_treatment WHEN 'es_vat' THEN 2100 ELSE 0 END;
  tax_key := p.country || ':' || p.tax_id;
  snapshot := jsonb_build_object('legal_name', p.legal_name, 'country', p.country, 'tax_id', p.tax_id,
    'tax_id_kind', p.tax_id_kind, 'vies_status', p.vies_status, 'vies_checked_at', p.vies_checked_at,
    'vies_consultation', p.vies_consultation, 'address_line1', p.address_line1, 'address_line2', p.address_line2,
    'postal_code', p.postal_code, 'city', p.city, 'region', p.region, 'billing_email', p.billing_email,
    'profile_version', p.version);
  INSERT INTO billing.top_up_order (org_id, kind, livemode, net_cents, vat_rate_bp, vat_cents, gross_cents, tax_treatment,
    tax_snapshot, base_ucr, pack_bonus_ucr, first_bonus_ucr, buyer_domain, idempotency_key, created_by, request_id,
    auto_recharge_crossing, auto_recharge_attempt)
  VALUES (p_org_id, p_kind, p_livemode, p_net_cents, rate, (p_net_cents * rate + 5000) / 10000,
    p_net_cents + (p_net_cents * rate + 5000) / 10000, p.tax_treatment, snapshot, base, base * pct / 100,
    CASE WHEN billing._first_bonus_open(p_org_id, p_buyer_domain, tax_key) THEN base * 20 / 100 ELSE 0 END,
    p_buyer_domain, p_key, billing._actor(), p_request_id, p_crossing, p_attempt)
  RETURNING * INTO o;
  RETURN o;
END $$;

-- Takes what is left (unheld) of an order's lots: the purchase lot first,
-- then its bonus. Returns the allocations and the total taken.
CREATE FUNCTION billing._take_order_lots(p_org_id uuid, p_order_id uuid, p_limit bigint, OUT allocations jsonb, OUT taken bigint)
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE l record; chunk bigint;
BEGIN
  allocations := '[]'::jsonb; taken := 0;
  FOR l IN SELECT id, remaining_ucr - held_ucr AS free FROM billing.credit_lot
      WHERE org_id = p_org_id AND order_id = p_order_id AND remaining_ucr > held_ucr
      ORDER BY (source = 'bonus'), created_at, id FOR UPDATE LOOP
    chunk := least(l.free, p_limit - taken);
    EXIT WHEN chunk <= 0;
    UPDATE billing.credit_lot SET remaining_ucr = remaining_ucr - chunk WHERE id = l.id;
    allocations := allocations || jsonb_build_array(jsonb_build_object('lot', l.id, 'ucr', chunk));
    taken := taken + chunk;
  END LOOP;
END $$;

/* ---------------------------------------------------- owner functions --- */

-- Saves the workspace's fiscal details. The caller (lib/billing/tax.ts)
-- validated the tax ID, ran the VIES check and derived the treatment; the
-- database checks that the combination is coherent.
CREATE FUNCTION billing.save_profile(p_org_id uuid, p_legal_name text, p_country text, p_tax_id text, p_tax_id_kind text,
  p_vies_status text, p_vies_consultation text, p_tax_treatment text, p_tax_review_reason text,
  p_address_line1 text, p_address_line2 text, p_postal_code text, p_city text, p_region text, p_billing_email text,
  p_request_id text DEFAULT NULL)
RETURNS billing.billing_profile
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE p billing.billing_profile; before billing.billing_profile;
BEGIN
  PERFORM billing._owner(p_org_id);
  IF (p_tax_id_kind = 'es_nif' AND (p_country <> 'ES' OR p_vies_status <> 'not_required'
        OR p_tax_treatment IS DISTINCT FROM CASE WHEN p_tax_review_reason IS NULL THEN 'es_vat' END))
     OR (p_tax_id_kind = 'eu_vat' AND (p_country = 'ES' OR p_vies_status = 'not_required'
        OR (p_vies_status = 'valid' AND p_tax_treatment IS DISTINCT FROM 'eu_reverse_charge')
        OR (p_vies_status = 'invalid' AND p_tax_treatment IS DISTINCT FROM 'es_vat')
        OR (p_vies_status = 'unavailable' AND p_tax_treatment IS NOT NULL)))
     OR (p_tax_id_kind = 'non_eu_business' AND (p_country = 'ES' OR p_vies_status <> 'not_required'
        OR p_tax_treatment IS DISTINCT FROM CASE WHEN p_tax_review_reason IS NULL THEN 'non_eu_not_subject' END))
     OR p_tax_id_kind IS NULL OR p_tax_id_kind NOT IN ('es_nif','eu_vat','non_eu_business') THEN
    RAISE EXCEPTION 'INPUT_INVALID';
  END IF;
  PERFORM billing._lock_account(p_org_id);
  SELECT * INTO before FROM billing.billing_profile WHERE org_id = p_org_id;
  INSERT INTO billing.billing_profile AS bp (org_id, legal_name, country, tax_id, tax_id_kind, vies_status, vies_checked_at,
    vies_consultation, tax_treatment, tax_review_reason, address_line1, address_line2, postal_code, city, region,
    billing_email, business_declared_at, updated_by)
  VALUES (p_org_id, btrim(p_legal_name), p_country, p_tax_id, p_tax_id_kind, p_vies_status,
    CASE WHEN p_vies_status <> 'not_required' THEN now() END, nullif(btrim(p_vies_consultation), ''), p_tax_treatment,
    p_tax_review_reason, btrim(p_address_line1), nullif(btrim(p_address_line2), ''), btrim(p_postal_code), btrim(p_city),
    nullif(btrim(p_region), ''), lower(btrim(p_billing_email)), now(), billing._actor())
  ON CONFLICT (org_id) DO UPDATE SET legal_name = EXCLUDED.legal_name, country = EXCLUDED.country, tax_id = EXCLUDED.tax_id,
    tax_id_kind = EXCLUDED.tax_id_kind, vies_status = EXCLUDED.vies_status, vies_checked_at = EXCLUDED.vies_checked_at,
    vies_consultation = EXCLUDED.vies_consultation, tax_treatment = EXCLUDED.tax_treatment,
    tax_review_reason = EXCLUDED.tax_review_reason, address_line1 = EXCLUDED.address_line1,
    address_line2 = EXCLUDED.address_line2, postal_code = EXCLUDED.postal_code, city = EXCLUDED.city,
    region = EXCLUDED.region, billing_email = EXCLUDED.billing_email, business_declared_at = now(),
    version = bp.version + 1, updated_by = EXCLUDED.updated_by, updated_at = now()
  RETURNING * INTO p;
  PERFORM billing._audit_event(p_org_id, 'billing.profile_saved', p_org_id::text, jsonb_build_object(
    'before', CASE WHEN before.org_id IS NULL THEN NULL ELSE jsonb_build_object('country', before.country,
      'tax_id_kind', before.tax_id_kind, 'tax_treatment', before.tax_treatment, 'vies_status', before.vies_status) END,
    'after', jsonb_build_object('country', p.country, 'tax_id_kind', p.tax_id_kind, 'tax_treatment', p.tax_treatment,
      'vies_status', p.vies_status, 'version', p.version), 'request_id', p_request_id));
  RETURN p;
END $$;

-- Records the workspace's Stripe customer for a mode (created by the caller
-- with the idempotency key customer:<org>:<mode>).
CREATE FUNCTION billing.save_stripe_customer(p_org_id uuid, p_livemode boolean, p_customer_id text)
RETURNS billing.stripe_customer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE c billing.stripe_customer;
BEGIN
  PERFORM billing._owner(p_org_id);
  IF p_livemode IS NULL OR p_customer_id IS NULL THEN RAISE EXCEPTION 'INPUT_INVALID'; END IF;
  INSERT INTO billing.stripe_customer (org_id, livemode, customer_id) VALUES (p_org_id, p_livemode, p_customer_id)
  ON CONFLICT (org_id, livemode) DO NOTHING;
  SELECT * INTO c FROM billing.stripe_customer WHERE org_id = p_org_id AND livemode = p_livemode;
  RETURN c;
END $$;

-- A Checkout top-up for a pack (§6.6). Idempotent by key.
CREATE FUNCTION billing.create_top_up_order(p_org_id uuid, p_key text, p_net_cents bigint, p_livemode boolean,
  p_buyer_domain text DEFAULT NULL, p_request_id text DEFAULT NULL)
RETURNS billing.top_up_order
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  PERFORM billing._owner(p_org_id);
  RETURN billing._create_order(p_org_id, 'checkout', p_key, p_net_cents, p_livemode, p_buyer_domain, NULL, NULL, p_request_id);
END $$;

CREATE FUNCTION billing.attach_checkout_session(p_org_id uuid, p_order_id uuid, p_session_id text, p_expires_at timestamptz)
RETURNS billing.top_up_order
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE o billing.top_up_order;
BEGIN
  PERFORM billing._owner(p_org_id);
  o := billing._order(p_org_id, p_order_id);
  IF o.stripe_checkout_session_id IS NOT NULL THEN
    IF o.stripe_checkout_session_id <> p_session_id THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF;
    RETURN o;
  END IF;
  IF o.kind <> 'checkout' OR p_session_id IS NULL OR p_expires_at IS NULL THEN RAISE EXCEPTION 'INPUT_INVALID'; END IF;
  UPDATE billing.top_up_order SET stripe_checkout_session_id = p_session_id, checkout_expires_at = p_expires_at, updated_at = now()
  WHERE id = o.id RETURNING * INTO o;
  RETURN o;
END $$;

-- Ends a pending checkout: 'canceled' (the session could not be created or
-- the person left) or 'expired' (Stripe expired the session).
CREATE FUNCTION billing.close_checkout(p_org_id uuid, p_order_id uuid, p_status text)
RETURNS billing.top_up_order
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE o billing.top_up_order;
BEGIN
  PERFORM billing._owner(p_org_id);
  IF p_status NOT IN ('canceled','expired') THEN RAISE EXCEPTION 'INPUT_INVALID'; END IF;
  o := billing._order(p_org_id, p_order_id);
  IF o.status = 'pending' AND o.kind = 'checkout' THEN
    UPDATE billing.top_up_order SET status = p_status, updated_at = now() WHERE id = o.id RETURNING * INTO o;
  END IF;
  RETURN o;
END $$;

-- Whether the first top-up bonus is open for this workspace and buyer domain.
CREATE FUNCTION billing.first_bonus_available(p_org_id uuid, p_buyer_domain text DEFAULT NULL) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE tax_key text;
BEGIN
  PERFORM billing._tenant(p_org_id);
  SELECT country || ':' || tax_id INTO tax_key FROM billing.billing_profile WHERE org_id = p_org_id;
  RETURN billing._first_bonus_open(p_org_id, p_buyer_domain, tax_key);
END $$;

-- The new-account purchase limits as they stand (§6.15), for the packs screen.
CREATE FUNCTION billing.purchase_limits(p_org_id uuid,
  OUT is_new boolean, OUT window_net_cents bigint, OUT recent_count integer, OUT lifted boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE r record;
BEGIN
  PERFORM billing._tenant(p_org_id);
  SELECT * INTO r FROM billing._purchase_limits(p_org_id);
  is_new := r.is_new; window_net_cents := r.window_net_cents; recent_count := r.recent_count; lifted := r.lifted;
END $$;

-- Auto-recharge settings (§6.6). Turning it on (re)arms it and clears failures.
CREATE FUNCTION billing.set_auto_recharge(p_org_id uuid, p_enabled boolean, p_threshold_ucr bigint, p_pack_cents bigint,
  p_monthly_max_count integer, p_monthly_max_cents bigint, p_request_id text DEFAULT NULL)
RETURNS billing.auto_recharge
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE r billing.auto_recharge; before billing.auto_recharge;
BEGIN
  PERFORM billing._owner(p_org_id);
  IF p_enabled IS NULL OR billing.pack_bonus_percent(p_pack_cents) IS NULL OR p_monthly_max_cents < p_pack_cents THEN
    RAISE EXCEPTION 'INPUT_INVALID';
  END IF;
  PERFORM billing._lock_account(p_org_id);
  SELECT * INTO before FROM billing.auto_recharge WHERE org_id = p_org_id;
  INSERT INTO billing.auto_recharge AS ar (org_id, enabled, threshold_ucr, pack_cents, monthly_max_count, monthly_max_cents,
    disabled_reason, updated_by)
  VALUES (p_org_id, p_enabled, p_threshold_ucr, p_pack_cents, p_monthly_max_count, p_monthly_max_cents,
    CASE WHEN NOT p_enabled THEN 'owner' END, billing._actor())
  ON CONFLICT (org_id) DO UPDATE SET enabled = EXCLUDED.enabled, threshold_ucr = EXCLUDED.threshold_ucr,
    pack_cents = EXCLUDED.pack_cents, monthly_max_count = EXCLUDED.monthly_max_count,
    monthly_max_cents = EXCLUDED.monthly_max_cents,
    armed = CASE WHEN EXCLUDED.enabled AND NOT ar.enabled THEN true ELSE ar.armed END,
    failures = CASE WHEN EXCLUDED.enabled AND NOT ar.enabled THEN 0 ELSE ar.failures END,
    retry_after = CASE WHEN EXCLUDED.enabled AND NOT ar.enabled THEN NULL ELSE ar.retry_after END,
    disabled_reason = CASE WHEN EXCLUDED.enabled THEN NULL ELSE coalesce(ar.disabled_reason, 'owner') END,
    updated_by = EXCLUDED.updated_by, updated_at = now()
  RETURNING * INTO r;
  PERFORM billing._audit_event(p_org_id, 'billing.auto_recharge_saved', p_org_id::text, jsonb_build_object(
    'before', CASE WHEN before.org_id IS NULL THEN NULL ELSE jsonb_build_object('enabled', before.enabled,
      'threshold_ucr', before.threshold_ucr, 'pack_cents', before.pack_cents, 'monthly_max_count', before.monthly_max_count,
      'monthly_max_cents', before.monthly_max_cents) END,
    'after', jsonb_build_object('enabled', r.enabled, 'threshold_ucr', r.threshold_ucr, 'pack_cents', r.pack_cents,
      'monthly_max_count', r.monthly_max_count, 'monthly_max_cents', r.monthly_max_cents), 'request_id', p_request_id));
  RETURN r;
END $$;

-- Spend caps (§6.10): p_cap_ucr and p_p90_multiplier NULL restore the default.
CREATE FUNCTION billing.set_spend_cap(p_org_id uuid, p_scope text, p_subject_id uuid, p_cap_ucr bigint,
  p_p90_multiplier numeric DEFAULT NULL, p_request_id text DEFAULT NULL)
RETURNS billing.spend_cap
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE c billing.spend_cap;
BEGIN
  PERFORM billing._owner(p_org_id);
  IF p_scope IS NULL OR p_scope NOT IN ('workspace_monthly','per_run','schedule') THEN RAISE EXCEPTION 'INPUT_INVALID'; END IF;
  PERFORM billing._lock_account(p_org_id);
  INSERT INTO billing.spend_cap AS sc (org_id, scope, subject_id, cap_ucr, p90_multiplier, updated_by)
  VALUES (p_org_id, p_scope, p_subject_id, p_cap_ucr, p_p90_multiplier, billing._actor())
  ON CONFLICT (org_id, scope, coalesce(subject_id, '00000000-0000-0000-0000-000000000000'::uuid))
  DO UPDATE SET cap_ucr = EXCLUDED.cap_ucr, p90_multiplier = EXCLUDED.p90_multiplier, updated_by = EXCLUDED.updated_by, updated_at = now()
  RETURNING * INTO c;
  PERFORM billing._audit_event(p_org_id, 'billing.spend_cap_saved', c.id::text, jsonb_build_object(
    'scope', c.scope, 'subject_id', c.subject_id, 'cap_ucr', c.cap_ucr, 'p90_multiplier', c.p90_multiplier, 'request_id', p_request_id));
  RETURN c;
END $$;

/* -------------------------------------------- payment recording (Stripe) --- */

-- Records one delivery of a signed webhook event. A replay returns the row
-- with its status; callers stop when it is processed or ignored.
CREATE FUNCTION billing.stripe_event_begin(p_id text, p_type text, p_livemode boolean, p_api_version text, p_object_id text,
  p_payload_sha256 text, p_stripe_created_at timestamptz)
RETURNS billing.stripe_event
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE e billing.stripe_event;
BEGIN
  PERFORM billing._privileged();
  INSERT INTO billing.stripe_event AS se (id, type, livemode, api_version, object_id, payload_sha256, stripe_created_at)
  VALUES (p_id, p_type, p_livemode, p_api_version, p_object_id, p_payload_sha256, p_stripe_created_at)
  ON CONFLICT (id) DO UPDATE SET deliveries = se.deliveries + 1, last_received_at = now()
  RETURNING * INTO e;
  IF e.type <> p_type OR e.livemode <> p_livemode THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF;
  RETURN e;
END $$;

CREATE FUNCTION billing.stripe_event_finish(p_id text, p_status text, p_outcome text, p_org_id uuid DEFAULT NULL,
  p_order_id uuid DEFAULT NULL)
RETURNS billing.stripe_event
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE e billing.stripe_event;
BEGIN
  PERFORM billing._privileged();
  IF p_status NOT IN ('processed','ignored','failed') THEN RAISE EXCEPTION 'INPUT_INVALID'; END IF;
  UPDATE billing.stripe_event SET
    status = CASE WHEN status IN ('processed','ignored') THEN status ELSE p_status END,
    outcome = CASE WHEN status IN ('processed','ignored') THEN outcome ELSE p_outcome END,
    processed_at = CASE WHEN status IN ('processed','ignored') THEN processed_at
                        WHEN p_status IN ('processed','ignored') THEN now() END,
    org_id = coalesce(org_id, p_org_id), order_id = coalesce(order_id, p_order_id)
  WHERE id = p_id RETURNING * INTO e;
  IF NOT FOUND THEN RAISE EXCEPTION 'INPUT_INVALID'; END IF;
  RETURN e;
END $$;

-- Finds an order across workspaces by its id or its Stripe ids. Services only.
CREATE FUNCTION billing.find_top_up_order(p_order_id uuid, p_session_id text, p_payment_intent_id text, p_charge_id text)
RETURNS TABLE (org_id uuid, order_id uuid, status text, livemode boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
#variable_conflict use_column
BEGIN
  PERFORM billing._privileged();
  RETURN QUERY SELECT o.org_id, o.id, o.status, o.livemode FROM billing.top_up_order o
  WHERE (p_order_id IS NOT NULL AND o.id = p_order_id)
     OR (p_session_id IS NOT NULL AND o.stripe_checkout_session_id = p_session_id)
     OR (p_payment_intent_id IS NOT NULL AND o.stripe_payment_intent_id = p_payment_intent_id)
     OR (p_charge_id IS NOT NULL AND o.stripe_charge_id = p_charge_id)
  ORDER BY (o.id = p_order_id) DESC NULLS LAST LIMIT 1;
END $$;

-- A payment succeeded: credits the order once. The purchase lot carries the
-- euro price paid per credit; the bonus lot (the larger of the pack bonus and,
-- if this is still the company's first top-up, the +20 % first bonus) has no
-- price. Idempotent: a paid order returns as it is. Raises PAYMENT_MISMATCH
-- when the amount, currency or mode differs from the order.
CREATE FUNCTION billing.record_purchase(p_org_id uuid, p_order_id uuid, p_livemode boolean, p_amount_cents bigint,
  p_currency text, p_payment_intent_id text, p_session_id text DEFAULT NULL, p_customer_id text DEFAULT NULL,
  p_event_id text DEFAULT NULL)
RETURNS billing.top_up_order
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE o billing.top_up_order; pe billing.ledger_entry; be billing.ledger_entry; expires timestamptz; v_bonus bigint;
  v_kind text; v_first boolean; tax_key text; refs jsonb; fp text; v_attribution jsonb := '{}'::jsonb;
BEGIN
  PERFORM billing._tenant(p_org_id);
  PERFORM billing._privileged();
  PERFORM billing._lock_account(p_org_id);
  o := billing._order(p_org_id, p_order_id);
  IF o.purchase_entry_id IS NOT NULL THEN RETURN o; END IF;
  IF o.livemode IS DISTINCT FROM p_livemode OR p_currency IS DISTINCT FROM 'eur' OR p_amount_cents IS DISTINCT FROM o.gross_cents
     OR (o.stripe_payment_intent_id IS NOT NULL AND o.stripe_payment_intent_id IS DISTINCT FROM p_payment_intent_id)
     OR (p_session_id IS NOT NULL AND o.stripe_checkout_session_id IS NOT NULL AND o.stripe_checkout_session_id <> p_session_id) THEN
    RAISE EXCEPTION 'PAYMENT_MISMATCH';
  END IF;
  v_first := NOT EXISTS (SELECT 1 FROM billing.top_up_order WHERE org_id = p_org_id AND paid_at IS NOT NULL);
  v_bonus := o.pack_bonus_ucr;
  v_kind := CASE WHEN v_bonus > 0 THEN 'pack' END;
  IF o.first_bonus_ucr > o.pack_bonus_ucr THEN
    tax_key := (o.tax_snapshot->>'country') || ':' || (o.tax_snapshot->>'tax_id');
    BEGIN
      INSERT INTO billing.first_bonus_claim (claim_key, org_id, order_id) VALUES ('org:' || p_org_id, p_org_id, o.id);
      IF o.buyer_domain IS NOT NULL THEN
        INSERT INTO billing.first_bonus_claim (claim_key, org_id, order_id) VALUES ('domain:' || o.buyer_domain, p_org_id, o.id);
      END IF;
      INSERT INTO billing.first_bonus_claim (claim_key, org_id, order_id) VALUES ('tax:' || tax_key, p_org_id, o.id);
      v_bonus := o.first_bonus_ucr;
      v_kind := 'first_top_up';
    EXCEPTION WHEN unique_violation THEN
      NULL; -- the company already had its first bonus: the pack bonus applies
    END;
  END IF;
  IF v_first THEN
    SELECT coalesce(w.acquisition_attribution, '{}'::jsonb) INTO v_attribution FROM evals.workspace w WHERE w.id = p_org_id;
  END IF;
  expires := billing.purchase_expiry(now());
  refs := jsonb_build_object('ref_kind', 'top_up_order', 'ref_id', o.id::text, 'request_id', p_event_id);
  fp := billing._fingerprint(jsonb_build_object('fn', 'purchase', 'order', o.id, 'amount', o.base_ucr));
  pe := billing._credit(p_org_id, 'purchase', 'purchase', 'purchase:' || o.id, fp, o.base_ucr, expires,
    round(o.net_cents::numeric / 100 / (o.base_ucr::numeric / 1000000), 10), o.id, NULL, refs);
  IF v_bonus > 0 THEN
    be := billing._credit(p_org_id, 'bonus', 'bonus', 'purchase-bonus:' || o.id,
      billing._fingerprint(jsonb_build_object('fn', 'purchase_bonus', 'order', o.id, 'amount', v_bonus, 'kind', v_kind)),
      v_bonus, expires, 0, o.id, CASE v_kind WHEN 'first_top_up' THEN 'first_top_up' ELSE 'pack_bonus' END, refs);
  END IF;
  UPDATE billing.top_up_order SET status = 'paid',
    paid_at = now(), stripe_payment_intent_id = coalesce(stripe_payment_intent_id, p_payment_intent_id),
    stripe_checkout_session_id = coalesce(stripe_checkout_session_id, p_session_id),
    stripe_customer_id = coalesce(stripe_customer_id, p_customer_id), purchase_entry_id = pe.id, bonus_entry_id = be.id,
    bonus_ucr = v_bonus, bonus_kind = v_kind, first_paid = v_first, attribution = v_attribution, failure_code = NULL, updated_at = now()
  WHERE id = o.id RETURNING * INTO o;
  IF o.kind = 'auto_recharge' THEN
    UPDATE billing.auto_recharge SET in_flight_order_id = NULL, failures = 0, retry_after = NULL, last_failure_code = NULL,
      last_success_at = now(), updated_at = now()
    WHERE org_id = p_org_id AND (in_flight_order_id = o.id OR in_flight_order_id IS NULL);
  END IF;
  RETURN o;
END $$;

-- Card and checkout details learned after the payment: the charge, the card
-- (saved for auto-recharge when the person agreed at Checkout), and risk
-- flags: a card country that differs from the tax country (§6.15) and fiscal
-- details at Checkout that differ from the profile the price was based on.
CREATE FUNCTION billing.record_payment_details(p_org_id uuid, p_order_id uuid, p_charge_id text, p_payment_method_id text,
  p_card_brand text, p_card_last4 text, p_card_country text, p_save_card boolean, p_checkout_country text DEFAULT NULL,
  p_checkout_tax_ids text[] DEFAULT NULL)
RETURNS billing.top_up_order
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE o billing.top_up_order; flags text[];
BEGIN
  PERFORM billing._tenant(p_org_id);
  PERFORM billing._privileged();
  PERFORM billing._lock_account(p_org_id);
  o := billing._order(p_org_id, p_order_id);
  flags := o.risk_flags;
  IF p_card_country IS NOT NULL AND p_card_country <> (o.tax_snapshot->>'country') AND NOT ('card_country_mismatch' = ANY(flags)) THEN
    flags := flags || 'card_country_mismatch'::text;
  END IF;
  IF ((p_checkout_country IS NOT NULL AND p_checkout_country <> (o.tax_snapshot->>'country'))
      OR (p_checkout_tax_ids IS NOT NULL AND cardinality(p_checkout_tax_ids) > 0
          AND NOT ((o.tax_snapshot->>'tax_id') = ANY(p_checkout_tax_ids))))
     AND NOT ('checkout_tax_details_differ' = ANY(flags)) THEN
    flags := flags || 'checkout_tax_details_differ'::text;
  END IF;
  UPDATE billing.top_up_order SET stripe_charge_id = coalesce(stripe_charge_id, p_charge_id),
    card_country = coalesce(card_country, p_card_country), risk_flags = flags, updated_at = now()
  WHERE id = o.id RETURNING * INTO o;
  IF p_save_card AND p_payment_method_id IS NOT NULL AND o.stripe_customer_id IS NOT NULL THEN
    UPDATE billing.stripe_customer SET payment_method_id = p_payment_method_id, card_brand = p_card_brand,
      card_last4 = p_card_last4, card_country = p_card_country, updated_at = now()
    WHERE org_id = p_org_id AND livemode = o.livemode AND customer_id = o.stripe_customer_id;
  END IF;
  RETURN o;
END $$;

-- A payment attempt failed. A Checkout order stays open (the person can try
-- another card in the same session). An auto-recharge charge fails: the first
-- failure schedules one retry after 24 h, the second switches auto-recharge
-- off (§6.6). Both write an in-app notice. A failure reported after the
-- order was paid (events out of order) changes nothing.
CREATE FUNCTION billing.record_payment_failure(p_org_id uuid, p_order_id uuid, p_payment_intent_id text, p_code text,
  p_event_id text DEFAULT NULL)
RETURNS billing.top_up_order
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE o billing.top_up_order; code text := lower(coalesce(nullif(p_code, ''), 'payment_failed')); ar billing.auto_recharge;
BEGIN
  PERFORM billing._tenant(p_org_id);
  PERFORM billing._privileged();
  IF code !~ '^[a-z][a-z0-9_]{1,63}$' THEN code := 'payment_failed'; END IF;
  PERFORM billing._lock_account(p_org_id);
  o := billing._order(p_org_id, p_order_id);
  IF o.status <> 'pending' THEN RETURN o; END IF;
  IF o.stripe_payment_intent_id IS NOT NULL AND p_payment_intent_id IS NOT NULL AND o.stripe_payment_intent_id <> p_payment_intent_id THEN
    RAISE EXCEPTION 'PAYMENT_MISMATCH';
  END IF;
  IF o.kind = 'checkout' THEN
    UPDATE billing.top_up_order SET failure_code = code, failure_count = failure_count + 1,
      stripe_payment_intent_id = coalesce(stripe_payment_intent_id, p_payment_intent_id), updated_at = now()
    WHERE id = o.id RETURNING * INTO o;
    RETURN o;
  END IF;
  UPDATE billing.top_up_order SET status = 'failed', failed_at = now(), failure_code = code, failure_count = failure_count + 1,
    stripe_payment_intent_id = coalesce(stripe_payment_intent_id, p_payment_intent_id), updated_at = now()
  WHERE id = o.id RETURNING * INTO o;
  UPDATE billing.auto_recharge SET in_flight_order_id = NULL, failures = least(failures + 1, 2), last_failure_code = code,
    retry_after = CASE WHEN failures + 1 >= 2 THEN NULL ELSE now() + interval '24 hours' END,
    enabled = CASE WHEN failures + 1 >= 2 THEN false ELSE enabled END,
    disabled_reason = CASE WHEN failures + 1 >= 2 THEN 'payment_failed' ELSE disabled_reason END,
    updated_at = now()
  WHERE org_id = p_org_id AND in_flight_order_id = o.id
  RETURNING * INTO ar;
  PERFORM evals.record_notice(p_org_id, 'auto_recharge:' || o.id || ':failed', 'auto_recharge_failed',
    jsonb_build_object('orderId', o.id, 'reasonCode', code, 'disabled', coalesce(NOT ar.enabled, false)));
  RETURN o;
END $$;

-- Reverses an untouched order's purchase and bonus entries with `refund`
-- entries (audited) and leaves the order waiting for the Stripe refund.
CREATE FUNCTION billing._refund_order(o billing.top_up_order, p_reason text, p_request_id text)
RETURNS billing.top_up_order
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE e billing.ledger_entry; refs jsonb; r billing.top_up_order;
BEGIN
  refs := jsonb_build_object('ref_kind', 'top_up_order', 'ref_id', o.id::text, 'reason', p_reason, 'request_id', p_request_id);
  e := billing._reverse(o.org_id, 'refund', 'top-up-refund:' || o.id || ':purchase',
    billing._fingerprint(jsonb_build_object('fn', 'top_up_refund', 'order', o.id, 'entry', o.purchase_entry_id)),
    o.purchase_entry_id, refs);
  PERFORM billing._audit('billing.top_up_refund', e);
  IF o.bonus_entry_id IS NOT NULL THEN
    e := billing._reverse(o.org_id, 'refund', 'top-up-refund:' || o.id || ':bonus',
      billing._fingerprint(jsonb_build_object('fn', 'top_up_refund', 'order', o.id, 'entry', o.bonus_entry_id)),
      o.bonus_entry_id, refs);
    PERFORM billing._audit('billing.top_up_refund', e);
  END IF;
  UPDATE billing.top_up_order SET status = 'refund_pending', refund_reason = p_reason, updated_at = now()
  WHERE id = o.id RETURNING * INTO r;
  RETURN r;
END $$;

-- Starts a money refund of an untouched purchase within 14 days (D-10): one
-- `refund` entry reverses the purchase and one the bonus, and the order waits
-- for the Stripe refund (refund_pending). Platform admins (reason required,
-- audited) and services. Raises REFUND_NOT_ALLOWED outside the policy.
CREATE FUNCTION billing.begin_top_up_refund(p_org_id uuid, p_order_id uuid, p_reason text, p_request_id text DEFAULT NULL)
RETURNS billing.top_up_order
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE o billing.top_up_order; reason text;
BEGIN
  PERFORM billing._tenant(p_org_id);
  PERFORM billing._privileged();
  reason := billing._reason(p_reason, true);
  PERFORM billing._lock_account(p_org_id);
  o := billing._order(p_org_id, p_order_id);
  IF o.status IN ('refund_pending','refunded') THEN RETURN o; END IF;
  IF o.status <> 'paid' OR o.paid_at < now() - interval '14 days' THEN RAISE EXCEPTION 'REFUND_NOT_ALLOWED'; END IF;
  -- Untouched: every lot of the order still holds all its credits, none held or expired.
  IF EXISTS (SELECT 1 FROM billing.credit_lot WHERE org_id = p_org_id AND order_id = o.id
             AND (remaining_ucr <> granted_ucr OR held_ucr <> 0 OR expired_ucr <> 0)) THEN
    RAISE EXCEPTION 'REFUND_NOT_ALLOWED';
  END IF;
  RETURN billing._refund_order(o, reason, p_request_id);
END $$;

-- The Stripe refund for a refund_pending order exists (or Stripe reported
-- the charge refunded): the order is refunded.
CREATE FUNCTION billing.finish_top_up_refund(p_org_id uuid, p_order_id uuid, p_refund_id text)
RETURNS billing.top_up_order
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE o billing.top_up_order;
BEGIN
  PERFORM billing._tenant(p_org_id);
  PERFORM billing._privileged();
  PERFORM billing._lock_account(p_org_id);
  o := billing._order(p_org_id, p_order_id);
  IF o.status = 'refunded' THEN RETURN o; END IF;
  IF o.status <> 'refund_pending' THEN RAISE EXCEPTION 'REFUND_NOT_ALLOWED'; END IF;
  UPDATE billing.top_up_order SET status = 'refunded', refunded_at = now(),
    stripe_refund_id = coalesce(stripe_refund_id, p_refund_id), updated_at = now()
  WHERE id = o.id RETURNING * INTO o;
  RETURN o;
END $$;

-- Stripe reports the charge refunded. Our own refunds finish here. A refund
-- made outside Caudals (the Stripe dashboard) on a paid order is mirrored:
-- an untouched purchase is reversed like ours; otherwise what is left of the
-- order's credits is removed with a negative adjustment and the shortfall
-- flagged for ops. A partial refund is only flagged.
CREATE FUNCTION billing.record_charge_refunded(p_org_id uuid, p_order_id uuid, p_refund_id text, p_amount_refunded_cents bigint,
  p_event_id text DEFAULT NULL)
RETURNS billing.top_up_order
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE o billing.top_up_order; t record; e billing.ledger_entry; total bigint; flags text[];
BEGIN
  PERFORM billing._tenant(p_org_id);
  PERFORM billing._privileged();
  PERFORM billing._lock_account(p_org_id);
  o := billing._order(p_org_id, p_order_id);
  IF o.status = 'refunded' OR p_amount_refunded_cents IS NULL OR p_amount_refunded_cents <= 0 THEN RETURN o; END IF;
  IF o.status = 'refund_pending' THEN RETURN billing.finish_top_up_refund(p_org_id, p_order_id, p_refund_id); END IF;
  IF o.status NOT IN ('paid','disputed') THEN RAISE EXCEPTION 'ORDER_NOT_PAID'; END IF;
  IF p_amount_refunded_cents < o.gross_cents THEN
    IF NOT ('partial_refund_review' = ANY(o.risk_flags)) THEN
      UPDATE billing.top_up_order SET risk_flags = risk_flags || 'partial_refund_review'::text, updated_at = now()
      WHERE id = o.id RETURNING * INTO o;
    END IF;
    RETURN o;
  END IF;
  flags := o.risk_flags || 'external_refund'::text;
  IF NOT EXISTS (SELECT 1 FROM billing.credit_lot WHERE org_id = p_org_id AND order_id = o.id
                 AND (remaining_ucr <> granted_ucr OR held_ucr <> 0 OR expired_ucr <> 0)) THEN
    PERFORM billing._refund_order(o, 'Refunded in Stripe outside Caudals', p_event_id);
  ELSE
    total := o.base_ucr + coalesce(o.bonus_ucr, 0);
    SELECT * INTO t FROM billing._take_order_lots(p_org_id, o.id, total);
    IF t.taken > 0 THEN
      e := billing._post(p_org_id, 'adjustment', 'external-refund:' || o.id,
        billing._fingerprint(jsonb_build_object('fn', 'external_refund', 'order', o.id)), -t.taken, 0, t.allocations,
        jsonb_build_object('ref_kind', 'top_up_order', 'ref_id', o.id::text, 'reason', 'Refunded in Stripe outside Caudals',
          'request_id', p_event_id, 'metadata', jsonb_build_object('refund', p_refund_id, 'shortfall_ucr', total - t.taken)));
      PERFORM billing._audit('billing.external_refund', e);
    END IF;
    IF t.taken < total THEN flags := flags || 'refund_shortfall'::text; END IF;
    UPDATE billing.top_up_order SET status = 'refund_pending', refund_reason = 'Refunded in Stripe outside Caudals', updated_at = now()
    WHERE id = o.id;
  END IF;
  UPDATE billing.top_up_order SET status = 'refunded', refunded_at = now(), stripe_refund_id = coalesce(stripe_refund_id, p_refund_id),
    risk_flags = flags, updated_at = now()
  WHERE id = o.id RETURNING * INTO o;
  RETURN o;
END $$;

-- Disputes (§6.15). Opening one freezes the account (no new holds or
-- purchases; work in flight finishes). Won or withdrawn: the order is paid
-- again and the freeze lifts when no other dispute is open. Lost: a
-- `chargeback` entry removes what is left of the order's credits (never below
-- zero; the shortfall goes in its metadata) and the account stays frozen for
-- ops. Events may arrive in any order.
CREATE FUNCTION billing.record_dispute(p_org_id uuid, p_order_id uuid, p_dispute_id text, p_status text,
  p_event_id text DEFAULT NULL)
RETURNS billing.top_up_order
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE o billing.top_up_order; a billing.credit_account; t record; e billing.ledger_entry; total bigint; closed boolean;
  lost boolean;
BEGIN
  PERFORM billing._tenant(p_org_id);
  PERFORM billing._privileged();
  IF p_dispute_id IS NULL OR p_status IS NULL OR p_status !~ '^[a-z_]{2,40}$' THEN RAISE EXCEPTION 'INPUT_INVALID'; END IF;
  a := billing._lock_account(p_org_id);
  o := billing._order(p_org_id, p_order_id);
  IF o.purchase_entry_id IS NULL THEN RAISE EXCEPTION 'ORDER_NOT_PAID'; END IF;
  IF o.status = 'charged_back' THEN RETURN o; END IF;
  lost := p_status = 'lost';
  closed := p_status IN ('won','lost','warning_closed','prevented');
  IF NOT closed THEN
    IF o.status = 'disputed' THEN RETURN o; END IF;
    UPDATE billing.top_up_order SET status = 'disputed', stripe_dispute_id = p_dispute_id, updated_at = now()
    WHERE id = o.id RETURNING * INTO o;
    IF a.frozen_reason IS NULL THEN
      UPDATE billing.credit_account SET frozen_reason = 'dispute:' || p_dispute_id, version = version + 1, updated_at = now()
      WHERE org_id = p_org_id;
    END IF;
    PERFORM billing._audit_event(p_org_id, 'billing.dispute_opened', o.id::text,
      jsonb_build_object('dispute', p_dispute_id, 'status', p_status, 'frozen_before', a.frozen_reason, 'event', p_event_id));
    RETURN o;
  END IF;
  IF NOT lost THEN
    UPDATE billing.top_up_order SET status = CASE WHEN refunded_at IS NOT NULL THEN 'refunded' ELSE 'paid' END,
      stripe_dispute_id = p_dispute_id, updated_at = now()
    WHERE id = o.id RETURNING * INTO o;
    IF a.frozen_reason = 'dispute:' || p_dispute_id AND NOT EXISTS (
        SELECT 1 FROM billing.top_up_order WHERE org_id = p_org_id AND status = 'disputed' AND id <> o.id) THEN
      UPDATE billing.credit_account SET frozen_reason = NULL, version = version + 1, updated_at = now() WHERE org_id = p_org_id;
    END IF;
    PERFORM billing._audit_event(p_org_id, 'billing.dispute_closed', o.id::text,
      jsonb_build_object('dispute', p_dispute_id, 'status', p_status, 'event', p_event_id));
    RETURN o;
  END IF;
  total := o.base_ucr + coalesce(o.bonus_ucr, 0);
  SELECT * INTO t FROM billing._take_order_lots(p_org_id, o.id, total);
  IF t.taken > 0 THEN
    e := billing._post(p_org_id, 'chargeback', 'chargeback:' || o.id,
      billing._fingerprint(jsonb_build_object('fn', 'chargeback', 'order', o.id, 'dispute', p_dispute_id)), -t.taken, 0, t.allocations,
      jsonb_build_object('ref_kind', 'top_up_order', 'ref_id', o.id::text, 'reason', 'Payment dispute lost',
        'request_id', p_event_id, 'metadata', jsonb_build_object('dispute', p_dispute_id, 'shortfall_ucr', total - t.taken)));
    PERFORM billing._audit('billing.chargeback', e);
  END IF;
  UPDATE billing.top_up_order SET status = 'charged_back', stripe_dispute_id = p_dispute_id,
    risk_flags = CASE WHEN t.taken < total AND NOT ('chargeback_shortfall' = ANY(risk_flags))
      THEN risk_flags || 'chargeback_shortfall'::text ELSE risk_flags END, updated_at = now()
  WHERE id = o.id RETURNING * INTO o;
  UPDATE billing.credit_account SET frozen_reason = 'chargeback:' || p_dispute_id, version = version + 1, updated_at = now()
  WHERE org_id = p_org_id AND (frozen_reason IS NULL OR frozen_reason LIKE 'dispute:%');
  PERFORM billing._audit_event(p_org_id, 'billing.dispute_closed', o.id::text,
    jsonb_build_object('dispute', p_dispute_id, 'status', p_status, 'removed_ucr', t.taken, 'shortfall_ucr', total - t.taken,
      'event', p_event_id));
  RETURN o;
END $$;

-- Lifts the new-account purchase limits for a workspace (ops; audited).
CREATE FUNCTION billing.lift_purchase_limits(p_org_id uuid, p_reason text) RETURNS billing.billing_profile
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE p billing.billing_profile; reason text;
BEGIN
  PERFORM billing._tenant(p_org_id);
  PERFORM billing._privileged();
  reason := billing._reason(p_reason, true);
  UPDATE billing.billing_profile SET limits_lifted_at = coalesce(limits_lifted_at, now()), updated_at = now()
  WHERE org_id = p_org_id RETURNING * INTO p;
  IF NOT FOUND THEN RAISE EXCEPTION 'BILLING_PROFILE_REQUIRED'; END IF;
  PERFORM billing._audit_event(p_org_id, 'billing.purchase_limits_lifted', p_org_id::text, jsonb_build_object('reason', reason));
  RETURN p;
END $$;

/* ------------------------------------------------------- auto-recharge --- */

-- Workspaces with auto-recharge work to do (scheduler, across workspaces).
CREATE FUNCTION billing.auto_recharge_due(p_limit integer DEFAULT 100) RETURNS SETOF uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  PERFORM billing._privileged();
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'INPUT_INVALID'; END IF;
  RETURN QUERY SELECT a.org_id FROM billing.auto_recharge a JOIN billing.credit_account c ON c.org_id = a.org_id
  WHERE a.enabled AND c.frozen_reason IS NULL AND (
       (a.in_flight_order_id IS NULL AND c.available_ucr < a.threshold_ucr
          AND (a.armed OR (a.failures = 1 AND a.retry_after <= now())))
    OR (a.in_flight_order_id IS NULL AND c.available_ucr >= a.threshold_ucr AND (NOT a.armed OR a.failures > 0))
    OR (a.in_flight_order_id IS NOT NULL AND EXISTS (SELECT 1 FROM billing.top_up_order o
          WHERE o.org_id = a.org_id AND o.id = a.in_flight_order_id AND o.status = 'pending' AND o.updated_at < now() - interval '2 minutes')))
  ORDER BY a.org_id LIMIT p_limit;
END $$;

-- One step of auto-recharge for a workspace (§6.6), under the account lock:
--   re-arms when the balance is back at or above the threshold;
--   on a crossing below it (armed), opens the next crossing and creates an
--   order to charge, idempotency key auto-recharge:<crossing>:1;
--   24 h after a first failure, one retry for the same crossing (attempt 2);
--   an order in flight for over 2 minutes is returned to resume (no payment
--   attempt recorded yet: charge with the same key) or reconcile.
-- Respects the monthly cap (recharges and euros, UTC month) and the
-- new-account purchase limits; when they block, it records an alert and
-- waits. Returns the order to act on, or no row.
CREATE FUNCTION billing.claim_auto_recharge(p_org_id uuid, p_livemode boolean)
RETURNS SETOF billing.top_up_order
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE a billing.credit_account; s billing.auto_recharge; o billing.top_up_order; crossing bigint; attempt integer;
  month_count integer; month_cents bigint; month_key text := to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM');
BEGIN
  PERFORM billing._tenant(p_org_id);
  PERFORM billing._privileged();
  a := billing._lock_account(p_org_id);
  SELECT * INTO s FROM billing.auto_recharge WHERE org_id = p_org_id FOR UPDATE;
  IF NOT FOUND OR NOT s.enabled OR a.frozen_reason IS NOT NULL THEN RETURN; END IF;
  IF s.in_flight_order_id IS NOT NULL THEN
    SELECT * INTO o FROM billing.top_up_order WHERE org_id = p_org_id AND id = s.in_flight_order_id FOR UPDATE;
    IF o.status = 'pending' AND o.updated_at < now() - interval '2 minutes' THEN
      UPDATE billing.top_up_order SET updated_at = now() WHERE id = o.id RETURNING * INTO o;
      RETURN NEXT o;
    ELSIF o.status <> 'pending' THEN
      UPDATE billing.auto_recharge SET in_flight_order_id = NULL, updated_at = now() WHERE org_id = p_org_id;
    END IF;
    RETURN;
  END IF;
  IF a.available_ucr >= s.threshold_ucr THEN
    IF NOT s.armed OR s.failures > 0 THEN
      UPDATE billing.auto_recharge SET armed = true, failures = 0, retry_after = NULL, updated_at = now() WHERE org_id = p_org_id;
    END IF;
    RETURN;
  END IF;
  IF s.armed AND s.failures = 0 THEN
    crossing := s.crossing_seq + 1; attempt := 1;
  ELSIF s.failures = 1 AND s.retry_after <= now() THEN
    crossing := s.crossing_seq; attempt := 2;
  ELSE
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM billing.stripe_customer WHERE org_id = p_org_id AND livemode = p_livemode
                 AND payment_method_id IS NOT NULL) THEN
    INSERT INTO billing.alert_state (org_id, kind, period_key, payload)
    VALUES (p_org_id, 'auto_recharge_no_card', month_key, '{}'::jsonb) ON CONFLICT DO NOTHING;
    RETURN;
  END IF;
  SELECT count(*)::integer, coalesce(sum(net_cents), 0)::bigint INTO month_count, month_cents FROM billing.top_up_order
  WHERE org_id = p_org_id AND kind = 'auto_recharge' AND status IN ('pending','paid','refund_pending','disputed','charged_back')
    AND created_at >= (date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC');
  IF month_count >= s.monthly_max_count OR month_cents + s.pack_cents > s.monthly_max_cents THEN
    INSERT INTO billing.alert_state (org_id, kind, period_key, payload)
    VALUES (p_org_id, 'auto_recharge_cap', month_key, jsonb_build_object('count', month_count, 'cents', month_cents))
    ON CONFLICT DO NOTHING;
    RETURN;
  END IF;
  BEGIN
    o := billing._create_order(p_org_id, 'auto_recharge', 'auto-recharge:' || crossing || ':' || attempt, s.pack_cents,
      p_livemode, NULL, crossing, attempt, NULL);
  EXCEPTION WHEN raise_exception OR not_null_violation OR check_violation THEN
    INSERT INTO billing.alert_state (org_id, kind, period_key, payload)
    VALUES (p_org_id, 'auto_recharge_blocked', month_key, jsonb_build_object('reason', left(SQLERRM, 60)))
    ON CONFLICT DO NOTHING;
    RETURN;
  END;
  UPDATE billing.auto_recharge SET armed = false, crossing_seq = crossing, in_flight_order_id = o.id, updated_at = now()
  WHERE org_id = p_org_id;
  RETURN NEXT o;
END $$;

-- Records the PaymentIntent created for an auto-recharge order before its
-- outcome is known (so a resume reconciles it instead of charging again).
CREATE FUNCTION billing.attach_payment_intent(p_org_id uuid, p_order_id uuid, p_payment_intent_id text, p_customer_id text)
RETURNS billing.top_up_order
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE o billing.top_up_order;
BEGIN
  PERFORM billing._tenant(p_org_id);
  PERFORM billing._privileged();
  o := billing._order(p_org_id, p_order_id);
  IF o.stripe_payment_intent_id IS NOT NULL AND o.stripe_payment_intent_id <> p_payment_intent_id THEN
    RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT';
  END IF;
  UPDATE billing.top_up_order SET stripe_payment_intent_id = p_payment_intent_id,
    stripe_customer_id = coalesce(stripe_customer_id, p_customer_id), updated_at = now()
  WHERE id = o.id RETURNING * INTO o;
  RETURN o;
END $$;

/* ------------------------------------------------------------- alerts --- */

-- Claims one send of a deduplicated billing email or alert: true when it has
-- not been sent and has had fewer than 3 attempts (the attempt is counted).
CREATE FUNCTION billing.claim_alert(p_org_id uuid, p_kind text, p_period_key text, p_payload jsonb DEFAULT '{}'::jsonb)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE s billing.alert_state;
BEGIN
  PERFORM billing._tenant(p_org_id);
  PERFORM billing._privileged();
  INSERT INTO billing.alert_state (org_id, kind, period_key, payload) VALUES (p_org_id, p_kind, p_period_key, coalesce(p_payload, '{}'::jsonb))
  ON CONFLICT DO NOTHING;
  SELECT * INTO s FROM billing.alert_state WHERE org_id = p_org_id AND kind = p_kind AND period_key = p_period_key FOR UPDATE;
  IF s.sent_at IS NOT NULL OR s.attempts >= 3 THEN RETURN false; END IF;
  UPDATE billing.alert_state SET attempts = attempts + 1 WHERE org_id = p_org_id AND kind = p_kind AND period_key = p_period_key;
  RETURN true;
END $$;

CREATE FUNCTION billing.mark_alert_sent(p_org_id uuid, p_kind text, p_period_key text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  PERFORM billing._tenant(p_org_id);
  PERFORM billing._privileged();
  UPDATE billing.alert_state SET sent_at = coalesce(sent_at, now()) WHERE org_id = p_org_id AND kind = p_kind AND period_key = p_period_key;
END $$;

/* -------------------------------------------------------------- health --- */

-- For the webhook health check (L-08's /api/evals/v1/health/webhooks): events
-- received but never finished after p_minutes (processing crashed and Stripe
-- has not redelivered yet). Counts only; services and platform admins.
CREATE FUNCTION billing.stripe_webhook_backlog(p_minutes integer DEFAULT 15) RETURNS integer
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  PERFORM billing._privileged();
  RETURN (SELECT count(*)::integer FROM billing.stripe_event
    WHERE status = 'received' AND last_received_at < now() - make_interval(mins => greatest(coalesce(p_minutes, 15), 1)));
END $$;

-- The workspace's name for billing emails sent by service identities, which
-- are not members and cannot read evals.workspace under its RLS.
CREATE FUNCTION billing.workspace_label(p_org_id uuid) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  PERFORM billing._tenant(p_org_id);
  PERFORM billing._privileged();
  RETURN (SELECT name FROM evals.workspace WHERE id = p_org_id);
END $$;

/* ---------------------------------------------------------- execution --- */

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA billing FROM PUBLIC;
-- The web runtime (and the scheduler, a member of evals_runtime). Inside,
-- owner functions accept owners, platform admins and services; recording
-- functions accept platform admins and services only.
GRANT EXECUTE ON FUNCTION
  billing.pack_bonus_percent(bigint),
  billing.purchase_expiry(timestamptz),
  billing.save_profile(uuid, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text),
  billing.save_stripe_customer(uuid, boolean, text),
  billing.create_top_up_order(uuid, text, bigint, boolean, text, text),
  billing.attach_checkout_session(uuid, uuid, text, timestamptz),
  billing.close_checkout(uuid, uuid, text),
  billing.first_bonus_available(uuid, text),
  billing.purchase_limits(uuid),
  billing.set_auto_recharge(uuid, boolean, bigint, bigint, integer, bigint, text),
  billing.set_spend_cap(uuid, text, uuid, bigint, numeric, text),
  billing.stripe_event_begin(text, text, boolean, text, text, text, timestamptz),
  billing.stripe_event_finish(text, text, text, uuid, uuid),
  billing.find_top_up_order(uuid, text, text, text),
  billing.record_purchase(uuid, uuid, boolean, bigint, text, text, text, text, text),
  billing.record_payment_details(uuid, uuid, text, text, text, text, text, boolean, text, text[]),
  billing.record_payment_failure(uuid, uuid, text, text, text),
  billing.begin_top_up_refund(uuid, uuid, text, text),
  billing.finish_top_up_refund(uuid, uuid, text),
  billing.record_charge_refunded(uuid, uuid, text, bigint, text),
  billing.record_dispute(uuid, uuid, text, text, text),
  billing.lift_purchase_limits(uuid, text),
  billing.auto_recharge_due(integer),
  billing.claim_auto_recharge(uuid, boolean),
  billing.attach_payment_intent(uuid, uuid, text, text),
  billing.claim_alert(uuid, text, text, jsonb),
  billing.mark_alert_sent(uuid, text, text),
  billing.stripe_webhook_backlog(integer),
  billing.workspace_label(uuid)
TO evals_runtime;
COMMIT;
