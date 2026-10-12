-- Price book, credit rates and the €0 model guard (launch spec v2 §6.3,
-- §6.4, §6.7, §6.16; package L-10).
--
-- billing.price_book_revision is a versioned price list that moves draft ->
-- scheduled -> active -> retired. Each revision carries model rates
-- (µcr per 1M input, output and cached tokens, with the cost snapshot they
-- were derived from) and action rates (the §6.3 platform meters). Rates are
-- editable only while their revision is a draft; scheduled and active
-- revisions are immutable apart from their lifecycle columns, and retired
-- revisions are frozen. The revision in effect at any instant is the
-- non-draft revision with the latest effective_at at or before it
-- (billing.price_book_at), so a scheduled revision takes effect exactly on
-- time; the hourly job only moves the status labels.
--
-- Credit rate = provider list price × FX × routing fee × multiplier (D-03:
-- 1.5) × 100, rounded up to the next 5 credits per 1M tokens, minimum 10. The
-- arithmetic lives in lib/billing/price-book.ts; the database stores the
-- result and enforces the 5-credit grid and the minimum.
--
-- €0 guard (G9): a model route (platform default, workspace or evaluation)
-- can point at a model only when it has a non-zero cost price (the DGX is
-- capacity-priced and exempt) and a credit rate in the revision in effect and
-- in every scheduled revision, unless the provider revision is explicitly
-- flagged free_model (OpenRouter ":free" models, a demo fallback).
--
-- Seed: revision 1 (active from 2026-10-11) from the §6.4 table and the §6.3
-- meters, and revision 2 (scheduled for 2027-01-01) with Google's announced
-- Gemini 3.8 Flash increase. FX: ECB reference rate 1 EUR = 1.1605 USD on
-- 2026-08-19.
--
-- Forward repair: additive only. The rollback refuses once a ledger entry or
-- hold references a revision, or a revision other than the seed exists.
BEGIN;
-- Short, rare locks on hot tables (provider revisions, routes): fail fast
-- rather than queue the workers behind a long transaction.
SET LOCAL lock_timeout = '10s';

/* ------------------------------------------------------------- tables --- */

CREATE TABLE billing.price_book_revision (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  revision integer NOT NULL UNIQUE CHECK (revision > 0),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','scheduled','active','retired')),
  title text NOT NULL CHECK (length(title) BETWEEN 3 AND 200),
  notes text CHECK (notes IS NULL OR length(notes) <= 4000),
  effective_at timestamptz,
  -- Pricing method (D-03) and the FX it used.
  multiplier numeric(6,4) NOT NULL CHECK (multiplier >= 1 AND multiplier <= 10),
  fx_usd_per_eur numeric(12,6) NOT NULL CHECK (fx_usd_per_eur > 0),
  fx_date date NOT NULL,
  fx_source text NOT NULL CHECK (length(fx_source) BETWEEN 3 AND 300),
  based_on_id uuid REFERENCES billing.price_book_revision(id),
  -- Set when scheduled: whether any rate rises against the revision it follows.
  raises_prices boolean,
  -- Increases need 30 days' notice (§6.4); the sender records it (L-16).
  notice_sent_at timestamptz,
  created_by text NOT NULL CHECK (length(created_by) BETWEEN 1 AND 255),
  created_at timestamptz NOT NULL DEFAULT now(),
  scheduled_by text,
  scheduled_at timestamptz,
  activated_at timestamptz,
  retired_at timestamptz,
  CHECK (status = 'draft' OR (effective_at IS NOT NULL AND scheduled_at IS NOT NULL AND raises_prices IS NOT NULL)),
  CHECK (status NOT IN ('active','retired') OR activated_at IS NOT NULL),
  CHECK ((status = 'retired') = (retired_at IS NOT NULL))
);
CREATE UNIQUE INDEX price_book_revision_one_active ON billing.price_book_revision ((true)) WHERE status = 'active';
CREATE UNIQUE INDEX price_book_revision_effective ON billing.price_book_revision (effective_at) WHERE status <> 'draft';

CREATE TABLE billing.model_rate (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  revision_id uuid NOT NULL REFERENCES billing.price_book_revision(id),
  label text NOT NULL CHECK (length(label) BETWEEN 2 AND 200),
  -- billing.model_provider() of the provider revision: dgx, openrouter, google…
  provider text NOT NULL CHECK (provider ~ '^[a-z][a-z0-9_]{1,39}$'),
  -- The provider's model id; NULL prices every model of the provider (the DGX).
  model_id text CHECK (model_id IS NULL OR length(model_id) BETWEEN 1 AND 200),
  -- Prompt-size tier: the row applies to calls with more input tokens than this.
  min_input_tokens integer NOT NULL DEFAULT 0 CHECK (min_input_tokens >= 0),
  input_ucr_per_m bigint NOT NULL,
  output_ucr_per_m bigint NOT NULL,
  -- NULL: cached input is charged at the input rate.
  cached_ucr_per_m bigint,
  -- Cost snapshot: how the rate was derived.
  cost_basis text NOT NULL CHECK (cost_basis IN ('list_price','internal_estimate')),
  usd_input_per_m numeric(14,6) CHECK (usd_input_per_m IS NULL OR usd_input_per_m >= 0),
  usd_output_per_m numeric(14,6) CHECK (usd_output_per_m IS NULL OR usd_output_per_m >= 0),
  usd_cached_per_m numeric(14,6) CHECK (usd_cached_per_m IS NULL OR usd_cached_per_m >= 0),
  eur_input_per_m numeric(14,6) NOT NULL CHECK (eur_input_per_m >= 0),
  eur_output_per_m numeric(14,6) NOT NULL CHECK (eur_output_per_m >= 0),
  routing_fee_bps integer NOT NULL DEFAULT 0 CHECK (routing_fee_bps BETWEEN 0 AND 5000),
  source text NOT NULL CHECK (length(source) BETWEEN 3 AND 500),
  source_accessed_on date,
  -- §6.4: rounded up to the next 5 credits per 1M tokens, minimum 10 credits.
  CONSTRAINT model_rate_grid CHECK (
    input_ucr_per_m >= 10000000 AND input_ucr_per_m % 5000000 = 0
    AND output_ucr_per_m >= 10000000 AND output_ucr_per_m % 5000000 = 0
    AND (cached_ucr_per_m IS NULL OR (cached_ucr_per_m >= 10000000 AND cached_ucr_per_m % 5000000 = 0))
    AND input_ucr_per_m <= 1000000000000 AND output_ucr_per_m <= 1000000000000),
  CHECK (cost_basis = 'internal_estimate' OR (usd_input_per_m IS NOT NULL AND usd_output_per_m IS NOT NULL)),
  UNIQUE NULLS NOT DISTINCT (revision_id, provider, model_id, min_input_tokens)
);
CREATE INDEX model_rate_lookup ON billing.model_rate (revision_id, provider, model_id);

