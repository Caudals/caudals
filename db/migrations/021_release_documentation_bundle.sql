-- M3 release documentation bundles.
-- Stores generated Croissant, Article 10, package, and HF mirror evidence for G-7.

CREATE TABLE IF NOT EXISTS release_documentation_bundle (
  id text PRIMARY KEY CHECK (app_private.assert_ulid_prefixed(id, 'rd')),
  org_id text NOT NULL REFERENCES organization(id),
  dataset_version_id text NOT NULL REFERENCES dataset_version(id),
  catalogue_listing_id text REFERENCES catalogue_listing(id),
  documentation_uri text,
  package_manifest jsonb NOT NULL DEFAULT '{}'::jsonb,
  croissant_manifest jsonb NOT NULL DEFAULT '{}'::jsonb,
  article10_document jsonb NOT NULL DEFAULT '{}'::jsonb,
  required_documents jsonb NOT NULL DEFAULT '{}'::jsonb,
  hf_mirror jsonb NOT NULL DEFAULT '{}'::jsonb,
  validation_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  state text NOT NULL DEFAULT 'draft' CHECK (
    state IN ('draft','generated','review','approved','published','blocked','superseded')
  ),
  generated_at timestamptz,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text REFERENCES "operator"(id),
  deleted_at timestamptz,
  UNIQUE (dataset_version_id),
  CONSTRAINT release_documentation_generated_evidence_check CHECK (
    state NOT IN ('review','approved','published')
    OR (
      required_documents ?& ARRAY[
        'datasetCard',
        'datasheet',
        'croissantManifest',
        'schemaDataDictionary',
        'qualityScorecard',
        'lineageProvenanceSummary',
        'licensePermittedUseSummary',
        'privacySummary',
        'refreshPolicy',
        'samplePreview'
      ]
      AND croissant_manifest ? '@context'
      AND croissant_manifest ? '@type'
      AND article10_document ? 'dataGovernance'
      AND article10_document ? 'biasTesting'
      AND article10_document ? 'relevanceRepresentativeness'
      AND package_manifest ? 'croissant'
    )
  ),
  CONSTRAINT release_documentation_published_evidence_check CHECK (
    state <> 'published'
    OR (
      documentation_uri IS NOT NULL
      AND char_length(documentation_uri) > 1
      AND validation_summary ->> 'status' = 'pass'
      AND (
        catalogue_listing_id IS NULL
        OR (
          hf_mirror ? 'namespace'
          AND hf_mirror ? 'repoId'
          AND hf_mirror ? 'url'
          AND hf_mirror ? 'license'
        )
      )
    )
  )
);

CREATE INDEX IF NOT EXISTS release_documentation_bundle_org_state_idx
  ON release_documentation_bundle (org_id, state, updated_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS release_documentation_bundle_dataset_version_idx
  ON release_documentation_bundle (dataset_version_id)
  WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS release_documentation_bundle_touch_updated_at
  ON release_documentation_bundle;
CREATE TRIGGER release_documentation_bundle_touch_updated_at
  BEFORE UPDATE ON release_documentation_bundle
  FOR EACH ROW EXECUTE FUNCTION app_private.touch_updated_at();

ALTER TABLE release_documentation_bundle ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS release_documentation_bundle_operator_scope
  ON release_documentation_bundle;
CREATE POLICY release_documentation_bundle_operator_scope
  ON release_documentation_bundle
  USING (app_private.is_service_role() OR org_id = app_private.current_org_id())
  WITH CHECK (app_private.is_service_role() OR org_id = app_private.current_org_id());
