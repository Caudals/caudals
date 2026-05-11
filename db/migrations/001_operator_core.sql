-- Caudals Phase 1 operator-core schema for self-hosted PostgreSQL.
-- This is the canonical Postgres baseline that replaces Supabase OLTP tables.

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS vector;

CREATE SCHEMA IF NOT EXISTS app_private;

CREATE OR REPLACE FUNCTION app_private.current_operator_id()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.current_operator_id', true), '')
$$;

CREATE OR REPLACE FUNCTION app_private.current_org_id()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.current_org_id', true), '')
$$;

CREATE OR REPLACE FUNCTION app_private.is_service_role()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(NULLIF(current_setting('app.is_service_role', true), '')::boolean, false)
$$;

CREATE OR REPLACE FUNCTION app_private.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION app_private.assert_ulid_prefixed(value text, prefix text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT value ~ ('^' || prefix || '_[0-9A-HJKMNP-TV-Z]{10,}$')
$$;

CREATE TABLE IF NOT EXISTS organization (
  id text PRIMARY KEY CHECK (app_private.assert_ulid_prefixed(id, 'or')),
  kind text NOT NULL CHECK (kind IN ('supplier', 'buyer', 'partner', 'internal')),
  legal_name text NOT NULL,
  display_name text NOT NULL,
  website text,
  jurisdiction text,
  state text NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'paused', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text,
  org_id text,
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS "operator" (
  id text PRIMARY KEY CHECK (app_private.assert_ulid_prefixed(id, 'op')),
  email citext UNIQUE NOT NULL,
  name text NOT NULL,
  role text NOT NULL CHECK (role IN ('admin', 'operations', 'data_engineer', 'privacy', 'qa', 'commercial')),
  skill_profile jsonb NOT NULL DEFAULT '{}'::jsonb,
  mfa_required boolean NOT NULL DEFAULT true,
  webauthn_required boolean NOT NULL DEFAULT false,
  state text NOT NULL DEFAULT 'active' CHECK (state IN ('invited', 'active', 'suspended')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text,
  org_id text REFERENCES organization(id),
  deleted_at timestamptz
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'organization_created_by_fkey'
  ) THEN
    ALTER TABLE organization
      ADD CONSTRAINT organization_created_by_fkey
      FOREIGN KEY (created_by) REFERENCES "operator"(id) DEFERRABLE INITIALLY DEFERRED;
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS contact (
  id text PRIMARY KEY CHECK (app_private.assert_ulid_prefixed(id, 'co')),
  org_id text NOT NULL REFERENCES organization(id),
  full_name text NOT NULL,
  email citext,
  role text,
  signing_authority boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text REFERENCES "operator"(id),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS buyer_opportunity (
  id text PRIMARY KEY CHECK (app_private.assert_ulid_prefixed(id, 'bo')),
  org_id text NOT NULL REFERENCES organization(id),
  contact_id text REFERENCES contact(id),
  title text NOT NULL,
  use_case text NOT NULL,
  modality text,
  budget_range jsonb NOT NULL DEFAULT '{}'::jsonb,
  timeline text,
  state text NOT NULL DEFAULT 'new' CHECK (state IN (
    'new','qualifying','scoping','feasibility','pilot_quoted','pilot_active',
    'pilot_delivered','full_quoted','full_active','delivered',
    'on_subscription','closed_won','closed_lost'
  )),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text REFERENCES "operator"(id),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS supplier_opportunity (
  id text PRIMARY KEY CHECK (app_private.assert_ulid_prefixed(id, 'so')),
  org_id text NOT NULL REFERENCES organization(id),
  contact_id text REFERENCES contact(id),
  title text NOT NULL,
  asset_summary text NOT NULL,
  state text NOT NULL DEFAULT 'new' CHECK (state IN (
    'new','qualifying','nda_signed','sample_received','feasibility_done',
    'pilot_active','pilot_done','full_active','live','paused','terminated'
  )),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text REFERENCES "operator"(id),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS contract (
  id text PRIMARY KEY CHECK (app_private.assert_ulid_prefixed(id, 'ct')),
  org_id text NOT NULL REFERENCES organization(id),
  counterparty_org_id text REFERENCES organization(id),
  contract_type text NOT NULL CHECK (contract_type IN ('supplier', 'buyer', 'nda', 'dpa', 'msa')),
  document_uri text,
  state text NOT NULL DEFAULT 'drafting' CHECK (state IN (
    'drafting','awaiting_buyer','awaiting_supplier','signed','active','renewed','terminated'
  )),
  signed_at timestamptz,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text REFERENCES "operator"(id),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS supplier_asset (
  id text PRIMARY KEY CHECK (app_private.assert_ulid_prefixed(id, 'sa')),
  org_id text NOT NULL REFERENCES organization(id),
  contract_id text REFERENCES contract(id),
  name text NOT NULL,
  modality text NOT NULL CHECK (modality IN ('tabular','text','image','video','audio','geospatial','timeseries','document')),
  declared_volume jsonb NOT NULL DEFAULT '{}'::jsonb,
  refresh_policy text NOT NULL CHECK (refresh_policy IN ('one_shot','scheduled','on_event','perpetual')),
  sensitivity text NOT NULL CHECK (sensitivity IN ('public','confidential','pii','special')),
  rights_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  state text NOT NULL DEFAULT 'declared' CHECK (state IN ('declared','sample_received','rights_review','approved','blocked','retired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text REFERENCES "operator"(id),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS dataset_brief (
  id text PRIMARY KEY CHECK (app_private.assert_ulid_prefixed(id, 'br')),
  org_id text NOT NULL REFERENCES organization(id),
  buyer_opportunity_id text REFERENCES buyer_opportunity(id),
  title text NOT NULL,
  requirements jsonb NOT NULL DEFAULT '{}'::jsonb,
  sensitivity_constraints jsonb NOT NULL DEFAULT '{}'::jsonb,
  target_formats text[] NOT NULL DEFAULT '{}',
  state text NOT NULL DEFAULT 'new' CHECK (state IN ('new','scoped','quoted','active','delivered','closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text REFERENCES "operator"(id),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS license_clause (
  id text PRIMARY KEY CHECK (app_private.assert_ulid_prefixed(id, 'lc')),
  org_id text NOT NULL REFERENCES organization(id),
  contract_id text NOT NULL REFERENCES contract(id),
  asset_scope jsonb NOT NULL,
  permits_train boolean NOT NULL DEFAULT false,
  permits_finetune boolean NOT NULL DEFAULT false,
  permits_eval boolean NOT NULL DEFAULT false,
  permits_inference_commercial boolean NOT NULL DEFAULT false,
  permits_redistribute boolean NOT NULL DEFAULT false,
  exclusivity text NOT NULL DEFAULT 'none' CHECK (exclusivity IN ('none','exclusive','category')),
  geo text[] NOT NULL DEFAULT '{WW}',
  term_starts_at timestamptz,
  term_ends_at timestamptz,
  share_alike boolean NOT NULL DEFAULT false,
  notes text,
  state text NOT NULL DEFAULT 'active' CHECK (state IN ('draft','active','expired','superseded')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text REFERENCES "operator"(id),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS consent_record (
  id text PRIMARY KEY CHECK (app_private.assert_ulid_prefixed(id, 'cr')),
  org_id text NOT NULL REFERENCES organization(id),
  supplier_asset_id text REFERENCES supplier_asset(id),
  subject_ref text NOT NULL,
  lawful_basis text NOT NULL,
  evidence_uri text,
  state text NOT NULL DEFAULT 'active' CHECK (state IN ('active','withdrawn','expired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text REFERENCES "operator"(id),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS dsar_request (
  id text PRIMARY KEY CHECK (app_private.assert_ulid_prefixed(id, 'ds')),
  org_id text NOT NULL REFERENCES organization(id),
  subject_ref text NOT NULL,
  request_type text NOT NULL CHECK (request_type IN ('access','delete','correct','export','restrict')),
  state text NOT NULL DEFAULT 'received' CHECK (state IN ('received','identity_verified','impact_assessed','propagating','completed')),
  sla_due_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text REFERENCES "operator"(id),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS build (
  id text PRIMARY KEY CHECK (app_private.assert_ulid_prefixed(id, 'bd')),
  org_id text NOT NULL REFERENCES organization(id),
  dataset_brief_id text REFERENCES dataset_brief(id),
  supplier_opportunity_id text REFERENCES supplier_opportunity(id),
  title text NOT NULL,
  state text NOT NULL DEFAULT 'planned' CHECK (state IN (
    'planned','intaking','profiling','cleaning','privacy','enriching','labeling',
    'qa','packaging','released','delivered','rework'
  )),
  eta_at timestamptz,
  q_score numeric(4,3),
  cost_budget_cents bigint NOT NULL DEFAULT 0,
  cost_used_cents bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text REFERENCES "operator"(id),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS build_plan (
  id text PRIMARY KEY CHECK (app_private.assert_ulid_prefixed(id, 'bp')),
  org_id text NOT NULL REFERENCES organization(id),
  build_id text NOT NULL REFERENCES build(id),
  manifest_yaml text NOT NULL,
  composed_permits jsonb NOT NULL DEFAULT '{}'::jsonb,
  license_blocked boolean NOT NULL DEFAULT false,
  state text NOT NULL DEFAULT 'draft' CHECK (state IN ('draft','approved','superseded')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text REFERENCES "operator"(id),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS run (
  id text PRIMARY KEY CHECK (app_private.assert_ulid_prefixed(id, 'rn')),
  org_id text NOT NULL REFERENCES organization(id),
  build_id text NOT NULL REFERENCES build(id),
  build_plan_id text REFERENCES build_plan(id),
  external_run_id text,
  state text NOT NULL DEFAULT 'queued' CHECK (state IN ('queued','running','succeeded','failed','cancelled')),
  retry_count integer NOT NULL DEFAULT 0,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text REFERENCES "operator"(id),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS gate_event (
  id text PRIMARY KEY CHECK (app_private.assert_ulid_prefixed(id, 'ge')),
  org_id text NOT NULL REFERENCES organization(id),
  build_id text NOT NULL REFERENCES build(id),
  gate_key text NOT NULL CHECK (gate_key IN ('G-1','G-2','G-3','G-4','G-5','G-6','G-7')),
  verdict text NOT NULL CHECK (verdict IN ('pass','review','blocked','pending')),
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text REFERENCES "operator"(id)
);

CREATE TABLE IF NOT EXISTS label_batch (
  id text PRIMARY KEY CHECK (app_private.assert_ulid_prefixed(id, 'lb')),
  org_id text NOT NULL REFERENCES organization(id),
  build_id text REFERENCES build(id),
  state text NOT NULL DEFAULT 'queued' CHECK (state IN ('queued','in_review','in_adjudication','closed','requeued')),
  queue_depth integer NOT NULL DEFAULT 0,
  agreement_score numeric(4,3),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text REFERENCES "operator"(id),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS qa_report (
  id text PRIMARY KEY CHECK (app_private.assert_ulid_prefixed(id, 'qr')),
  org_id text NOT NULL REFERENCES organization(id),
  build_id text REFERENCES build(id),
  dimensions jsonb NOT NULL DEFAULT '{}'::jsonb,
  composite_score numeric(4,3),
  verdict text NOT NULL DEFAULT 'review' CHECK (verdict IN ('pass','review','fail')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text REFERENCES "operator"(id),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS dataset (
  id text PRIMARY KEY CHECK (app_private.assert_ulid_prefixed(id, 'dt')),
  org_id text NOT NULL REFERENCES organization(id),
  name text NOT NULL,
  modality text NOT NULL,
  state text NOT NULL DEFAULT 'draft' CHECK (state IN ('draft','active','retired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text REFERENCES "operator"(id),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS dataset_version (
  id text PRIMARY KEY CHECK (app_private.assert_ulid_prefixed(id, 'dv')),
  org_id text NOT NULL REFERENCES organization(id),
  dataset_id text NOT NULL REFERENCES dataset(id),
  version_label text NOT NULL,
  build_id text REFERENCES build(id),
  manifest_uri text NOT NULL,
  content_hash text NOT NULL,
  size_bytes bigint,
  record_count bigint,
  composed_permits jsonb NOT NULL DEFAULT '{}'::jsonb,
  qa_score numeric(4,3),
  state text NOT NULL DEFAULT 'draft' CHECK (state IN ('draft','released','deprecated')),
  released_at timestamptz,
  released_by text REFERENCES "operator"(id),
  signed_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text REFERENCES "operator"(id),
  deleted_at timestamptz,
  UNIQUE (dataset_id, version_label)
);

CREATE TABLE IF NOT EXISTS lineage_event (
  id text PRIMARY KEY CHECK (app_private.assert_ulid_prefixed(id, 'le')),
  org_id text NOT NULL REFERENCES organization(id),
  dataset_version_id text REFERENCES dataset_version(id),
  namespace text NOT NULL,
  job_name text NOT NULL,
  run_id text,
  event_time timestamptz NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text REFERENCES "operator"(id)
);

CREATE TABLE IF NOT EXISTS pii_map (
  id text PRIMARY KEY CHECK (app_private.assert_ulid_prefixed(id, 'pm')),
  org_id text NOT NULL REFERENCES organization(id),
  dataset_version_id text REFERENCES dataset_version(id),
  findings jsonb NOT NULL DEFAULT '{}'::jsonb,
  treatments jsonb NOT NULL DEFAULT '{}'::jsonb,
  state text NOT NULL DEFAULT 'review' CHECK (state IN ('review','approved','blocked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text REFERENCES "operator"(id),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS catalogue_listing (
  id text PRIMARY KEY CHECK (app_private.assert_ulid_prefixed(id, 'cl')),
  org_id text NOT NULL REFERENCES organization(id),
  dataset_id text NOT NULL REFERENCES dataset(id),
  title text NOT NULL,
  pricing jsonb NOT NULL DEFAULT '{}'::jsonb,
  state text NOT NULL DEFAULT 'draft' CHECK (state IN ('draft','review','active','paused','retired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text REFERENCES "operator"(id),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS private_offer (
  id text PRIMARY KEY CHECK (app_private.assert_ulid_prefixed(id, 'po')),
  org_id text NOT NULL REFERENCES organization(id),
  buyer_org_id text NOT NULL REFERENCES organization(id),
  dataset_id text REFERENCES dataset(id),
  terms jsonb NOT NULL DEFAULT '{}'::jsonb,
  state text NOT NULL DEFAULT 'draft' CHECK (state IN ('draft','sent','accepted','expired','withdrawn')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text REFERENCES "operator"(id),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS quote (
  id text PRIMARY KEY CHECK (app_private.assert_ulid_prefixed(id, 'qt')),
  org_id text NOT NULL REFERENCES organization(id),
  buyer_opportunity_id text REFERENCES buyer_opportunity(id),
  amount_cents bigint NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  state text NOT NULL DEFAULT 'draft' CHECK (state IN ('draft','sent','accepted','rejected','expired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text REFERENCES "operator"(id),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS delivery (
  id text PRIMARY KEY CHECK (app_private.assert_ulid_prefixed(id, 'dl')),
  org_id text NOT NULL REFERENCES organization(id),
  dataset_version_id text REFERENCES dataset_version(id),
  buyer_org_id text REFERENCES organization(id),
  channel text NOT NULL,
  receipt jsonb NOT NULL DEFAULT '{}'::jsonb,
  state text NOT NULL DEFAULT 'scheduled' CHECK (state IN ('scheduled','preparing','ready','sent','downloaded','accepted','disputed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text REFERENCES "operator"(id),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS invoice (
  id text PRIMARY KEY CHECK (app_private.assert_ulid_prefixed(id, 'iv')),
  org_id text NOT NULL REFERENCES organization(id),
  quote_id text REFERENCES quote(id),
  stripe_invoice_id text,
  amount_cents bigint NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  state text NOT NULL DEFAULT 'draft' CHECK (state IN ('draft','open','paid','void','uncollectible')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text REFERENCES "operator"(id),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS payout (
  id text PRIMARY KEY CHECK (app_private.assert_ulid_prefixed(id, 'py')),
  org_id text NOT NULL REFERENCES organization(id),
  supplier_org_id text NOT NULL REFERENCES organization(id),
  stripe_transfer_id text,
  amount_cents bigint NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','paid','failed','held')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text REFERENCES "operator"(id),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS cost_entry (
  id text PRIMARY KEY CHECK (app_private.assert_ulid_prefixed(id, 'ce')),
  org_id text NOT NULL REFERENCES organization(id),
  build_id text REFERENCES build(id),
  category text NOT NULL,
  amount_cents bigint NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text REFERENCES "operator"(id)
);

CREATE TABLE IF NOT EXISTS alert (
  id text PRIMARY KEY CHECK (app_private.assert_ulid_prefixed(id, 'al')),
  org_id text NOT NULL REFERENCES organization(id),
  severity text NOT NULL CHECK (severity IN ('info','warning','critical')),
  title text NOT NULL,
  target_type text,
  target_id text,
  state text NOT NULL DEFAULT 'open' CHECK (state IN ('open','acknowledged','resolved')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text REFERENCES "operator"(id),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS integration (
  id text PRIMARY KEY CHECK (app_private.assert_ulid_prefixed(id, 'in')),
  org_id text NOT NULL REFERENCES organization(id),
  provider text NOT NULL,
  encrypted_config bytea NOT NULL,
  state text NOT NULL DEFAULT 'active' CHECK (state IN ('active','paused','revoked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text REFERENCES "operator"(id),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS signing_key (
  id text PRIMARY KEY CHECK (app_private.assert_ulid_prefixed(id, 'sk')),
  org_id text NOT NULL REFERENCES organization(id),
  public_key text NOT NULL,
  encrypted_private_key bytea NOT NULL,
  algorithm text NOT NULL DEFAULT 'Ed25519',
  state text NOT NULL DEFAULT 'active' CHECK (state IN ('active','retired','revoked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text REFERENCES "operator"(id),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS audit_event (
  id text NOT NULL CHECK (app_private.assert_ulid_prefixed(id, 'ae')),
  org_id text REFERENCES organization(id),
  actor_id text REFERENCES "operator"(id),
  action text NOT NULL,
  target_type text NOT NULL,
  target_id text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

CREATE TABLE IF NOT EXISTS audit_event_2026_q2
  PARTITION OF audit_event
  FOR VALUES FROM ('2026-04-01') TO ('2026-07-01');

CREATE INDEX IF NOT EXISTS audit_event_target_idx ON audit_event (target_type, target_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_event_actor_idx ON audit_event (actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS build_state_idx ON build (state, eta_at);
CREATE INDEX IF NOT EXISTS gate_event_build_idx ON gate_event (build_id, gate_key, created_at DESC);
CREATE INDEX IF NOT EXISTS lineage_event_dataset_version_idx ON lineage_event (dataset_version_id, event_time DESC);

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'organization','operator','contact','buyer_opportunity','supplier_opportunity',
    'contract','supplier_asset','dataset_brief','license_clause','consent_record',
    'dsar_request','build','build_plan','run','label_batch','qa_report','dataset',
    'dataset_version','pii_map','catalogue_listing','private_offer','quote','delivery',
    'invoice','payout','alert','integration','signing_key'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I_touch_updated_at ON %I', table_name, table_name);
    EXECUTE format(
      'CREATE TRIGGER %I_touch_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION app_private.touch_updated_at()',
      table_name,
      table_name
    );
  END LOOP;
END;
$$;

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'organization','operator','contact','buyer_opportunity','supplier_opportunity',
    'contract','supplier_asset','dataset_brief','license_clause','consent_record',
    'dsar_request','build','build_plan','run','gate_event','label_batch','qa_report',
    'dataset','dataset_version','lineage_event','pii_map','catalogue_listing',
    'private_offer','quote','delivery','invoice','payout','cost_entry','alert',
    'integration','signing_key','audit_event'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I_operator_scope ON %I', table_name, table_name);
    EXECUTE format(
      'CREATE POLICY %I_operator_scope ON %I USING (app_private.is_service_role() OR org_id = app_private.current_org_id()) WITH CHECK (app_private.is_service_role() OR org_id = app_private.current_org_id())',
      table_name,
      table_name
    );
  END LOOP;
END;
$$;