CREATE TABLE billing.action_rate (
  revision_id uuid NOT NULL REFERENCES billing.price_book_revision(id),
  meter text NOT NULL CHECK (meter IN ('website_question','api_question','graded_answer','web_page_read','document_page','web_search_query')),
  unit text NOT NULL CHECK (unit IN ('question','answer','page','query')),
  ucr_per_unit bigint NOT NULL CHECK (ucr_per_unit > 0 AND ucr_per_unit <= 1000000000000),
  label text NOT NULL CHECK (length(label) BETWEEN 2 AND 200),
  PRIMARY KEY (revision_id, meter)
);

-- ECB euro reference rates (monthly, first working day; §6.4).
CREATE TABLE billing.fx_rate (
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$' AND currency <> 'EUR'),
  rate_date date NOT NULL,
  per_eur numeric(14,6) NOT NULL CHECK (per_eur > 0),
  source text NOT NULL CHECK (length(source) BETWEEN 3 AND 300),
  recorded_by text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (currency, rate_date)
);

-- Weekly provider-price checks against the revision in effect (§6.4).
CREATE TABLE billing.price_check (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checked_at timestamptz NOT NULL DEFAULT now(),
  actor_id text NOT NULL,
  revision_id uuid NOT NULL REFERENCES billing.price_book_revision(id),
  fx_usd_per_eur numeric(14,6),
  fx_date date,
  checked integer NOT NULL CHECK (checked >= 0),
  changed integer NOT NULL CHECK (changed >= 0),
  unavailable integer NOT NULL CHECK (unavailable >= 0),
  changes jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(changes) = 'array')
);
CREATE INDEX price_check_recent ON billing.price_check (checked_at DESC);
CREATE TRIGGER price_check_append_only BEFORE UPDATE OR DELETE ON billing.price_check
  FOR EACH ROW EXECUTE FUNCTION billing.reject_ledger_mutation();

-- Ledger references to a price revision now point at a real one.
ALTER TABLE billing.ledger_entry ADD CONSTRAINT ledger_entry_price_book_revision_fk
  FOREIGN KEY (price_book_revision_id) REFERENCES billing.price_book_revision(id);
ALTER TABLE billing.credit_hold ADD CONSTRAINT credit_hold_price_book_revision_fk
  FOREIGN KEY (price_book_revision_id) REFERENCES billing.price_book_revision(id);

/* ------------------------------------------------------ immutability --- */

-- A revision is edited only as a draft. Afterwards only its lifecycle moves:
-- scheduled -> active (effective_at may come forward to now), scheduled ->
-- draft (before it takes effect), active -> retired. Nothing is deleted
-- once scheduled.
CREATE FUNCTION billing.price_book_revision_guard() RETURNS trigger
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
CREATE TRIGGER price_book_revision_guard BEFORE UPDATE OR DELETE ON billing.price_book_revision
  FOR EACH ROW EXECUTE FUNCTION billing.price_book_revision_guard();

-- Rates change only while their revision is a draft.
CREATE FUNCTION billing.price_book_rates_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') AND EXISTS (SELECT 1 FROM billing.price_book_revision WHERE id = OLD.revision_id AND status <> 'draft') THEN
    RAISE EXCEPTION 'PRICE_BOOK_IMMUTABLE' USING ERRCODE = '55000';
  END IF;
  IF TG_OP IN ('INSERT','UPDATE') AND EXISTS (SELECT 1 FROM billing.price_book_revision WHERE id = NEW.revision_id AND status <> 'draft') THEN
    RAISE EXCEPTION 'PRICE_BOOK_IMMUTABLE' USING ERRCODE = '55000';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER model_rate_guard BEFORE INSERT OR UPDATE OR DELETE ON billing.model_rate
  FOR EACH ROW EXECUTE FUNCTION billing.price_book_rates_guard();
CREATE TRIGGER action_rate_guard BEFORE INSERT OR UPDATE OR DELETE ON billing.action_rate
  FOR EACH ROW EXECUTE FUNCTION billing.price_book_rates_guard();
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['price_book_revision','model_rate','action_rate','price_check'] LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE TRUNCATE ON billing.%I FOR EACH STATEMENT EXECUTE FUNCTION billing.reject_ledger_mutation()', t || '_no_truncate', t);
  END LOOP;
END $$;

/* ------------------------------------------------------------ lookups --- */

