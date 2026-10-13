-- Billing invoices: invoices and rectifying invoices for credit top-ups
-- (launch spec v2 §6.13, §6.14, §6.16; package L-13; decisions D-04, D-05, I-1, I-4).
--
-- Stripe is not a Spanish invoicing system. Every paid top-up order needs one
-- invoice and every refunded order one rectifying invoice (factura
-- rectificativa) that references the original. This migration records them as
-- documents with the customer's fiscal data, the expected series and the VAT
-- line or legal mention of the order's treatment:
--   invoice_series   the series (§3.2: CAU- credits, CAU-S- services, CAU-R-
--                    rectifying) with the pattern an issued number must match.
--                    To be confirmed with the gestor (confirmed_at stays NULL).
--   invoice          one per paid order (UNIQUE order_id), series CAU.
--   credit_note      one per refunded order (UNIQUE order_id), series CAU-R,
--                    negative amounts, referencing the order's invoice.
--   invoice_document a security-invoker view over both, for owner reads.
--
-- A trigger on billing.top_up_order queues the documents in the same
-- transaction as the payment or refund: when purchase_entry_id is first set
-- (billing.record_purchase) and when the status becomes 'refunded'. It works
-- whichever function moves the order, so later changes to the purchase path
-- keep invoicing. UNIQUE (order_id) makes replays and concurrent deliveries
-- produce one document.
--
-- Documents then move queued -> pending_issue -> issued. The invoicing job
-- (evals scheduler, lib/billing/invoicing/jobs.ts) hands queued documents to
-- the configured adapter (BILLING_INVOICING_PROVIDER). The `manual` adapter
-- (no vendor chosen yet, D-04/I-4) marks them pending_issue: the accountant
-- issues them from the monthly export and ops attach the issued number and PDF
-- through the platform-admin API (billing.issue_invoice_document, audited). A
-- provider adapter may issue directly. Failures stay queued with a backoff
-- (retry queue) and alert after an hour (scripts/evals/health-alerts.sh).
-- Nothing here generates a legal number: a number is only ever recorded as
-- issued, and must match its series (live) or start with TEST- (test mode).
--
-- The issuer (Caudals' legal entity) is not stored: it comes from the
-- LEGAL_ENTITY_* runtime values (I-1), which the provider account or the
-- accountant holds, and never from the §3.2 placeholders.
--
-- Writes go only through the SECURITY DEFINER functions below (service
-- identities and platform admins; ops actions need a reason and are
-- audited). Tables have RLS by org_id; the runtime role reads its scoped
-- workspace's rows and writes none. Test-mode documents (livemode false) can
-- be voided; live documents never are (corrections are rectifying invoices).
--
-- Forward repair: additive. The rollback refuses once any document exists.
BEGIN;

/* ------------------------------------------------------------- helpers --- */

-- The legal mention an invoice carries for a treatment (lib/billing/tax.ts taxMention).
CREATE FUNCTION billing.tax_mention(p_treatment text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$
  SELECT CASE p_treatment WHEN 'eu_reverse_charge' THEN 'Inversión del sujeto pasivo'
    WHEN 'non_eu_not_subject' THEN 'Operación no sujeta' END
$$;

/* ------------------------------------------------------------- tables --- */

CREATE TABLE billing.invoice_series (
  code text PRIMARY KEY CHECK (code ~ '^[A-Z][A-Z0-9-]{1,19}$'),
  purpose text NOT NULL UNIQUE CHECK (purpose IN ('credits','services','rectifying')),
  -- An issued live number must match this pattern (test-mode numbers start with TEST-).
  number_pattern text NOT NULL CHECK (length(number_pattern) BETWEEN 3 AND 200),
  description text NOT NULL CHECK (length(description) BETWEEN 3 AND 200),
  -- Set when the founder has confirmed the series with the gestor.
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO billing.invoice_series (code, purpose, number_pattern, description) VALUES
  ('CAU', 'credits', '^CAU-[0-9][0-9A-Za-z/._-]{0,39}$', 'Credit top-ups'),
  ('CAU-S', 'services', '^CAU-S-[0-9][0-9A-Za-z/._-]{0,39}$', 'Pilots, subscriptions and datasets (issued by the accountant)'),
  ('CAU-R', 'rectifying', '^CAU-R-[0-9][0-9A-Za-z/._-]{0,39}$', 'Rectifying invoices (refunds)');

CREATE TABLE billing.invoice (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES billing.credit_account(org_id),
  order_id uuid NOT NULL UNIQUE,
  livemode boolean NOT NULL,
  series_code text NOT NULL REFERENCES billing.invoice_series(code) CHECK (series_code IN ('CAU','CAU-S')),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','pending_issue','issued','voided')),
  number text CHECK (number IS NULL OR number ~ '^[A-Za-z0-9][A-Za-z0-9/._-]{2,59}$'),
  issue_date date,
  -- The date of the operation: the payment (advance payment, art. 75.Dos LIVA), Madrid time.
  operation_date date NOT NULL,
  locale text NOT NULL CHECK (locale IN ('es','en')),
  currency text NOT NULL DEFAULT 'eur' CHECK (currency = 'eur'),
  net_cents bigint NOT NULL CHECK (net_cents > 0),
  vat_rate_bp integer NOT NULL CHECK (vat_rate_bp IN (0,2100)),
  vat_cents bigint NOT NULL CHECK (vat_cents >= 0),
  gross_cents bigint NOT NULL,
  tax_treatment text NOT NULL CHECK (tax_treatment IN ('es_vat','eu_reverse_charge','non_eu_not_subject')),
  tax_mention text,
  -- The buyer's fiscal details as priced (top_up_order.tax_snapshot).
  customer jsonb NOT NULL CHECK (jsonb_typeof(customer) = 'object'),
  -- [{item: credits|bonus_credits, credits, unit_price_cents, net_cents}]
  lines jsonb NOT NULL CHECK (jsonb_typeof(lines) = 'array' AND jsonb_array_length(lines) BETWEEN 1 AND 20),
  provider text CHECK (provider IS NULL OR provider ~ '^[a-z][a-z0-9_]{1,39}$'),
  provider_reference text CHECK (provider_reference IS NULL OR length(provider_reference) BETWEEN 1 AND 200),
  provider_customer_reference text CHECK (provider_customer_reference IS NULL OR length(provider_customer_reference) BETWEEN 1 AND 200),
  verifactu_status text CHECK (verifactu_status IS NULL OR verifactu_status IN ('not_applicable','pending','accepted','accepted_with_errors','rejected')),
  pdf_object_key text CHECK (pdf_object_key IS NULL OR pdf_object_key ~ '^evals/[0-9a-f-]{36}/[0-9a-f-]{36}/sealed/[0-9a-f-]{36}$'),
  pdf_sha256 text CHECK (pdf_sha256 IS NULL OR pdf_sha256 ~ '^[0-9a-f]{64}$'),
  pdf_byte_size integer CHECK (pdf_byte_size IS NULL OR pdf_byte_size BETWEEN 1 AND 10485760),
  pdf_attached_at timestamptz,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_attempt_at timestamptz,
  last_error_code text CHECK (last_error_code IS NULL OR last_error_code ~ '^[a-z][a-z0-9_]{1,63}$'),
  handed_over_at timestamptz,
  issued_at timestamptz,
  issued_by text CHECK (issued_by IS NULL OR length(issued_by) BETWEEN 1 AND 255),
  voided_at timestamptz,
  void_reason text CHECK (void_reason IS NULL OR length(void_reason) BETWEEN 3 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, id),
  UNIQUE (series_code, number),
  FOREIGN KEY (org_id, order_id) REFERENCES billing.top_up_order(org_id, id),
  CHECK (gross_cents = net_cents + vat_cents),
  CHECK (vat_cents = (net_cents * vat_rate_bp + 5000) / 10000),
  CHECK ((tax_treatment = 'es_vat') = (vat_rate_bp = 2100)),
  CHECK (tax_mention IS NOT DISTINCT FROM billing.tax_mention(tax_treatment)),
  CHECK ((number IS NULL) = (issue_date IS NULL) AND (number IS NULL) = (issued_at IS NULL)),
  CHECK (status <> 'issued' OR number IS NOT NULL),
  CHECK (number IS NULL OR status IN ('issued','voided')),
  CHECK (number IS NULL OR livemode OR number ~ '^TEST-'),
  CHECK (issue_date IS NULL OR issue_date >= operation_date),
  CHECK (status <> 'pending_issue' OR handed_over_at IS NOT NULL),
  CHECK ((pdf_object_key IS NULL) = (pdf_sha256 IS NULL) AND (pdf_sha256 IS NULL) = (pdf_byte_size IS NULL)
     AND (pdf_byte_size IS NULL) = (pdf_attached_at IS NULL)),
  CHECK ((status = 'voided') = (voided_at IS NOT NULL) AND (voided_at IS NULL) = (void_reason IS NULL)),
  CHECK (status <> 'voided' OR NOT livemode)
);
CREATE INDEX invoice_queued ON billing.invoice (next_attempt_at) WHERE status = 'queued';
CREATE INDEX invoice_recent ON billing.invoice (org_id, created_at DESC, id DESC);
CREATE INDEX invoice_operation ON billing.invoice (livemode, operation_date);

CREATE TABLE billing.credit_note (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES billing.credit_account(org_id),
  order_id uuid NOT NULL UNIQUE,
  -- The invoice this rectifies.
  invoice_id uuid NOT NULL,
  livemode boolean NOT NULL,
  series_code text NOT NULL REFERENCES billing.invoice_series(code) CHECK (series_code = 'CAU-R'),
  reason text NOT NULL CHECK (reason IN ('refund')),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','pending_issue','issued','voided')),
  number text CHECK (number IS NULL OR number ~ '^[A-Za-z0-9][A-Za-z0-9/._-]{2,59}$'),
  issue_date date,
  -- The date of the refund, Madrid time.
  operation_date date NOT NULL,
  locale text NOT NULL CHECK (locale IN ('es','en')),
  currency text NOT NULL DEFAULT 'eur' CHECK (currency = 'eur'),
  -- Negative: the amounts the original invoice is reduced by.
  net_cents bigint NOT NULL CHECK (net_cents < 0),
  vat_rate_bp integer NOT NULL CHECK (vat_rate_bp IN (0,2100)),
  vat_cents bigint NOT NULL CHECK (vat_cents <= 0),
  gross_cents bigint NOT NULL,
  tax_treatment text NOT NULL CHECK (tax_treatment IN ('es_vat','eu_reverse_charge','non_eu_not_subject')),
  tax_mention text,
  customer jsonb NOT NULL CHECK (jsonb_typeof(customer) = 'object'),
  lines jsonb NOT NULL CHECK (jsonb_typeof(lines) = 'array' AND jsonb_array_length(lines) BETWEEN 1 AND 20),
  provider text CHECK (provider IS NULL OR provider ~ '^[a-z][a-z0-9_]{1,39}$'),
  provider_reference text CHECK (provider_reference IS NULL OR length(provider_reference) BETWEEN 1 AND 200),
  provider_customer_reference text CHECK (provider_customer_reference IS NULL OR length(provider_customer_reference) BETWEEN 1 AND 200),
  verifactu_status text CHECK (verifactu_status IS NULL OR verifactu_status IN ('not_applicable','pending','accepted','accepted_with_errors','rejected')),
  pdf_object_key text CHECK (pdf_object_key IS NULL OR pdf_object_key ~ '^evals/[0-9a-f-]{36}/[0-9a-f-]{36}/sealed/[0-9a-f-]{36}$'),
  pdf_sha256 text CHECK (pdf_sha256 IS NULL OR pdf_sha256 ~ '^[0-9a-f]{64}$'),
  pdf_byte_size integer CHECK (pdf_byte_size IS NULL OR pdf_byte_size BETWEEN 1 AND 10485760),
  pdf_attached_at timestamptz,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_attempt_at timestamptz,
  last_error_code text CHECK (last_error_code IS NULL OR last_error_code ~ '^[a-z][a-z0-9_]{1,63}$'),
  handed_over_at timestamptz,
  issued_at timestamptz,
  issued_by text CHECK (issued_by IS NULL OR length(issued_by) BETWEEN 1 AND 255),
  voided_at timestamptz,
  void_reason text CHECK (void_reason IS NULL OR length(void_reason) BETWEEN 3 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, id),
  UNIQUE (series_code, number),
  FOREIGN KEY (org_id, order_id) REFERENCES billing.top_up_order(org_id, id),
  FOREIGN KEY (org_id, invoice_id) REFERENCES billing.invoice(org_id, id),
  CHECK (gross_cents = net_cents + vat_cents),
  CHECK (vat_cents = -((-net_cents * vat_rate_bp + 5000) / 10000)),
  CHECK ((tax_treatment = 'es_vat') = (vat_rate_bp = 2100)),
  CHECK (tax_mention IS NOT DISTINCT FROM billing.tax_mention(tax_treatment)),
  CHECK ((number IS NULL) = (issue_date IS NULL) AND (number IS NULL) = (issued_at IS NULL)),
  CHECK (status <> 'issued' OR number IS NOT NULL),
  CHECK (number IS NULL OR status IN ('issued','voided')),
  CHECK (number IS NULL OR livemode OR number ~ '^TEST-'),
  CHECK (issue_date IS NULL OR issue_date >= operation_date),
  CHECK (status <> 'pending_issue' OR handed_over_at IS NOT NULL),
  CHECK ((pdf_object_key IS NULL) = (pdf_sha256 IS NULL) AND (pdf_sha256 IS NULL) = (pdf_byte_size IS NULL)
     AND (pdf_byte_size IS NULL) = (pdf_attached_at IS NULL)),
  CHECK ((status = 'voided') = (voided_at IS NOT NULL) AND (voided_at IS NULL) = (void_reason IS NULL)),
  CHECK (status <> 'voided' OR NOT livemode)
);
CREATE INDEX credit_note_queued ON billing.credit_note (next_attempt_at) WHERE status = 'queued';
CREATE INDEX credit_note_recent ON billing.credit_note (org_id, created_at DESC, id DESC);
CREATE INDEX credit_note_operation ON billing.credit_note (livemode, operation_date);
CREATE INDEX credit_note_invoice ON billing.credit_note (org_id, invoice_id);

-- The order's invoice (reserved by migration 091).
ALTER TABLE billing.top_up_order ADD CONSTRAINT top_up_order_invoice_fk
  FOREIGN KEY (org_id, invoice_id) REFERENCES billing.invoice(org_id, id);

-- Both kinds for owner reads; RLS of the tables applies (security invoker).
CREATE VIEW billing.invoice_document WITH (security_invoker = true) AS
  SELECT 'invoice'::text AS kind, i.id, i.org_id, i.order_id, NULL::uuid AS invoice_id, i.livemode, i.series_code, NULL::text AS reason,
    i.status, i.number, i.issue_date, i.operation_date, i.locale, i.currency, i.net_cents, i.vat_rate_bp, i.vat_cents, i.gross_cents,
    i.tax_treatment, i.tax_mention, i.customer, i.lines, i.provider, i.provider_reference, i.verifactu_status, i.pdf_object_key,
    i.pdf_sha256, i.pdf_byte_size, i.pdf_attached_at, i.attempts, i.last_error_code, i.handed_over_at, i.issued_at, i.voided_at,
    i.created_at, i.updated_at
  FROM billing.invoice i
  UNION ALL
  SELECT 'credit_note', c.id, c.org_id, c.order_id, c.invoice_id, c.livemode, c.series_code, c.reason,
    c.status, c.number, c.issue_date, c.operation_date, c.locale, c.currency, c.net_cents, c.vat_rate_bp, c.vat_cents, c.gross_cents,
    c.tax_treatment, c.tax_mention, c.customer, c.lines, c.provider, c.provider_reference, c.verifactu_status, c.pdf_object_key,
    c.pdf_sha256, c.pdf_byte_size, c.pdf_attached_at, c.attempts, c.last_error_code, c.handed_over_at, c.issued_at, c.voided_at,
    c.created_at, c.updated_at
  FROM billing.credit_note c;

/* --------------------------------------------------------- read access --- */

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['invoice','credit_note'] LOOP
    EXECUTE format('ALTER TABLE billing.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE billing.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY tenant_read ON billing.%I FOR SELECT USING (org_id = nullif(current_setting(''evals.org_id'', true), '''')::uuid)', t);
  END LOOP;
END $$;
REVOKE ALL ON billing.invoice_series, billing.invoice, billing.credit_note, billing.invoice_document FROM PUBLIC;
GRANT SELECT ON billing.invoice_series, billing.invoice, billing.credit_note, billing.invoice_document TO evals_runtime;

/* ------------------------------------------------- queueing documents --- */

-- Invoice lines of an order: the purchased credits at 1 cent each, and the
-- bonus credits free of charge. p_sign -1 gives the rectifying lines.
CREATE FUNCTION billing._invoice_lines(o billing.top_up_order, p_sign integer) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$
  SELECT jsonb_build_array(jsonb_build_object('item', 'credits', 'credits', p_sign * (o.base_ucr / 1000000),
      'unit_price_cents', 1, 'net_cents', p_sign * o.net_cents))
    || CASE WHEN coalesce(o.bonus_ucr, 0) > 0 THEN jsonb_build_array(jsonb_build_object('item', 'bonus_credits',
      'credits', p_sign * round(o.bonus_ucr::numeric / 1000000, 6), 'unit_price_cents', 0, 'net_cents', 0)) ELSE '[]'::jsonb END
$$;

-- Queues the invoice of a paid order (once) and links it from the order.
CREATE FUNCTION billing._queue_invoice(o billing.top_up_order) RETURNS uuid
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE v_id uuid;
BEGIN
  IF o.purchase_entry_id IS NULL OR o.paid_at IS NULL THEN RETURN NULL; END IF;
  INSERT INTO billing.invoice (org_id, order_id, livemode, series_code, operation_date, locale, net_cents, vat_rate_bp, vat_cents,
    gross_cents, tax_treatment, tax_mention, customer, lines)
  VALUES (o.org_id, o.id, o.livemode, 'CAU', (o.paid_at AT TIME ZONE 'Europe/Madrid')::date,
    CASE WHEN o.tax_snapshot->>'country' = 'ES' THEN 'es' ELSE 'en' END, o.net_cents, o.vat_rate_bp, o.vat_cents, o.gross_cents,
    o.tax_treatment, billing.tax_mention(o.tax_treatment), o.tax_snapshot, billing._invoice_lines(o, 1))
  ON CONFLICT (order_id) DO NOTHING
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN SELECT id INTO v_id FROM billing.invoice WHERE order_id = o.id; END IF;
  UPDATE billing.top_up_order SET invoice_id = v_id WHERE org_id = o.org_id AND id = o.id AND invoice_id IS NULL;
  RETURN v_id;
END $$;

-- Queues the rectifying invoice of a refunded order (once), with the
-- original invoice's fiscal data and negative amounts.
CREATE FUNCTION billing._queue_credit_note(o billing.top_up_order) RETURNS uuid
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE v_invoice uuid; v_id uuid;
BEGIN
  IF o.purchase_entry_id IS NULL OR o.paid_at IS NULL THEN RETURN NULL; END IF;
  v_invoice := billing._queue_invoice(o);
  INSERT INTO billing.credit_note (org_id, order_id, invoice_id, livemode, series_code, reason, operation_date, locale, net_cents,
    vat_rate_bp, vat_cents, gross_cents, tax_treatment, tax_mention, customer, lines)
  SELECT i.org_id, i.order_id, i.id, i.livemode, 'CAU-R', 'refund',
    greatest((coalesce(o.refunded_at, now()) AT TIME ZONE 'Europe/Madrid')::date, i.operation_date),
    i.locale, -i.net_cents, i.vat_rate_bp, -i.vat_cents, -i.gross_cents, i.tax_treatment, i.tax_mention, i.customer,
    billing._invoice_lines(o, -1)
  FROM billing.invoice i WHERE i.org_id = o.org_id AND i.id = v_invoice
  ON CONFLICT (order_id) DO NOTHING
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN SELECT id INTO v_id FROM billing.credit_note WHERE order_id = o.id; END IF;
  RETURN v_id;
END $$;

-- top_up_paid and refunds: queue the documents in the payment's transaction.
CREATE FUNCTION billing._invoicing_on_order() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF NEW.purchase_entry_id IS NOT NULL AND (TG_OP = 'INSERT' OR OLD.purchase_entry_id IS NULL) THEN
    PERFORM billing._queue_invoice(NEW);
  END IF;
  IF NEW.status = 'refunded' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'refunded') THEN
    PERFORM billing._queue_credit_note(NEW);
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER top_up_order_invoicing AFTER INSERT OR UPDATE OF purchase_entry_id, status ON billing.top_up_order
  FOR EACH ROW EXECUTE FUNCTION billing._invoicing_on_order();

/* -------------------------------------------------- document helpers --- */

CREATE FUNCTION billing._document_table(p_kind text) RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog AS $$
BEGIN
  IF p_kind = 'invoice' THEN RETURN 'invoice'; END IF;
  IF p_kind = 'credit_note' THEN RETURN 'credit_note'; END IF;
  RAISE EXCEPTION 'INPUT_INVALID';
END $$;

-- The document as JSON (with its kind and, for a rectifying invoice, the
-- original's number and state), locked for update when asked.
CREATE FUNCTION billing._document(p_org_id uuid, p_kind text, p_id uuid, p_lock boolean) RETURNS jsonb
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE d jsonb; t text := billing._document_table(p_kind);
BEGIN
  EXECUTE format('SELECT to_jsonb(d) FROM billing.%I d WHERE d.org_id = $1 AND d.id = $2 %s', t,
    CASE WHEN p_lock THEN 'FOR UPDATE' ELSE '' END) INTO d USING p_org_id, p_id;
  IF d IS NULL THEN RAISE EXCEPTION 'INVOICE_NOT_FOUND'; END IF;
  d := d || jsonb_build_object('kind', p_kind);
  IF p_kind = 'credit_note' THEN
    d := d || jsonb_build_object('original', (SELECT jsonb_build_object('id', i.id, 'status', i.status, 'series_code', i.series_code,
      'number', i.number, 'issue_date', i.issue_date, 'operation_date', i.operation_date, 'provider', i.provider,
      'provider_reference', i.provider_reference)
      FROM billing.invoice i WHERE i.org_id = p_org_id AND i.id = (d->>'invoice_id')::uuid));
  END IF;
  RETURN d;
END $$;

/* ------------------------------------------------ the invoicing job --- */

-- Queued documents due for an attempt, invoices first (a rectifying invoice
-- follows its original). Services and platform admins, across workspaces.
CREATE FUNCTION billing.invoicing_due(p_limit integer DEFAULT 50)
RETURNS TABLE (org_id uuid, kind text, document_id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
#variable_conflict use_column
BEGIN
  PERFORM billing._privileged();
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'INPUT_INVALID'; END IF;
  RETURN QUERY SELECT d.org_id, d.kind, d.id FROM (
    SELECT i.org_id, 'invoice'::text AS kind, i.id, i.created_at, 0 AS rank FROM billing.invoice i
      WHERE i.status = 'queued' AND i.next_attempt_at <= now()
    UNION ALL
    SELECT c.org_id, 'credit_note'::text, c.id, c.created_at, 1 FROM billing.credit_note c
      WHERE c.status = 'queued' AND c.next_attempt_at <= now()
  ) d ORDER BY d.rank, d.created_at, d.id LIMIT p_limit;
END $$;

-- Claims one attempt on a queued document: counts it and leases it for 10
-- minutes (a crash mid-call retries after the lease). Returns the document,
-- or NULL when it is not due, taken, or (a rectifying invoice) its original
-- has not been handed over yet.
CREATE FUNCTION billing.claim_invoicing(p_org_id uuid, p_kind text, p_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE t text := billing._document_table(p_kind); d jsonb;
BEGIN
  PERFORM billing._tenant(p_org_id);
  PERFORM billing._privileged();
  EXECUTE format('SELECT to_jsonb(d) FROM billing.%I d WHERE d.org_id = $1 AND d.id = $2 FOR UPDATE SKIP LOCKED', t)
    INTO d USING p_org_id, p_id;
  IF d IS NULL OR d->>'status' <> 'queued' OR (d->>'next_attempt_at')::timestamptz > now() THEN RETURN NULL; END IF;
  IF p_kind = 'credit_note' AND EXISTS (SELECT 1 FROM billing.invoice i WHERE i.org_id = p_org_id
      AND i.id = (d->>'invoice_id')::uuid AND i.status = 'queued') THEN
    UPDATE billing.credit_note SET next_attempt_at = now() + interval '1 minute', updated_at = now() WHERE org_id = p_org_id AND id = p_id;
    RETURN NULL;
  END IF;
  EXECUTE format('UPDATE billing.%I SET attempts = attempts + 1, last_attempt_at = now(), next_attempt_at = now() + interval ''10 minutes'',
    updated_at = now() WHERE org_id = $1 AND id = $2', t) USING p_org_id, p_id;
  RETURN billing._document(p_org_id, p_kind, p_id, false);
END $$;

-- The provider accepted the document but has not issued it (the manual
-- adapter: the accountant issues it). Idempotent.
CREATE FUNCTION billing.record_invoicing_handover(p_org_id uuid, p_kind text, p_id uuid, p_provider text,
  p_provider_reference text DEFAULT NULL, p_customer_reference text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE t text := billing._document_table(p_kind); d jsonb;
BEGIN
  PERFORM billing._tenant(p_org_id);
  PERFORM billing._privileged();
  IF p_provider IS NULL OR p_provider !~ '^[a-z][a-z0-9_]{1,39}$' THEN RAISE EXCEPTION 'INPUT_INVALID'; END IF;
  d := billing._document(p_org_id, p_kind, p_id, true);
  IF d->>'status' IN ('queued','pending_issue') THEN
    EXECUTE format('UPDATE billing.%I SET status = ''pending_issue'', provider = $3, provider_reference = coalesce(provider_reference, $4),
      provider_customer_reference = coalesce($5, provider_customer_reference), handed_over_at = coalesce(handed_over_at, now()),
      last_error_code = NULL, updated_at = now() WHERE org_id = $1 AND id = $2', t)
      USING p_org_id, p_id, p_provider, nullif(btrim(p_provider_reference), ''), nullif(btrim(p_customer_reference), '');
  END IF;
  RETURN billing._document(p_org_id, p_kind, p_id, false);
END $$;

-- A provider attempt failed: the document stays queued and is retried after
-- 1, 2, 4 … 60 minutes. The health check alerts once it has waited an hour.
CREATE FUNCTION billing.record_invoicing_failure(p_org_id uuid, p_kind text, p_id uuid, p_provider text, p_code text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE t text := billing._document_table(p_kind); code text := lower(coalesce(nullif(btrim(p_code), ''), 'provider_error'));
BEGIN
  PERFORM billing._tenant(p_org_id);
  PERFORM billing._privileged();
  IF code !~ '^[a-z][a-z0-9_]{1,63}$' THEN code := 'provider_error'; END IF;
  PERFORM billing._document(p_org_id, p_kind, p_id, true);
  EXECUTE format('UPDATE billing.%I SET last_error_code = $3,
    provider = coalesce(provider, CASE WHEN $4 ~ ''^[a-z][a-z0-9_]{1,39}$'' THEN $4 END),
    next_attempt_at = now() + make_interval(mins => least(60, power(2, least(greatest(attempts, 1) - 1, 6))::integer)),
    updated_at = now() WHERE org_id = $1 AND id = $2 AND status = ''queued''', t) USING p_org_id, p_id, code, p_provider;
  RETURN billing._document(p_org_id, p_kind, p_id, false);
END $$;

/* -------------------------------------------- issuing and correcting --- */

-- Records a document as issued: its number in the series (live) or a TEST-
-- number (test mode), the issue date, and optionally the provider reference,
-- the Verifactu status and the PDF (sealed in private storage by the caller).
-- Called by the invoicing job when a provider issues, and by platform admins
-- attaching what the accountant issued (reason required, audited). Replaying
-- the same number and date returns the document (and attaches a PDF it lacks).
-- Raises INVOICE_NUMBER_INVALID, INVOICE_NUMBER_TAKEN, INVOICE_ALREADY_ISSUED,
-- INVOICE_VOIDED, ISSUE_DATE_INVALID, ORIGINAL_NOT_ISSUED.
CREATE FUNCTION billing.issue_invoice_document(p_org_id uuid, p_kind text, p_id uuid, p_number text, p_issue_date date,
  p_provider text DEFAULT NULL, p_provider_reference text DEFAULT NULL, p_verifactu_status text DEFAULT NULL,
  p_pdf_object_key text DEFAULT NULL, p_pdf_sha256 text DEFAULT NULL, p_pdf_byte_size integer DEFAULT NULL,
  p_reason text DEFAULT NULL, p_request_id text DEFAULT NULL, p_customer_reference text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE t text := billing._document_table(p_kind); d jsonb; s billing.invoice_series; actor text; v_reason text; num text := btrim(p_number);
  has_pdf boolean := p_pdf_object_key IS NOT NULL; today date := (now() AT TIME ZONE 'Europe/Madrid')::date;
BEGIN
  PERFORM billing._tenant(p_org_id);
  PERFORM billing._privileged();
  actor := billing._actor();
  v_reason := billing._reason(p_reason, billing.actor_kind(actor) = 'user');
  IF has_pdf AND (p_pdf_sha256 IS NULL OR p_pdf_byte_size IS NULL) THEN RAISE EXCEPTION 'INPUT_INVALID'; END IF;
  IF p_verifactu_status IS NOT NULL AND p_verifactu_status NOT IN ('not_applicable','pending','accepted','accepted_with_errors','rejected') THEN
    RAISE EXCEPTION 'INPUT_INVALID';
  END IF;
  IF p_provider IS NOT NULL AND p_provider !~ '^[a-z][a-z0-9_]{1,39}$' THEN RAISE EXCEPTION 'INPUT_INVALID'; END IF;
  d := billing._document(p_org_id, p_kind, p_id, true);
  IF d->>'status' = 'voided' THEN RAISE EXCEPTION 'INVOICE_VOIDED'; END IF;
  IF d->>'status' = 'issued' THEN
    IF d->>'number' IS DISTINCT FROM num OR (d->>'issue_date')::date IS DISTINCT FROM p_issue_date THEN
      RAISE EXCEPTION 'INVOICE_ALREADY_ISSUED';
    END IF;
    IF has_pdf AND d->>'pdf_sha256' IS NOT NULL AND d->>'pdf_sha256' <> p_pdf_sha256 THEN RAISE EXCEPTION 'INVOICE_ALREADY_ISSUED'; END IF;
    IF has_pdf AND d->>'pdf_sha256' IS NULL THEN
      EXECUTE format('UPDATE billing.%I SET pdf_object_key = $3, pdf_sha256 = $4, pdf_byte_size = $5, pdf_attached_at = now(),
        updated_at = now() WHERE org_id = $1 AND id = $2', t) USING p_org_id, p_id, p_pdf_object_key, p_pdf_sha256, p_pdf_byte_size;
      PERFORM billing._audit_event(p_org_id, 'billing.invoice_pdf_attached', p_id::text, jsonb_build_object('kind', p_kind,
        'number', num, 'pdf_sha256', p_pdf_sha256, 'reason', v_reason, 'request_id', p_request_id));
    END IF;
    RETURN billing._document(p_org_id, p_kind, p_id, false);
  END IF;
  SELECT * INTO s FROM billing.invoice_series WHERE code = d->>'series_code';
  IF num IS NULL OR length(num) NOT BETWEEN 3 AND 60
     OR ((d->>'livemode')::boolean AND num !~ s.number_pattern)
     OR (NOT (d->>'livemode')::boolean AND num !~ '^TEST-[A-Za-z0-9/._-]{1,40}$') THEN
    RAISE EXCEPTION 'INVOICE_NUMBER_INVALID';
  END IF;
  IF p_issue_date IS NULL OR p_issue_date < (d->>'operation_date')::date OR p_issue_date > today THEN
    RAISE EXCEPTION 'ISSUE_DATE_INVALID';
  END IF;
  IF p_kind = 'credit_note' THEN
    IF d->'original'->>'status' IS DISTINCT FROM 'issued' THEN RAISE EXCEPTION 'ORIGINAL_NOT_ISSUED'; END IF;
    IF p_issue_date < (d->'original'->>'issue_date')::date THEN RAISE EXCEPTION 'ISSUE_DATE_INVALID'; END IF;
  END IF;
  BEGIN
    EXECUTE format('UPDATE billing.%I SET status = ''issued'', number = $3, issue_date = $4, issued_at = now(), issued_by = $5,
      provider = coalesce(provider, $6), provider_reference = coalesce($7, provider_reference),
      provider_customer_reference = coalesce($12, provider_customer_reference),
      verifactu_status = coalesce($8, verifactu_status), handed_over_at = coalesce(handed_over_at, now()), last_error_code = NULL,
      pdf_object_key = $9, pdf_sha256 = $10, pdf_byte_size = $11, pdf_attached_at = CASE WHEN $9 IS NULL THEN NULL ELSE now() END,
      updated_at = now() WHERE org_id = $1 AND id = $2', t)
      USING p_org_id, p_id, num, p_issue_date, actor, p_provider, nullif(btrim(p_provider_reference), ''), p_verifactu_status,
        p_pdf_object_key, p_pdf_sha256, p_pdf_byte_size, nullif(btrim(p_customer_reference), '');
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'INVOICE_NUMBER_TAKEN';
  END;
  PERFORM billing._audit_event(p_org_id, 'billing.invoice_issued', p_id::text, jsonb_build_object('kind', p_kind,
    'order_id', d->>'order_id', 'series', d->>'series_code', 'number', num, 'issue_date', p_issue_date,
    'before', jsonb_build_object('status', d->>'status', 'provider', d->>'provider'),
    'provider', coalesce(d->>'provider', p_provider), 'verifactu_status', p_verifactu_status, 'pdf_sha256', p_pdf_sha256,
    'reason', v_reason, 'request_id', p_request_id));
  RETURN billing._document(p_org_id, p_kind, p_id, false);
END $$;

-- Voids a test-mode document (Stripe test mode; clean-up after a check).
-- Voiding an invoice voids its rectifying invoice too. Live documents are
-- never voided: Spanish invoices are corrected by rectifying invoices.
CREATE FUNCTION billing.void_invoice_document(p_org_id uuid, p_kind text, p_id uuid, p_reason text, p_request_id text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE t text := billing._document_table(p_kind); d jsonb; v_reason text;
BEGIN
  PERFORM billing._tenant(p_org_id);
  PERFORM billing._privileged();
  v_reason := billing._reason(p_reason, true);
  d := billing._document(p_org_id, p_kind, p_id, true);
  IF (d->>'livemode')::boolean THEN RAISE EXCEPTION 'INVOICE_VOID_LIVE'; END IF;
  IF d->>'status' = 'voided' THEN RETURN d; END IF;
  EXECUTE format('UPDATE billing.%I SET status = ''voided'', voided_at = now(), void_reason = $3, updated_at = now()
    WHERE org_id = $1 AND id = $2', t) USING p_org_id, p_id, v_reason;
  IF p_kind = 'invoice' THEN
    UPDATE billing.credit_note SET status = 'voided', voided_at = now(), void_reason = v_reason, updated_at = now()
    WHERE org_id = p_org_id AND invoice_id = p_id AND status <> 'voided';
  END IF;
  PERFORM billing._audit_event(p_org_id, 'billing.invoice_voided', p_id::text, jsonb_build_object('kind', p_kind,
    'order_id', d->>'order_id', 'before', d->>'status', 'number', d->>'number', 'reason', v_reason, 'request_id', p_request_id));
  RETURN billing._document(p_org_id, p_kind, p_id, false);
END $$;

/* ------------------------------------------------------ ops and export --- */

-- Documents across workspaces for ops (pending issue, queued with errors…),
-- newest first. Platform admins and services.
CREATE FUNCTION billing.invoice_documents_admin(p_status text DEFAULT NULL, p_livemode boolean DEFAULT NULL, p_limit integer DEFAULT 100)
RETURNS SETOF jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  PERFORM billing._privileged();
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 1000
     OR (p_status IS NOT NULL AND p_status NOT IN ('queued','pending_issue','issued','voided')) THEN
    RAISE EXCEPTION 'INPUT_INVALID';
  END IF;
  RETURN QUERY SELECT to_jsonb(d) - 'customer' - 'lines' - 'pdf_object_key'
    || jsonb_build_object('legal_name', d.customer->>'legal_name', 'tax_id', d.customer->>'tax_id', 'country', d.customer->>'country',
      'workspace', w.name, 'pdf_attached', d.pdf_object_key IS NOT NULL)
  FROM billing.invoice_document d JOIN evals.workspace w ON w.id = d.org_id
  WHERE (p_status IS NULL OR d.status = p_status) AND (p_livemode IS NULL OR d.livemode = p_livemode)
  ORDER BY d.created_at DESC, d.id DESC LIMIT p_limit;
END $$;

-- The monthly accountant export (§6.13, §6.14) for one calendar month in
-- Madrid time and one Stripe mode: credits sold (net and VAT by treatment),
-- refunds and chargebacks; the purchased-credit roll-forward (opening
-- deferred balance, purchased, consumed, returned, refunded, expired,
-- charged back, adjusted, closing balance) in credits and euros at the price
-- paid; free credits; the orders and the documents to issue; and checks.
-- Read-only; platform admins and services.
CREATE FUNCTION billing.accountant_export(p_month date, p_livemode boolean) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_month date; v_from timestamptz; v_to timestamptz; r jsonb; v_closing numeric; v_lots numeric;
BEGIN
  PERFORM billing._privileged();
  IF p_month IS NULL OR p_livemode IS NULL THEN RAISE EXCEPTION 'INPUT_INVALID'; END IF;
  v_month := date_trunc('month', p_month::timestamp)::date;
  v_from := v_month::timestamp AT TIME ZONE 'Europe/Madrid';
  v_to := (v_month + interval '1 month')::timestamp AT TIME ZONE 'Europe/Madrid';
  r := jsonb_build_object('month', to_char(v_month, 'YYYY-MM'), 'livemode', p_livemode, 'time_zone', 'Europe/Madrid',
    'from', v_from, 'to', v_to, 'generated_at', now(), 'complete', v_to <= now());

  r := r || jsonb_build_object('sales', (SELECT coalesce(jsonb_agg(jsonb_build_object('tax_treatment', s.t, 'tax_mention', billing.tax_mention(s.t),
      'orders', s.n, 'net_cents', s.net, 'vat_cents', s.vat, 'gross_cents', s.gross, 'credits', s.credits, 'bonus_credits', s.bonus) ORDER BY s.t), '[]'::jsonb)
    FROM (SELECT tax_treatment AS t, count(*) AS n, sum(net_cents) AS net, sum(vat_cents) AS vat, sum(gross_cents) AS gross,
        sum(base_ucr) / 1000000 AS credits, round(sum(coalesce(bonus_ucr, 0))::numeric / 1000000, 6) AS bonus
      FROM billing.top_up_order WHERE livemode = p_livemode AND purchase_entry_id IS NOT NULL AND paid_at >= v_from AND paid_at < v_to
      GROUP BY 1) s));

  r := r || jsonb_build_object('refunds', (SELECT coalesce(jsonb_agg(jsonb_build_object('tax_treatment', s.t, 'orders', s.n,
      'net_cents', -s.net, 'vat_cents', -s.vat, 'gross_cents', -s.gross) ORDER BY s.t), '[]'::jsonb)
    FROM (SELECT tax_treatment AS t, count(*) AS n, sum(net_cents) AS net, sum(vat_cents) AS vat, sum(gross_cents) AS gross
      FROM billing.top_up_order WHERE livemode = p_livemode AND status = 'refunded' AND refunded_at >= v_from AND refunded_at < v_to
      GROUP BY 1) s));

  r := r || jsonb_build_object('chargebacks', (SELECT coalesce(jsonb_agg(jsonb_build_object('order_id', o.id, 'org_id', o.org_id,
      'tax_treatment', o.tax_treatment, 'net_cents', o.net_cents, 'vat_cents', o.vat_cents, 'gross_cents', o.gross_cents,
      'at', e.created_at, 'credits_removed', round(-e.amount_ucr::numeric / 1000000, 6)) ORDER BY e.created_at), '[]'::jsonb)
    FROM billing.ledger_entry e JOIN billing.top_up_order o ON o.org_id = e.org_id AND o.id::text = e.ref_id
    WHERE e.entry_type = 'chargeback' AND e.ref_kind = 'top_up_order' AND o.livemode = p_livemode
      AND e.created_at >= v_from AND e.created_at < v_to));

  -- Purchased credits (priced lots of this mode's orders): every ledger
  -- allocation on them until the end of the month, by bucket.
  WITH lots AS (
    SELECT l.id, l.unit_price_eur FROM billing.credit_lot l
    JOIN billing.top_up_order o ON o.org_id = l.org_id AND o.id = l.order_id
    WHERE l.source = 'purchase' AND o.livemode = p_livemode
  ), moves AS (
    SELECT CASE WHEN e.created_at < v_from THEN 'opening'
        WHEN e.entry_type = 'purchase' THEN 'purchased'
        WHEN e.entry_type IN ('capture','action') THEN 'consumed'
        WHEN e.entry_type = 'refund' AND e.amount_ucr > 0 THEN 'returned'
        WHEN e.entry_type = 'refund' THEN 'refunded'
        WHEN e.entry_type = 'expiry' THEN 'expired'
        WHEN e.entry_type = 'chargeback' THEN 'charged_back'
        ELSE 'adjusted' END AS bucket,
      CASE WHEN e.entry_type = 'capture' THEN -(x.value->>'ucr')::bigint
        WHEN e.amount_ucr > 0 THEN (x.value->>'ucr')::bigint ELSE -(x.value->>'ucr')::bigint END AS delta,
      l.unit_price_eur AS price
    FROM billing.ledger_entry e
    CROSS JOIN LATERAL jsonb_array_elements(e.lot_allocations) x
    JOIN lots l ON l.id = (x.value->>'lot')::uuid
    WHERE e.created_at < v_to AND e.entry_type NOT IN ('hold','release')
  ), buckets AS (
    SELECT bucket, sum(delta) AS ucr, sum(delta::numeric * price / 1000000) AS eur FROM moves GROUP BY bucket
  )
  SELECT r || jsonb_build_object('purchased_credits', coalesce((SELECT jsonb_object_agg(b.bucket, jsonb_build_object(
      'credits', round(b.ucr::numeric / 1000000, 6), 'eur', round(b.eur, 4))) FROM buckets b), '{}'::jsonb)
      || jsonb_build_object('closing', jsonb_build_object('credits', round(coalesce((SELECT sum(ucr) FROM buckets), 0)::numeric / 1000000, 6),
        'eur', round(coalesce((SELECT sum(eur) FROM buckets), 0), 4)))),
    coalesce((SELECT sum(ucr) FROM buckets), 0)
  INTO r, v_closing;

  -- Free credits (bonus, grants, promos, allowances; no price, no VAT): movements in the month.
  WITH lots AS (
    SELECT l.id, l.source FROM billing.credit_lot l
    LEFT JOIN billing.top_up_order o ON o.org_id = l.org_id AND o.id = l.order_id
    WHERE l.source <> 'purchase' AND (l.order_id IS NULL OR o.livemode = p_livemode)
  ), moves AS (
    SELECT l.source, CASE WHEN e.entry_type IN ('purchase','bonus','grant','allowance') THEN 'granted'
        WHEN e.entry_type IN ('capture','action') THEN 'consumed'
        WHEN e.entry_type = 'refund' AND e.amount_ucr > 0 THEN 'returned'
        WHEN e.entry_type = 'expiry' THEN 'expired'
        ELSE 'other' END AS bucket,
      CASE WHEN e.entry_type = 'capture' THEN -(x.value->>'ucr')::bigint
        WHEN e.amount_ucr > 0 THEN (x.value->>'ucr')::bigint ELSE -(x.value->>'ucr')::bigint END AS delta
    FROM billing.ledger_entry e
    CROSS JOIN LATERAL jsonb_array_elements(e.lot_allocations) x
    JOIN lots l ON l.id = (x.value->>'lot')::uuid
    WHERE e.created_at >= v_from AND e.created_at < v_to AND e.entry_type NOT IN ('hold','release')
  )
  SELECT r || jsonb_build_object('free_credits', coalesce(jsonb_object_agg(s.source, s.buckets), '{}'::jsonb)) INTO r
  FROM (SELECT source, jsonb_object_agg(bucket, round(ucr::numeric / 1000000, 6)) AS buckets
    FROM (SELECT source, bucket, sum(delta) AS ucr FROM moves GROUP BY 1, 2) m GROUP BY source) s;

  r := r || jsonb_build_object('orders', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'org_id', o.org_id, 'kind', o.kind,
      'status', o.status, 'paid_at', o.paid_at, 'refunded_at', o.refunded_at, 'net_cents', o.net_cents, 'vat_cents', o.vat_cents,
      'gross_cents', o.gross_cents, 'tax_treatment', o.tax_treatment, 'credits', o.base_ucr / 1000000,
      'bonus_credits', round(coalesce(o.bonus_ucr, 0)::numeric / 1000000, 6), 'legal_name', o.tax_snapshot->>'legal_name',
      'tax_id', o.tax_snapshot->>'tax_id', 'country', o.tax_snapshot->>'country', 'payment_intent', o.stripe_payment_intent_id,
      'charge', o.stripe_charge_id, 'refund', o.stripe_refund_id, 'risk_flags', to_jsonb(o.risk_flags),
      'invoice', CASE WHEN i.id IS NULL THEN NULL ELSE jsonb_build_object('id', i.id, 'status', i.status, 'number', i.number) END,
      'credit_note', CASE WHEN c.id IS NULL THEN NULL ELSE jsonb_build_object('id', c.id, 'status', c.status, 'number', c.number) END)
      ORDER BY coalesce(o.paid_at, o.refunded_at), o.id), '[]'::jsonb)
    FROM billing.top_up_order o
    LEFT JOIN billing.invoice i ON i.order_id = o.id
    LEFT JOIN billing.credit_note c ON c.order_id = o.id
    WHERE o.livemode = p_livemode AND o.purchase_entry_id IS NOT NULL
      AND ((o.paid_at >= v_from AND o.paid_at < v_to) OR (o.refunded_at >= v_from AND o.refunded_at < v_to))));

  -- Documents of the month, plus every one still to issue from earlier months.
  r := r || jsonb_build_object('documents', (SELECT coalesce(jsonb_agg(jsonb_build_object('kind', d.kind, 'id', d.id, 'org_id', d.org_id,
      'order_id', d.order_id, 'series_code', d.series_code, 'number_pattern', s.number_pattern, 'status', d.status, 'number', d.number,
      'issue_date', d.issue_date, 'operation_date', d.operation_date, 'locale', d.locale, 'customer', d.customer, 'lines', d.lines,
      'net_cents', d.net_cents, 'vat_rate_bp', d.vat_rate_bp, 'vat_cents', d.vat_cents, 'gross_cents', d.gross_cents,
      'tax_treatment', d.tax_treatment, 'tax_mention', d.tax_mention, 'reason', d.reason, 'provider', d.provider,
      'pdf_attached', d.pdf_object_key IS NOT NULL,
      'rectifies', CASE WHEN d.kind = 'credit_note' THEN (SELECT jsonb_build_object('id', i.id, 'series_code', i.series_code,
        'number', i.number, 'issue_date', i.issue_date, 'status', i.status) FROM billing.invoice i WHERE i.id = d.invoice_id) END)
      ORDER BY d.operation_date, d.kind DESC, d.created_at, d.id), '[]'::jsonb)
    FROM billing.invoice_document d JOIN billing.invoice_series s ON s.code = d.series_code
    WHERE d.livemode = p_livemode AND d.status <> 'voided'
      AND ((d.operation_date >= v_month AND d.operation_date < (v_month + interval '1 month')::date)
        OR (d.status IN ('queued','pending_issue') AND d.operation_date < (v_month + interval '1 month')::date))));

  SELECT coalesce(sum(l.remaining_ucr), 0) INTO v_lots FROM billing.credit_lot l
    JOIN billing.top_up_order o ON o.org_id = l.org_id AND o.id = l.order_id
    WHERE l.source = 'purchase' AND o.livemode = p_livemode;
  r := r || jsonb_build_object('checks', jsonb_build_object(
    'paid_orders_without_invoice', (SELECT count(*) FROM billing.top_up_order o WHERE o.livemode = p_livemode
      AND o.purchase_entry_id IS NOT NULL AND o.paid_at < v_to AND NOT EXISTS (SELECT 1 FROM billing.invoice i WHERE i.order_id = o.id)),
    'refunded_orders_without_credit_note', (SELECT count(*) FROM billing.top_up_order o WHERE o.livemode = p_livemode
      AND o.status = 'refunded' AND o.refunded_at < v_to AND NOT EXISTS (SELECT 1 FROM billing.credit_note c WHERE c.order_id = o.id)),
    'documents_to_issue', (SELECT count(*) FROM billing.invoice_document d WHERE d.livemode = p_livemode
      AND d.status IN ('queued','pending_issue') AND d.operation_date < (v_month + interval '1 month')::date),
    'documents_queued_with_errors', (SELECT count(*) FROM billing.invoice_document d WHERE d.livemode = p_livemode
      AND d.status = 'queued' AND d.last_error_code IS NOT NULL),
    -- For the current month, the closing balance must equal what the purchased lots hold now.
    'deferred_balance_mismatch', CASE WHEN v_to > now() AND v_closing <> v_lots THEN 1 ELSE 0 END));
  RETURN r;
END $$;

/* --------------------------------------------------------- backfill --- */

-- Orders paid (and refunded) before this migration get their documents.
DO $$ DECLARE o billing.top_up_order; BEGIN
  FOR o IN SELECT * FROM billing.top_up_order WHERE purchase_entry_id IS NOT NULL ORDER BY paid_at, id LOOP
    PERFORM billing._queue_invoice(o);
    IF o.status = 'refunded' THEN PERFORM billing._queue_credit_note(o); END IF;
  END LOOP;
END $$;

/* ---------------------------------------------------------- execution --- */

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA billing FROM PUBLIC;
-- The web runtime and the scheduler (a member of evals_runtime). Inside, every
-- function accepts platform admins and service identities only.
GRANT EXECUTE ON FUNCTION
  billing.tax_mention(text),
  billing.invoicing_due(integer),
  billing.claim_invoicing(uuid, text, uuid),
  billing.record_invoicing_handover(uuid, text, uuid, text, text, text),
  billing.record_invoicing_failure(uuid, text, uuid, text, text),
  billing.issue_invoice_document(uuid, text, uuid, text, date, text, text, text, text, text, integer, text, text, text),
  billing.void_invoice_document(uuid, text, uuid, text, text),
  billing.invoice_documents_admin(text, boolean, integer),
  billing.accountant_export(date, boolean)
TO evals_runtime;
COMMIT;
