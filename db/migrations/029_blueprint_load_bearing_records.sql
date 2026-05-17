-- Blueprint §28 load-bearing records that were still represented only by
-- downstream evidence tables or external payment/provider state.

CREATE TABLE IF NOT EXISTS reviewer (
  id text PRIMARY KEY CHECK (app_private.assert_ulid_prefixed(id, 'rv')),
  org_id text NOT NULL REFERENCES organization(id),
  contact_id text REFERENCES contact(id),
  display_name text NOT NULL,
  reviewer_pool text NOT NULL CHECK (
    reviewer_pool IN ('in_house_specialist','partner_workforce','subject_matter_expert')
  ),
  skill_profile jsonb NOT NULL DEFAULT '{}'::jsonb,
  data_access_policy jsonb NOT NULL DEFAULT '{}'::jsonb,
  state text NOT NULL DEFAULT 'candidate' CHECK (
    state IN ('candidate','active','suspended','retired')
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text REFERENCES "operator"(id),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS dataset_partition (
  id text PRIMARY KEY CHECK (app_private.assert_ulid_prefixed(id, 'dp')),
  org_id text NOT NULL REFERENCES organization(id),
  dataset_version_id text REFERENCES dataset_version(id),
  layer text NOT NULL CHECK (layer IN ('bronze','silver','gold')),
  partition_key text NOT NULL,
  object_uri text NOT NULL,
  content_hash text,
  format text NOT NULL CHECK (
    format IN (
      'parquet',
      'jsonl',
      'lance',
      'webdataset',
      'stac',
      'geoparquet',
      'cog',
      'mp4',
      'wav',
      'flac',
      'pdf',
      'other'
    )
  ),
  record_count bigint CHECK (record_count IS NULL OR record_count >= 0),
  size_bytes bigint CHECK (size_bytes IS NULL OR size_bytes >= 0),
  provenance_manifest jsonb NOT NULL DEFAULT '{}'::jsonb,
  state text NOT NULL DEFAULT 'draft' CHECK (
    state IN ('draft','sealed','quarantined','promoted','tombstoned')
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text REFERENCES "operator"(id),
  deleted_at timestamptz,
  UNIQUE (dataset_version_id, layer, partition_key)
);

CREATE TABLE IF NOT EXISTS manifest_artifact (
  id text PRIMARY KEY CHECK (app_private.assert_ulid_prefixed(id, 'ma')),
  org_id text NOT NULL REFERENCES organization(id),
  dataset_version_id text REFERENCES dataset_version(id),
  build_id text REFERENCES build(id),
  artifact_type text NOT NULL CHECK (
    artifact_type IN (
      'source_manifest',
      'profile_report',
      'pii_map',
      'redaction_log',
      'enrichment_manifest',
      'label_manifest',
      'qa_report',
      'package_manifest',
      'dataset_card',
      'datasheet',
      'croissant',
      'schema_dictionary',
      'license_summary',
      'privacy_summary',
      'refresh_policy',
      'sample_preview',
      'lineage_manifest',
      'other'
    )
  ),
  artifact_uri text NOT NULL,
  content_hash text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  state text NOT NULL DEFAULT 'draft' CHECK (
    state IN ('draft','generated','review','approved','published','superseded','blocked')
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text REFERENCES "operator"(id),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS payment (
  id text PRIMARY KEY CHECK (app_private.assert_ulid_prefixed(id, 'pt')),
  org_id text NOT NULL REFERENCES organization(id),
  invoice_id text REFERENCES invoice(id),
  buyer_org_id text REFERENCES organization(id),
  stripe_payment_intent_id text,
  amount_cents bigint NOT NULL CHECK (amount_cents >= 0),
  currency text NOT NULL DEFAULT 'USD' CHECK (currency IN ('USD','EUR','GBP')),
  receipt jsonb NOT NULL DEFAULT '{}'::jsonb,
  state text NOT NULL DEFAULT 'pending' CHECK (
    state IN ('pending','processing','succeeded','failed','refunded','disputed')
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text REFERENCES "operator"(id),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS revenue_share (
  id text PRIMARY KEY CHECK (app_private.assert_ulid_prefixed(id, 'rs')),
  org_id text NOT NULL REFERENCES organization(id),
  supplier_org_id text NOT NULL REFERENCES organization(id),
  dataset_version_id text REFERENCES dataset_version(id),
  contract_id text REFERENCES contract(id),
  payout_id text REFERENCES payout(id),
  basis jsonb NOT NULL DEFAULT '{}'::jsonb,
  share_rate numeric(6,5) NOT NULL DEFAULT 0 CHECK (share_rate >= 0 AND share_rate <= 1),
  gross_cents bigint NOT NULL DEFAULT 0 CHECK (gross_cents >= 0),
  net_cents bigint NOT NULL DEFAULT 0 CHECK (net_cents >= 0),
  currency text NOT NULL DEFAULT 'USD' CHECK (currency IN ('USD','EUR','GBP')),
  state text NOT NULL DEFAULT 'accrued' CHECK (
    state IN ('accrued','approved','payable','paid','held','reversed')
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text REFERENCES "operator"(id),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS reviewer_org_state_idx
  ON reviewer (org_id, state, updated_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS dataset_partition_version_layer_idx
  ON dataset_partition (dataset_version_id, layer, state)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS manifest_artifact_version_type_idx
  ON manifest_artifact (dataset_version_id, artifact_type, state)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS payment_invoice_state_idx
  ON payment (invoice_id, state, updated_at DESC)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS payment_stripe_payment_intent_idx
  ON payment (stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS revenue_share_supplier_state_idx
  ON revenue_share (supplier_org_id, state, updated_at DESC)
  WHERE deleted_at IS NULL;

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'reviewer',
    'dataset_partition',
    'manifest_artifact',
    'payment',
    'revenue_share'
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
    'reviewer',
    'dataset_partition',
    'manifest_artifact',
    'payment',
    'revenue_share'
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