-- The provider key a model rate is filed under, from a provider revision.
CREATE FUNCTION billing.model_provider(p_adapter text, p_endpoint text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$
  SELECT CASE
    WHEN p_adapter = 'dgx' THEN 'dgx'
    ELSE CASE lower(split_part(split_part(split_part(coalesce(p_endpoint, ''), '://', 2), '/', 1), ':', 1))
      WHEN 'openrouter.ai' THEN 'openrouter'
      WHEN 'generativelanguage.googleapis.com' THEN 'google'
      WHEN 'api.openai.com' THEN 'openai'
      WHEN 'api.anthropic.com' THEN 'anthropic'
      WHEN 'api.mistral.ai' THEN 'mistral'
      WHEN 'api.deepseek.com' THEN 'deepseek'
      WHEN 'integrate.api.nvidia.com' THEN 'nvidia'
      ELSE left('host_' || regexp_replace(lower(split_part(split_part(split_part(coalesce(p_endpoint, ''), '://', 2), '/', 1), ':', 1)), '[^a-z0-9]+', '_', 'g'), 40)
    END END
$$;

-- Google's OpenAI-compatible endpoint accepts "models/<id>" as well as "<id>".
CREATE FUNCTION billing.model_key(p_provider text, p_model_id text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$
  SELECT CASE WHEN p_provider = 'google' THEN regexp_replace(p_model_id, '^models/', '') ELSE p_model_id END
$$;

-- The rate key of a provider revision (its endpoint stays private to the
-- admin and worker roles): provider, normalised model id and free flag.
-- Defined after the free_model column below.

-- The revision in effect at an instant: the latest non-draft revision whose
-- effective_at is at or before it.
CREATE FUNCTION billing.price_book_at(p_at timestamptz DEFAULT now()) RETURNS billing.price_book_revision
LANGUAGE sql STABLE SET search_path = pg_catalog AS $$
  SELECT * FROM billing.price_book_revision
  WHERE status IN ('scheduled','active','retired') AND effective_at <= coalesce(p_at, now())
  ORDER BY effective_at DESC LIMIT 1
$$;

-- The model rate for a call: an exact model id beats a provider-wide row,
-- and the highest prompt-size tier the call exceeds wins.
CREATE FUNCTION billing.rate_for(p_revision_id uuid, p_provider text, p_model_id text, p_input_tokens integer DEFAULT 0)
RETURNS billing.model_rate
LANGUAGE sql STABLE SET search_path = pg_catalog AS $$
  SELECT * FROM billing.model_rate
  WHERE revision_id = p_revision_id AND provider = p_provider
    AND (model_id IS NULL OR model_id = billing.model_key(p_provider, p_model_id))
    AND min_input_tokens <= greatest(coalesce(p_input_tokens, 0) - 1, 0)
  ORDER BY (model_id IS NULL), min_input_tokens DESC LIMIT 1
$$;

-- Why a model may not serve a customer route, or NULL when it may (§6.4 G9).
CREATE FUNCTION billing.model_price_issue(p_adapter text, p_endpoint text, p_model_id text, p_free_model boolean,
  p_input_price numeric, p_output_price numeric)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE prov text := billing.model_provider(p_adapter, p_endpoint);
BEGIN
  IF coalesce(p_free_model, false) THEN RETURN NULL; END IF;
  -- The DGX is capacity-priced: its cost is internal_cost_per_second, not tokens.
  IF p_adapter <> 'dgx' AND coalesce(p_input_price, 0) = 0 AND coalesce(p_output_price, 0) = 0 THEN
    RETURN 'MODEL_PRICE_ZERO';
  END IF;
  IF EXISTS (
    SELECT 1 FROM billing.price_book_revision r
    WHERE (r.id = (billing.price_book_at(now())).id OR r.status = 'scheduled')
      AND (billing.rate_for(r.id, prov, p_model_id, 0)).id IS NULL
  ) OR (billing.price_book_at(now())).id IS NULL THEN
    RETURN 'MODEL_RATE_MISSING';
  END IF;
  RETURN NULL;
END $$;

-- €0 guard on every customer route table.
CREATE FUNCTION evals.assert_route_priced() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE p record; issue text;
BEGIN
  SELECT pv.adapter, pv.endpoint, pv.model_id, pv.free_model, pr.input_price, pr.output_price INTO p
  FROM evals.provider_revision pv
  JOIN evals.price_revision pr ON pr.id = NEW.price_revision_id AND pr.provider_revision_id = pv.id
  WHERE pv.id = NEW.provider_revision_id;
  -- A mismatched pair is left to the foreign keys.
  IF NOT FOUND THEN RETURN NEW; END IF;
  issue := billing.model_price_issue(p.adapter, p.endpoint, p.model_id, p.free_model, p.input_price, p.output_price);
  IF issue IS NOT NULL THEN RAISE EXCEPTION '%', issue USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END $$;

-- Free models are explicit (§6.4): the flag is fixed when a revision is
-- registered, like every other provider revision column.
ALTER TABLE evals.provider_revision ADD COLUMN free_model boolean NOT NULL DEFAULT false;
-- Registered OpenRouter ":free" models are free by definition: flag them.
ALTER TABLE evals.provider_revision DISABLE TRIGGER immutable_execution;
UPDATE evals.provider_revision pv SET free_model = true
WHERE pv.adapter = 'openai_compatible' AND billing.model_provider(pv.adapter, pv.endpoint) = 'openrouter'
  AND pv.model_id ~ ':free$'
  AND NOT EXISTS (SELECT 1 FROM evals.price_revision pr WHERE pr.provider_revision_id = pv.id
                  AND (pr.input_price > 0 OR pr.output_price > 0 OR pr.cache_price > 0 OR pr.tool_price > 0));
ALTER TABLE evals.provider_revision ENABLE TRIGGER immutable_execution;

CREATE FUNCTION billing.provider_revision_rate_key(p_provider_revision_id uuid)
RETURNS TABLE (provider text, model_key text, free_model boolean, roles text[])
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT billing.model_provider(p.adapter, p.endpoint), billing.model_key(billing.model_provider(p.adapter, p.endpoint), p.model_id), p.free_model, p.roles
  FROM evals.provider_revision p WHERE p.id = p_provider_revision_id
$$;

CREATE TRIGGER route_priced BEFORE INSERT OR UPDATE OF provider_revision_id, price_revision_id ON evals.platform_model_route
  FOR EACH ROW EXECUTE FUNCTION evals.assert_route_priced();
CREATE TRIGGER route_priced BEFORE INSERT OR UPDATE OF provider_revision_id, price_revision_id ON evals.generation_provider_route
  FOR EACH ROW EXECUTE FUNCTION evals.assert_route_priced();
CREATE TRIGGER route_priced BEFORE INSERT OR UPDATE OF provider_revision_id, price_revision_id ON evals.evaluation_model_route
  FOR EACH ROW EXECUTE FUNCTION evals.assert_route_priced();

-- Every customer route with a pricing issue against a revision (default:
-- the one in effect and every scheduled one). Platform admins and services.
CREATE FUNCTION billing.route_price_issues(p_revision_id uuid DEFAULT NULL)
RETURNS TABLE (scope text, org_id uuid, evaluation_id uuid, role text, provider_revision_id uuid, provider text,
  model_id text, issue text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
#variable_conflict use_column
BEGIN
  PERFORM billing._privileged();
  RETURN QUERY
  WITH routes AS (
    SELECT 'platform'::text AS scope, NULL::uuid AS org_id, NULL::uuid AS evaluation_id, r.role, r.provider_revision_id, r.price_revision_id
    FROM evals.platform_model_route r
    UNION ALL SELECT 'workspace', r.org_id, NULL::uuid, r.role, r.provider_revision_id, r.price_revision_id FROM evals.generation_provider_route r
    UNION ALL SELECT 'evaluation', r.org_id, r.evaluation_id, r.role, r.provider_revision_id, r.price_revision_id FROM evals.evaluation_model_route r
  ), priced AS (
    SELECT x.*, pv.adapter, pv.endpoint, pv.model_id, pv.free_model, pr.input_price, pr.output_price,
      billing.model_provider(pv.adapter, pv.endpoint) AS provider
    FROM routes x JOIN evals.provider_revision pv ON pv.id = x.provider_revision_id
    JOIN evals.price_revision pr ON pr.id = x.price_revision_id
  )
  SELECT p.scope, p.org_id, p.evaluation_id, p.role, p.provider_revision_id, p.provider, p.model_id,
    CASE WHEN p_revision_id IS NULL
      THEN billing.model_price_issue(p.adapter, p.endpoint, p.model_id, p.free_model, p.input_price, p.output_price)
      WHEN p.free_model THEN NULL
      WHEN p.adapter <> 'dgx' AND p.input_price = 0 AND p.output_price = 0 THEN 'MODEL_PRICE_ZERO'
      WHEN (billing.rate_for(p_revision_id, p.provider, p.model_id, 0)).id IS NULL THEN 'MODEL_RATE_MISSING'
    END AS issue
  FROM priced p
  ORDER BY 1, 2 NULLS FIRST, 3 NULLS FIRST, 4;
END $$;

/* ---------------------------------------------------------- lifecycle --- */

CREATE FUNCTION billing._price_audit(p_action text, p_revision billing.price_book_revision, p_details jsonb DEFAULT '{}'::jsonb)
RETURNS void
LANGUAGE sql SET search_path = pg_catalog AS $$
  INSERT INTO evals.audit_event (org_id, actor_id, action, subject_id, details)
  VALUES (evals.org_id(), billing._actor(), p_action, p_revision.id::text,
    jsonb_build_object('revision', p_revision.revision, 'status', p_revision.status,
      'effective_at', p_revision.effective_at, 'raises_prices', p_revision.raises_prices) || coalesce(p_details, '{}'::jsonb))
$$;

-- Whether any rate in p_new is higher than the same rate in p_old.
CREATE FUNCTION billing._raises_prices(p_old uuid, p_new uuid) RETURNS boolean
LANGUAGE sql STABLE SET search_path = pg_catalog AS $$
  SELECT EXISTS (
    SELECT 1 FROM billing.model_rate n JOIN billing.model_rate o
      ON o.revision_id = p_old AND o.provider = n.provider AND o.model_id IS NOT DISTINCT FROM n.model_id
     AND o.min_input_tokens = n.min_input_tokens
    WHERE n.revision_id = p_new AND (n.input_ucr_per_m > o.input_ucr_per_m OR n.output_ucr_per_m > o.output_ucr_per_m
      OR coalesce(n.cached_ucr_per_m, n.input_ucr_per_m) > coalesce(o.cached_ucr_per_m, o.input_ucr_per_m))
  ) OR EXISTS (
    SELECT 1 FROM billing.action_rate n JOIN billing.action_rate o ON o.revision_id = p_old AND o.meter = n.meter
    WHERE n.revision_id = p_new AND n.ucr_per_unit > o.ucr_per_unit
  )
$$;

-- Moves every scheduled revision that is due to active, in order, retiring
-- the one it replaces. Returns the revisions it activated.
CREATE FUNCTION billing._activate_due() RETURNS SETOF billing.price_book_revision
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

-- Creates a draft revision with its full rate list. Rates are computed by
-- lib/billing/price-book.ts from the provider list prices, FX, routing fee
-- and multiplier; the database checks the 5-credit grid and the minimum.
CREATE FUNCTION billing.create_price_book_draft(p_title text, p_notes text, p_multiplier numeric, p_fx_usd_per_eur numeric,
  p_fx_date date, p_fx_source text, p_based_on uuid, p_model_rates jsonb, p_action_rates jsonb)
RETURNS billing.price_book_revision
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE r billing.price_book_revision; next_revision integer;
BEGIN
  PERFORM billing._privileged();
  IF p_model_rates IS NULL OR jsonb_typeof(p_model_rates) <> 'array' OR jsonb_array_length(p_model_rates) NOT BETWEEN 1 AND 500
     OR p_action_rates IS NULL OR jsonb_typeof(p_action_rates) <> 'array' THEN
    RAISE EXCEPTION 'INPUT_INVALID';
  END IF;
  IF p_based_on IS NOT NULL AND NOT EXISTS (SELECT 1 FROM billing.price_book_revision WHERE id = p_based_on) THEN
    RAISE EXCEPTION 'INPUT_INVALID';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('billing.price_book'));
  SELECT coalesce(max(revision), 0) + 1 INTO next_revision FROM billing.price_book_revision;
  INSERT INTO billing.price_book_revision (revision, title, notes, multiplier, fx_usd_per_eur, fx_date, fx_source, based_on_id, created_by)
  VALUES (next_revision, p_title, p_notes, p_multiplier, p_fx_usd_per_eur, p_fx_date, p_fx_source, p_based_on, billing._actor())
  RETURNING * INTO r;
  INSERT INTO billing.model_rate (revision_id, label, provider, model_id, min_input_tokens, input_ucr_per_m, output_ucr_per_m,
    cached_ucr_per_m, cost_basis, usd_input_per_m, usd_output_per_m, usd_cached_per_m, eur_input_per_m, eur_output_per_m,
    routing_fee_bps, source, source_accessed_on)
  SELECT r.id, x.label, x.provider, x.model_id, coalesce(x.min_input_tokens, 0), x.input_ucr_per_m, x.output_ucr_per_m,
    x.cached_ucr_per_m, x.cost_basis, x.usd_input_per_m, x.usd_output_per_m, x.usd_cached_per_m, x.eur_input_per_m,
    x.eur_output_per_m, coalesce(x.routing_fee_bps, 0), x.source, x.source_accessed_on
  FROM jsonb_to_recordset(p_model_rates) AS x(label text, provider text, model_id text, min_input_tokens integer,
    input_ucr_per_m bigint, output_ucr_per_m bigint, cached_ucr_per_m bigint, cost_basis text, usd_input_per_m numeric,
    usd_output_per_m numeric, usd_cached_per_m numeric, eur_input_per_m numeric, eur_output_per_m numeric,
    routing_fee_bps integer, source text, source_accessed_on date);
  INSERT INTO billing.action_rate (revision_id, meter, unit, ucr_per_unit, label)
  SELECT r.id, x.meter, x.unit, x.ucr_per_unit, x.label
  FROM jsonb_to_recordset(p_action_rates) AS x(meter text, unit text, ucr_per_unit bigint, label text);
  PERFORM billing._price_audit('billing.price_book.drafted', r, jsonb_build_object('model_rates', jsonb_array_length(p_model_rates)));
  RETURN r;
END $$;

-- Schedules a draft. It must price every meter and the local model (the
-- default route, D-09), keep every current customer route priced, follow
-- every other scheduled revision, and give 30 days' notice when any rate
-- rises. An effective_at in the past means "now".
CREATE FUNCTION billing.schedule_price_book(p_revision_id uuid, p_effective_at timestamptz)
RETURNS billing.price_book_revision
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE r billing.price_book_revision; prev billing.price_book_revision; effective timestamptz; raises boolean;
BEGIN
  PERFORM billing._privileged();
  IF p_revision_id IS NULL OR p_effective_at IS NULL THEN RAISE EXCEPTION 'INPUT_INVALID'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('billing.price_book'));
  SELECT * INTO r FROM billing.price_book_revision WHERE id = p_revision_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PRICE_BOOK_NOT_FOUND'; END IF;
  IF r.status <> 'draft' THEN RAISE EXCEPTION 'PRICE_BOOK_TRANSITION'; END IF;
  effective := greatest(p_effective_at, now());
  IF (SELECT count(*) FROM billing.action_rate WHERE revision_id = r.id) <> 6
     OR NOT EXISTS (SELECT 1 FROM billing.model_rate WHERE revision_id = r.id AND provider = 'dgx' AND model_id IS NULL) THEN
    RAISE EXCEPTION 'PRICE_BOOK_INCOMPLETE';
  END IF;
  IF EXISTS (SELECT 1 FROM billing.price_book_revision WHERE status IN ('scheduled','active') AND effective_at >= effective) THEN
    RAISE EXCEPTION 'SCHEDULE_CONFLICT';
  END IF;
  IF EXISTS (SELECT 1 FROM billing.route_price_issues(r.id) WHERE issue IS NOT NULL) THEN
    RAISE EXCEPTION 'ROUTE_UNPRICED';
  END IF;
  prev := billing.price_book_at(effective);
  raises := prev.id IS NOT NULL AND billing._raises_prices(prev.id, r.id);
  IF raises AND effective < now() + interval '30 days' THEN RAISE EXCEPTION 'NOTICE_PERIOD_REQUIRED'; END IF;
  UPDATE billing.price_book_revision SET status = 'scheduled', effective_at = effective, raises_prices = raises,
    scheduled_by = billing._actor(), scheduled_at = now()
  WHERE id = r.id RETURNING * INTO r;
  PERFORM billing._price_audit('billing.price_book.scheduled', r, '{}'::jsonb);
  RETURN r;
END $$;

-- Puts a scheduled revision that has not taken effect back to draft.
CREATE FUNCTION billing.cancel_price_book(p_revision_id uuid) RETURNS billing.price_book_revision
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

-- Activates a scheduled revision. One that is not yet due comes forward to
-- now, unless it raises prices (the notice period stands) or another
-- scheduled revision is due before it.
CREATE FUNCTION billing.activate_price_book(p_revision_id uuid) RETURNS billing.price_book_revision
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

-- The hourly job (evals scheduler): status labels follow effective dates.
CREATE FUNCTION billing.activate_due_price_books() RETURNS SETOF billing.price_book_revision
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  PERFORM billing._privileged();
  PERFORM pg_advisory_xact_lock(hashtext('billing.price_book'));
  RETURN QUERY SELECT * FROM billing._activate_due();
END $$;

-- Records an ECB reference rate (monthly job and scripts/billing/check-provider-prices.ts).
CREATE FUNCTION billing.record_fx_rate(p_currency text, p_rate_date date, p_per_eur numeric, p_source text)
RETURNS billing.fx_rate
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE f billing.fx_rate;
BEGIN
  PERFORM billing._privileged();
  IF p_rate_date IS NULL OR p_rate_date > current_date + 1 OR p_per_eur IS NULL OR p_per_eur <= 0 OR p_per_eur > 1000000 THEN
    RAISE EXCEPTION 'INPUT_INVALID';
  END IF;
  INSERT INTO billing.fx_rate (currency, rate_date, per_eur, source, recorded_by)
  VALUES (p_currency, p_rate_date, p_per_eur, p_source, billing._actor())
  ON CONFLICT (currency, rate_date) DO NOTHING;
  SELECT * INTO f FROM billing.fx_rate WHERE currency = p_currency AND rate_date = p_rate_date;
  IF f.per_eur <> p_per_eur THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF;
  RETURN f;
END $$;

-- Records one provider-price check (weekly job and the script).
CREATE FUNCTION billing.record_price_check(p_revision_id uuid, p_fx_usd_per_eur numeric, p_fx_date date, p_checked integer,
  p_changed integer, p_unavailable integer, p_changes jsonb)
RETURNS billing.price_check
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE c billing.price_check;
BEGIN
  PERFORM billing._privileged();
  INSERT INTO billing.price_check (actor_id, revision_id, fx_usd_per_eur, fx_date, checked, changed, unavailable, changes)
  VALUES (billing._actor(), p_revision_id, p_fx_usd_per_eur, p_fx_date, p_checked, p_changed, p_unavailable, coalesce(p_changes, '[]'::jsonb))
  RETURNING * INTO c;
  RETURN c;
END $$;

/* --------------------------------------------------- estimator stats --- */

-- Platform-wide aggregates for the run estimator (§6.7): per engine role
-- (and per role and model) token usage of completed calls, and per
-- connection kind (role = website | api) the seconds per question of
-- completed runs, judging included. Aggregates
-- only: no workspace, run or content leaves this function.
CREATE FUNCTION billing.estimate_stats(p_since timestamptz, p_until timestamptz DEFAULT now())
RETURNS TABLE (kind text, role text, provider text, model_id text, samples integer,
  mean_input double precision, sd_input double precision, p50_input double precision, p90_input double precision,
  mean_output double precision, sd_output double precision, p50_output double precision, p90_output double precision,
  p90_input_bound double precision, p90_output_bound double precision, p50_seconds double precision, p90_seconds double precision)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
#variable_conflict use_column
BEGIN
  PERFORM billing._actor();
  IF p_since IS NULL OR p_until IS NULL OR p_until <= p_since OR p_until - p_since > interval '400 days' THEN
    RAISE EXCEPTION 'INPUT_INVALID';
  END IF;
  RETURN QUERY
  WITH calls AS (
    SELECT s.input->>'role' AS role, billing.model_provider(pv.adapter, pv.endpoint) AS provider,
      billing.model_key(billing.model_provider(pv.adapter, pv.endpoint), pv.model_id) AS model_id,
      (x.output->'usage'->>'input')::double precision AS inp, (x.output->'usage'->>'output')::double precision AS outp,
      (a.token_bound - (s.input->>'maxOutputTokens')::integer)::double precision AS in_bound,
      (s.input->>'maxOutputTokens')::double precision AS out_bound,
      (x.output->>'latencyMs')::double precision / 1000 AS secs
    FROM evals.execution_result x
    JOIN evals.workflow_step s ON s.org_id = x.org_id AND s.id = x.step_id
    JOIN evals.execution_attempt a ON a.org_id = x.org_id AND a.id = x.attempt_id
    JOIN evals.provider_revision pv ON pv.id = a.provider_revision_id
    WHERE x.created_at >= p_since AND x.created_at < p_until
      AND s.step_kind IN ('grade','generate','profile')
      AND s.input->>'role' IN ('judge','generator','context_analyzer','report_writer')
      AND coalesce((s.input->>'probe')::boolean, false) = false
      AND jsonb_typeof(x.output->'usage') = 'object'
  ), tokens AS (
    SELECT 'tokens'::text AS kind, c.role, c.provider, c.model_id, count(*)::integer AS samples,
      avg(c.inp), coalesce(stddev_samp(c.inp), 0), percentile_cont(0.5) WITHIN GROUP (ORDER BY c.inp),
      percentile_cont(0.9) WITHIN GROUP (ORDER BY c.inp),
      avg(c.outp), coalesce(stddev_samp(c.outp), 0), percentile_cont(0.5) WITHIN GROUP (ORDER BY c.outp),
      percentile_cont(0.9) WITHIN GROUP (ORDER BY c.outp),
      percentile_cont(0.9) WITHIN GROUP (ORDER BY c.in_bound), percentile_cont(0.9) WITHIN GROUP (ORDER BY c.out_bound),
      percentile_cont(0.5) WITHIN GROUP (ORDER BY c.secs), percentile_cont(0.9) WITHIN GROUP (ORDER BY c.secs)
    FROM calls c
    GROUP BY GROUPING SETS ((c.role, c.provider, c.model_id), (c.role))
  ), runs AS (
    SELECT CASE WHEN tr.document->>'kind' = 'website' THEN 'website' ELSE 'api' END AS conn,
      extract(epoch FROM greatest(max(u.updated_at),
        coalesce((SELECT max(j.updated_at) FROM evals.judge_job j WHERE j.org_id = r.org_id AND j.run_id = r.id), max(u.updated_at)))
        - r.created_at) / count(u.*) AS secs
    FROM evals.run r
    JOIN evals.target_revision tr ON tr.org_id = r.org_id AND tr.id = r.target_revision_id
    JOIN evals.case_unit u ON u.org_id = r.org_id AND u.run_id = r.id
    WHERE r.status = 'completed' AND r.execution_mode = 'deployed_system'
      AND r.created_at >= p_since AND r.created_at < p_until
    GROUP BY r.id, r.org_id, r.created_at, tr.document->>'kind'
    HAVING count(u.*) >= 3
  ), throughput AS (
    SELECT 'throughput'::text, r.conn, NULL::text, NULL::text, count(*)::integer,
      NULL::double precision, NULL::double precision, NULL::double precision, NULL::double precision,
      NULL::double precision, NULL::double precision, NULL::double precision, NULL::double precision,
      NULL::double precision, NULL::double precision,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY r.secs), percentile_cont(0.9) WITHIN GROUP (ORDER BY r.secs)
    FROM runs r WHERE r.secs > 0 GROUP BY r.conn
  )
  SELECT * FROM tokens UNION ALL SELECT * FROM throughput;
