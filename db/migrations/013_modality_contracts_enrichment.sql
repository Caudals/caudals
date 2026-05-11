-- M2 modality contracts and enrichment manifests.
-- Adds operator-scoped records for video/audio/geospatial coverage and G-5 enrichment review.

CREATE TABLE IF NOT EXISTS modality_contract (
  id text PRIMARY KEY CHECK (app_private.assert_ulid_prefixed(id, 'mc')),
  org_id text NOT NULL REFERENCES organization(id),
  dataset_version_id text NOT NULL REFERENCES dataset_version(id),
  modality text NOT NULL CHECK (modality IN ('video','audio','geospatial')),
  canonical_format text NOT NULL,
  profile_signals jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(profile_signals) = 'array'),
  cleaning_operators jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(cleaning_operators) = 'array'),
  privacy_treatments jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(privacy_treatments) = 'array'),
  labeling_widgets text[] NOT NULL DEFAULT '{}',
  qa_dimensions jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(qa_dimensions) = 'array'),
  packaging_targets text[] NOT NULL DEFAULT '{}',
  state text NOT NULL DEFAULT 'draft' CHECK (
    state IN ('draft','review','approved','blocked','superseded')
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text REFERENCES "operator"(id),
  deleted_at timestamptz,
  CHECK (char_length(canonical_format) BETWEEN 2 AND 120),
  CHECK (cardinality(labeling_widgets) > 0),
  CHECK (cardinality(packaging_targets) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS modality_contract_version_modality_idx
  ON modality_contract (dataset_version_id, modality)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS modality_contract_org_state_idx
  ON modality_contract (org_id, state, updated_at DESC)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS enrichment_manifest (
  id text PRIMARY KEY CHECK (app_private.assert_ulid_prefixed(id, 'em')),
  org_id text NOT NULL REFERENCES organization(id),
  build_id text REFERENCES build(id),
  dataset_version_id text REFERENCES dataset_version(id),
  modality_contract_id text REFERENCES modality_contract(id),
  enrichment_class text NOT NULL CHECK (
    enrichment_class IN (
      'reference_data',
      'geospatial',
      'categorical',
      'derived_features',
      'embeddings',
      'llm_derived',
      'external_join'
    )
  ),
  added_columns jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(added_columns) = 'array'),
  sources jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(sources) = 'array'),
  source_license text NOT NULL,
  source_version text,
  computation_method text NOT NULL,
  model_identity_hash text,
  prompt_template_version text,
  reproducer_uri text,
  spot_check_rate numeric(4,3) CHECK (spot_check_rate IS NULL OR spot_check_rate BETWEEN 0 AND 1),
  independence_passed boolean NOT NULL DEFAULT false,
  license_compatible boolean NOT NULL DEFAULT false,
  state text NOT NULL DEFAULT 'draft' CHECK (
    state IN ('draft','review','approved','blocked','superseded')
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text REFERENCES "operator"(id),
  deleted_at timestamptz,
  CHECK (num_nonnulls(build_id, dataset_version_id) >= 1),
  CHECK (jsonb_array_length(added_columns) > 0),
  CHECK (jsonb_array_length(sources) > 0),
  CHECK (char_length(source_license) BETWEEN 2 AND 120),
  CHECK (char_length(computation_method) BETWEEN 2 AND 500)
);

CREATE INDEX IF NOT EXISTS enrichment_manifest_build_state_idx
  ON enrichment_manifest (build_id, state, updated_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS enrichment_manifest_version_state_idx
  ON enrichment_manifest (dataset_version_id, state, updated_at DESC)
  WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS modality_contract_touch_updated_at ON modality_contract;
CREATE TRIGGER modality_contract_touch_updated_at
  BEFORE UPDATE ON modality_contract
  FOR EACH ROW EXECUTE FUNCTION app_private.touch_updated_at();

DROP TRIGGER IF EXISTS enrichment_manifest_touch_updated_at ON enrichment_manifest;
CREATE TRIGGER enrichment_manifest_touch_updated_at
  BEFORE UPDATE ON enrichment_manifest
  FOR EACH ROW EXECUTE FUNCTION app_private.touch_updated_at();

ALTER TABLE modality_contract ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS modality_contract_operator_scope ON modality_contract;
CREATE POLICY modality_contract_operator_scope ON modality_contract
  USING (app_private.is_service_role() OR org_id = app_private.current_org_id())
  WITH CHECK (app_private.is_service_role() OR org_id = app_private.current_org_id());

ALTER TABLE enrichment_manifest ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS enrichment_manifest_operator_scope ON enrichment_manifest;
CREATE POLICY enrichment_manifest_operator_scope ON enrichment_manifest
  USING (app_private.is_service_role() OR org_id = app_private.current_org_id())
  WITH CHECK (app_private.is_service_role() OR org_id = app_private.current_org_id());
