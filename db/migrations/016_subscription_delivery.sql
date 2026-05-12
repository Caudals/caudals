-- M2 subscription delivery model with delta manifests.
-- Tracks recurring buyer feeds and each increment's verifiable delta evidence.

CREATE TABLE IF NOT EXISTS subscription (
  id text PRIMARY KEY CHECK (app_private.assert_ulid_prefixed(id, 'su')),
  org_id text NOT NULL REFERENCES organization(id),
  buyer_org_id text NOT NULL REFERENCES organization(id),
  dataset_id text NOT NULL REFERENCES dataset(id),
  contract_id text REFERENCES contract(id),
  private_offer_id text REFERENCES private_offer(id),
  current_dataset_version_id text REFERENCES dataset_version(id),
  cadence text NOT NULL DEFAULT 'monthly' CHECK (
    cadence IN ('weekly','monthly','quarterly','event_driven','custom')
  ),
  delivery_channel text NOT NULL DEFAULT 'delta_share' CHECK (
    delivery_channel IN (
      'signed_s3','signed_url','s3_share','warehouse_share','api','delta_share'
    )
  ),
  state text NOT NULL DEFAULT 'draft' CHECK (
    state IN ('draft','active','refreshing','paused','terminated','blocked')
  ),
  rolling_window_versions integer NOT NULL DEFAULT 3 CHECK (rolling_window_versions > 0),
  next_refresh_at timestamptz,
  retention_policy jsonb NOT NULL DEFAULT '{}'::jsonb,
  delivery_policy jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text REFERENCES "operator"(id),
  deleted_at timestamptz,
  CONSTRAINT subscription_active_refresh_schedule_check
    CHECK (state NOT IN ('active','refreshing') OR next_refresh_at IS NOT NULL),
  CONSTRAINT subscription_refresh_version_check
    CHECK (state <> 'refreshing' OR current_dataset_version_id IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS delta_manifest (
  id text PRIMARY KEY CHECK (app_private.assert_ulid_prefixed(id, 'dm')),
  org_id text NOT NULL REFERENCES organization(id),
  subscription_id text NOT NULL REFERENCES subscription(id) ON DELETE CASCADE,
  dataset_version_id text NOT NULL REFERENCES dataset_version(id),
  previous_dataset_version_id text REFERENCES dataset_version(id),
  delivery_id text REFERENCES delivery(id),
  qa_report_id text REFERENCES qa_report(id),
  state text NOT NULL DEFAULT 'draft' CHECK (
    state IN ('draft','validating','ready','published','tombstoned','blocked')
  ),
  manifest_uri text NOT NULL,
  manifest_hash text NOT NULL,
  added_records bigint NOT NULL DEFAULT 0 CHECK (added_records >= 0),
  updated_records bigint NOT NULL DEFAULT 0 CHECK (updated_records >= 0),
  deleted_records bigint NOT NULL DEFAULT 0 CHECK (deleted_records >= 0),
  tombstoned_records bigint NOT NULL DEFAULT 0 CHECK (tombstoned_records >= 0),
  total_records bigint NOT NULL DEFAULT 0 CHECK (total_records >= 0),
  quality_score numeric(5,4) CHECK (quality_score >= 0 AND quality_score <= 1),
  rights_reverified boolean NOT NULL DEFAULT false,
  privacy_verified boolean NOT NULL DEFAULT false,
  deletion_notice_uri text,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  published_at timestamptz,
  tombstoned_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text REFERENCES "operator"(id),
  deleted_at timestamptz,
  CONSTRAINT delta_manifest_version_progression_check
    CHECK (previous_dataset_version_id IS NULL OR previous_dataset_version_id <> dataset_version_id),
  CONSTRAINT delta_manifest_deleted_lte_total_check
    CHECK (deleted_records + tombstoned_records <= total_records),
  CONSTRAINT delta_manifest_published_evidence_check
    CHECK (
      state <> 'published'
      OR (
        previous_dataset_version_id IS NOT NULL
        AND delivery_id IS NOT NULL
        AND qa_report_id IS NOT NULL
        AND rights_reverified
        AND privacy_verified
        AND quality_score IS NOT NULL
        AND char_length(manifest_uri) > 1
        AND char_length(manifest_hash) > 1
      )
    ),
  CONSTRAINT delta_manifest_tombstone_notice_check
    CHECK (
      state <> 'tombstoned'
      OR (tombstoned_records > 0 AND char_length(deletion_notice_uri) > 1)
    )
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'delivery'
      AND column_name = 'subscription_id'
  ) THEN
    ALTER TABLE delivery ADD COLUMN subscription_id text;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'delivery_subscription_id_fkey'
  ) THEN
    ALTER TABLE delivery
      ADD CONSTRAINT delivery_subscription_id_fkey
      FOREIGN KEY (subscription_id) REFERENCES subscription(id);
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS subscription_buyer_state_idx
  ON subscription (buyer_org_id, state, next_refresh_at)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS subscription_dataset_idx
  ON subscription (dataset_id, state, updated_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS delta_manifest_subscription_state_idx
  ON delta_manifest (subscription_id, state, updated_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS delta_manifest_dataset_version_idx
  ON delta_manifest (dataset_version_id, state, updated_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS delivery_subscription_idx
  ON delivery (subscription_id, state, updated_at DESC)
  WHERE deleted_at IS NULL AND subscription_id IS NOT NULL;

DROP TRIGGER IF EXISTS subscription_touch_updated_at ON subscription;
CREATE TRIGGER subscription_touch_updated_at
  BEFORE UPDATE ON subscription
  FOR EACH ROW EXECUTE FUNCTION app_private.touch_updated_at();

DROP TRIGGER IF EXISTS delta_manifest_touch_updated_at ON delta_manifest;
CREATE TRIGGER delta_manifest_touch_updated_at
  BEFORE UPDATE ON delta_manifest
  FOR EACH ROW EXECUTE FUNCTION app_private.touch_updated_at();

CREATE OR REPLACE FUNCTION app_private.sync_delta_manifest_to_delivery()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.delivery_id IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE delivery
  SET
    subscription_id = NEW.subscription_id,
    receipt = receipt || jsonb_build_object(
      'deltaManifest',
      jsonb_strip_nulls(jsonb_build_object(
        'manifest_id', NEW.id,
        'state', NEW.state,
        'manifest_uri', NEW.manifest_uri,
        'manifest_hash', NEW.manifest_hash,
        'dataset_version_id', NEW.dataset_version_id,
        'previous_dataset_version_id', NEW.previous_dataset_version_id,
        'added_records', NEW.added_records,
        'updated_records', NEW.updated_records,
        'deleted_records', NEW.deleted_records,
        'tombstoned_records', NEW.tombstoned_records,
        'quality_score', NEW.quality_score,
        'rights_reverified', NEW.rights_reverified,
        'privacy_verified', NEW.privacy_verified,
        'deletion_notice_uri', NEW.deletion_notice_uri
      ))
    ),
    updated_at = now()
  WHERE id = NEW.delivery_id
    AND org_id = NEW.org_id
    AND deleted_at IS NULL;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION app_private.sync_published_delta_to_subscription()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.state <> 'published' THEN
    RETURN NEW;
  END IF;

  UPDATE subscription
  SET
    current_dataset_version_id = NEW.dataset_version_id,
    state = CASE WHEN state = 'terminated' THEN state ELSE 'active' END,
    delivery_policy = delivery_policy || jsonb_build_object(
      'latest_delta_manifest_id', NEW.id,
      'latest_manifest_uri', NEW.manifest_uri,
      'latest_manifest_hash', NEW.manifest_hash,
      'latest_quality_score', NEW.quality_score
    ),
    updated_at = now()
  WHERE id = NEW.subscription_id
    AND org_id = NEW.org_id
    AND deleted_at IS NULL;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS delta_manifest_sync_delivery ON delta_manifest;
CREATE TRIGGER delta_manifest_sync_delivery
  AFTER INSERT OR UPDATE OF state, manifest_uri, manifest_hash, dataset_version_id,
    previous_dataset_version_id, delivery_id, added_records, updated_records,
    deleted_records, tombstoned_records, quality_score, rights_reverified,
    privacy_verified, deletion_notice_uri
  ON delta_manifest
  FOR EACH ROW EXECUTE FUNCTION app_private.sync_delta_manifest_to_delivery();

DROP TRIGGER IF EXISTS delta_manifest_sync_subscription ON delta_manifest;
CREATE TRIGGER delta_manifest_sync_subscription
  AFTER INSERT OR UPDATE OF state, dataset_version_id, manifest_uri, manifest_hash,
    quality_score
  ON delta_manifest
  FOR EACH ROW EXECUTE FUNCTION app_private.sync_published_delta_to_subscription();

ALTER TABLE subscription ENABLE ROW LEVEL SECURITY;
ALTER TABLE delta_manifest ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS subscription_operator_scope ON subscription;
CREATE POLICY subscription_operator_scope ON subscription
  USING (app_private.is_service_role() OR org_id = app_private.current_org_id())
  WITH CHECK (app_private.is_service_role() OR org_id = app_private.current_org_id());

DROP POLICY IF EXISTS delta_manifest_operator_scope ON delta_manifest;
CREATE POLICY delta_manifest_operator_scope ON delta_manifest
  USING (app_private.is_service_role() OR org_id = app_private.current_org_id())
  WITH CHECK (app_private.is_service_role() OR org_id = app_private.current_org_id());