END $$;

/* --------------------------------------------------------------- seed --- */

INSERT INTO billing.fx_rate (currency, rate_date, per_eur, source, recorded_by)
VALUES ('USD', '2026-08-19', 1.1605, 'ECB euro foreign exchange reference rate (spec v2 §6.4)', 'system:migration-088');

-- Both revisions start as drafts so their rates go through the same guard.
INSERT INTO billing.price_book_revision (id, revision, status, title, notes, multiplier, fx_usd_per_eur, fx_date, fx_source,
  based_on_id, created_by)
VALUES ('6a1f0c4e-8b2d-4f37-9c51-2e7d1a0b3c88', 1, 'draft', 'Launch price book (spec v2 §6.4)',
  'Provider list prices accessed 2026-10-11. Credit rate = cost × 1.5 × 100, rounded up to the next 5 credits per 1M tokens, minimum 10.',
  1.5, 1.1605, '2026-08-19', 'ECB euro foreign exchange reference rate', NULL, 'system:migration-088');
INSERT INTO billing.price_book_revision (id, revision, status, title, notes, multiplier, fx_usd_per_eur, fx_date, fx_source,
  based_on_id, created_by)
VALUES ('9d3e5b70-1c4a-4e2b-8f6d-7a2c9e1b4d05', 2, 'draft', 'Gemini 3.8 Flash price increase (1 Jan 2027)',
  'Google announced Gemini 3.8 Flash list prices doubling from 1 Jan 2027 (spec v2 §6.4 example). Everything else as revision 1.',
  1.5, 1.1605, '2026-08-19', 'ECB euro foreign exchange reference rate', '6a1f0c4e-8b2d-4f37-9c51-2e7d1a0b3c88', 'system:migration-088');

-- Revision 1 rates. FX 1.1605 USD per EUR; OpenRouter routing fee +5.5 %
-- (550 bps); Google billed directly. EUR columns are the cost per 1M tokens.
INSERT INTO billing.model_rate (revision_id, label, provider, model_id, min_input_tokens, input_ucr_per_m, output_ucr_per_m,
  cost_basis, usd_input_per_m, usd_output_per_m, eur_input_per_m, eur_output_per_m, routing_fee_bps, source, source_accessed_on)
SELECT '6a1f0c4e-8b2d-4f37-9c51-2e7d1a0b3c88', label, provider, model_id, min_input, cin::bigint * 1000000, cout::bigint * 1000000, basis,
  usd_in, usd_out,
  CASE WHEN basis = 'list_price' THEN round(usd_in / 1.1605 * (10000 + bps) / 10000, 6) ELSE eur_in END,
  CASE WHEN basis = 'list_price' THEN round(usd_out / 1.1605 * (10000 + bps) / 10000, 6) ELSE eur_out END,
  bps, src, '2026-10-11'
FROM (VALUES
  ('Caudals Local (DeepSeek V4 Flash on the DGX)', 'dgx', NULL, 0, 50, 200, 'internal_estimate', NULL::numeric, NULL::numeric, 0.5, 0.5, 0,
    'Internal GPU-time estimate, about €0.5 per 1M tokens blended (capacity-priced)'),
  ('GPT-6 Luna (OpenAI)', 'openrouter', 'openai/gpt-6-luna', 0, 15, 70, 'list_price', 0.10, 0.50, NULL::numeric, NULL::numeric, 550,
    'https://openrouter.ai/openai/gpt-6-luna'),
  ('Claude Haiku 5.5, prompts up to 100K (Anthropic)', 'openrouter', 'anthropic/claude-haiku-5.5', 0, 15, 70, 'list_price', 0.10, 0.50, NULL, NULL, 550,
    'https://openrouter.ai/anthropic/claude-haiku-5.5'),
  ('Claude Haiku 5.5, prompts over 100K (Anthropic)', 'openrouter', 'anthropic/claude-haiku-5.5', 100000, 70, 345, 'list_price', 0.50, 2.50, NULL, NULL, 550,
    'https://www.anthropic.com/pricing'),
  ('Gemini 3.1 Flash-Lite (Google)', 'google', 'gemini-3.1-flash-lite', 0, 35, 195, 'list_price', 0.25, 1.50, NULL, NULL, 0,
    'https://ai.google.dev/gemini-api/docs/pricing'),
  ('DeepSeek V4.1 Flash, peak hours (DeepSeek)', 'openrouter', 'deepseek/deepseek-v4.1-flash', 0, 45, 165, 'list_price', 0.30, 1.20, NULL, NULL, 550,
    'https://api-docs.deepseek.com/quick_start/pricing'),
  ('Mistral Large (Mistral, EU)', 'openrouter', 'mistralai/mistral-large-2512', 0, 70, 205, 'list_price', 0.50, 1.50, NULL, NULL, 550,
    'https://mistral.ai/pricing'),
  ('Gemini 3.8 Flash (Google)', 'google', 'gemini-3.8-flash', 0, 100, 485, 'list_price', 0.75, 3.75, NULL, NULL, 0,
    'https://ai.google.dev/gemini-api/docs/pricing'),
  ('DeepSeek V4 Pro, peak hours (DeepSeek)', 'openrouter', 'deepseek/deepseek-v4-pro', 0, 180, 540, 'list_price', 1.32, 3.96, NULL, NULL, 550,
    'https://api-docs.deepseek.com/quick_start/pricing'),
  ('Gemini 3.1 Pro preview, prompts up to 200K (Google)', 'google', 'gemini-3.1-pro-preview', 0, 260, 1555, 'list_price', 2.00, 12.00, NULL, NULL, 0,
    'https://ai.google.dev/gemini-api/docs/pricing'),
  ('GPT-6.1 Sol (OpenAI)', 'openrouter', 'openai/gpt-6.1-sol', 0, 275, 1365, 'list_price', 2.00, 10.00, NULL, NULL, 550,
    'https://openrouter.ai/openai/gpt-6.1-sol'),
  ('Claude Sonnet 5.5 (Anthropic)', 'openrouter', 'anthropic/claude-sonnet-5.5', 0, 275, 1365, 'list_price', 2.00, 10.00, NULL, NULL, 550,
    'https://openrouter.ai/anthropic/claude-sonnet-5.5'),
  ('Claude Opus 5.5 (Anthropic)', 'openrouter', 'anthropic/claude-opus-5.5', 0, 550, 2730, 'list_price', 4.00, 20.00, NULL, NULL, 550,
    'https://openrouter.ai/anthropic/claude-opus-5.5')
) AS seed(label, provider, model_id, min_input, cin, cout, basis, usd_in, usd_out, eur_in, eur_out, bps, src);

INSERT INTO billing.action_rate (revision_id, meter, unit, ucr_per_unit, label)
SELECT '6a1f0c4e-8b2d-4f37-9c51-2e7d1a0b3c88', meter, unit, ucr, label FROM (VALUES
  ('website_question', 'question', 5000000::bigint, 'Website chat question'),
  ('api_question', 'question', 2000000::bigint, 'API question'),
  ('graded_answer', 'answer', 1000000::bigint, 'Graded imported answer'),
  ('web_page_read', 'page', 1000000::bigint, 'Reference web page read'),
  ('document_page', 'page', 500000::bigint, 'Document page extracted'),
  ('web_search_query', 'query', 2000000::bigint, 'Web search query (research)')
) AS seed(meter, unit, ucr, label);

-- Revision 2: revision 1 with Gemini 3.8 Flash at the announced 2027 price.
INSERT INTO billing.model_rate (revision_id, label, provider, model_id, min_input_tokens, input_ucr_per_m, output_ucr_per_m,
  cached_ucr_per_m, cost_basis, usd_input_per_m, usd_output_per_m, usd_cached_per_m, eur_input_per_m, eur_output_per_m,
  routing_fee_bps, source, source_accessed_on)
SELECT '9d3e5b70-1c4a-4e2b-8f6d-7a2c9e1b4d05',
  CASE WHEN m.model_id = 'gemini-3.8-flash' THEN 'Gemini 3.8 Flash, from 1 Jan 2027 (Google)' ELSE m.label END,
  m.provider, m.model_id, m.min_input_tokens,
  CASE WHEN m.model_id = 'gemini-3.8-flash' THEN 195000000 ELSE m.input_ucr_per_m END,
  CASE WHEN m.model_id = 'gemini-3.8-flash' THEN 970000000 ELSE m.output_ucr_per_m END,
  m.cached_ucr_per_m, m.cost_basis,
  CASE WHEN m.model_id = 'gemini-3.8-flash' THEN 1.50 ELSE m.usd_input_per_m END,
  CASE WHEN m.model_id = 'gemini-3.8-flash' THEN 7.50 ELSE m.usd_output_per_m END,
  m.usd_cached_per_m,
  CASE WHEN m.model_id = 'gemini-3.8-flash' THEN round(1.50 / 1.1605, 6) ELSE m.eur_input_per_m END,
  CASE WHEN m.model_id = 'gemini-3.8-flash' THEN round(7.50 / 1.1605, 6) ELSE m.eur_output_per_m END,
  m.routing_fee_bps, m.source, m.source_accessed_on
FROM billing.model_rate m WHERE m.revision_id = '6a1f0c4e-8b2d-4f37-9c51-2e7d1a0b3c88';
INSERT INTO billing.action_rate (revision_id, meter, unit, ucr_per_unit, label)
SELECT '9d3e5b70-1c4a-4e2b-8f6d-7a2c9e1b4d05', meter, unit, ucr_per_unit, label FROM billing.action_rate
WHERE revision_id = '6a1f0c4e-8b2d-4f37-9c51-2e7d1a0b3c88';

-- Revision 1 is in effect from the date its prices were taken; revision 2
-- is scheduled for Google's date (81 days ahead: more than the 30-day notice).
UPDATE billing.price_book_revision SET status = 'scheduled', effective_at = '2026-10-11T00:00:00Z', raises_prices = false,
  scheduled_by = 'system:migration-088', scheduled_at = now()
WHERE revision = 1;
UPDATE billing.price_book_revision SET status = 'active', activated_at = now() WHERE revision = 1;
UPDATE billing.price_book_revision SET status = 'scheduled', effective_at = '2027-01-01T00:00:00Z',
  raises_prices = billing._raises_prices('6a1f0c4e-8b2d-4f37-9c51-2e7d1a0b3c88', '9d3e5b70-1c4a-4e2b-8f6d-7a2c9e1b4d05'),
  scheduled_by = 'system:migration-088', scheduled_at = now()
WHERE revision = 2;
-- Every route that exists today must stay valid under the guard (all four
-- engine roles run on the DGX; no commercial model is routed).
DO $$ BEGIN
  PERFORM set_config('evals.actor_id', 'system:migration-088', true);
  IF (SELECT revision FROM billing.price_book_at(now())) IS DISTINCT FROM 1
     OR NOT (SELECT raises_prices FROM billing.price_book_revision WHERE revision = 2)
     OR (SELECT count(*) FROM billing.model_rate WHERE revision_id = '6a1f0c4e-8b2d-4f37-9c51-2e7d1a0b3c88') <> 13
     OR EXISTS (SELECT 1 FROM billing.route_price_issues(NULL) WHERE issue IS NOT NULL) THEN
    RAISE EXCEPTION 'price book seed check failed: a current route would be unpriced';
  END IF;
  PERFORM set_config('evals.actor_id', '', true);
END $$;

/* ------------------------------------------------------------- grants --- */

REVOKE ALL ON billing.price_book_revision, billing.model_rate, billing.action_rate, billing.fx_rate, billing.price_check FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA billing FROM PUBLIC;
DO $$ DECLARE r text; BEGIN
  FOREACH r IN ARRAY ARRAY['evals_runtime','evals_worker','evals_browser','evals_document','evals_execution_admin'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('GRANT USAGE ON SCHEMA billing TO %I', r);
      EXECUTE format('GRANT SELECT ON billing.price_book_revision, billing.model_rate, billing.action_rate, billing.fx_rate TO %I', r);
      EXECUTE format('GRANT EXECUTE ON FUNCTION billing.model_provider(text, text), billing.model_key(text, text),
        billing.price_book_at(timestamptz), billing.rate_for(uuid, text, text, integer),
        billing.model_price_issue(text, text, text, boolean, numeric, numeric), billing.provider_revision_rate_key(uuid) TO %I', r);
    END IF;
  END LOOP;
END $$;
GRANT SELECT ON billing.price_check TO evals_runtime;
-- Price-book changes, FX and price checks: platform admins and services,
-- through the web runtime and the scheduler (a member of evals_runtime).
GRANT EXECUTE ON FUNCTION
  billing.create_price_book_draft(text, text, numeric, numeric, date, text, uuid, jsonb, jsonb),
  billing.schedule_price_book(uuid, timestamptz),
  billing.cancel_price_book(uuid),
  billing.activate_price_book(uuid),
  billing.activate_due_price_books(),
  billing.record_fx_rate(text, date, numeric, text),
  billing.record_price_check(uuid, numeric, date, integer, integer, integer, jsonb),
  billing.route_price_issues(uuid),
  billing.estimate_stats(timestamptz, timestamptz)
TO evals_runtime;
GRANT EXECUTE ON FUNCTION billing.route_price_issues(uuid) TO evals_execution_admin;
-- Trigger and internal helpers stay owner-only.
REVOKE ALL ON FUNCTION evals.assert_route_priced(), billing._raises_prices(uuid, uuid), billing._activate_due(),
  billing._price_audit(text, billing.price_book_revision, jsonb), billing.price_book_revision_guard(),
  billing.price_book_rates_guard() FROM PUBLIC;

COMMIT;
