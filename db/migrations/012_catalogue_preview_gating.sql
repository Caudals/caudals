-- M2 catalogue preview gating.
-- Adds version-scoped previews plus per-buyer NDA/operator access decisions.

ALTER TABLE catalogue_listing
  ADD COLUMN IF NOT EXISTS dataset_version_id text REFERENCES dataset_version(id),
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'private',
  ADD COLUMN IF NOT EXISTS sample_preview_uri text,
  ADD COLUMN IF NOT EXISTS sample_preview_policy jsonb NOT NULL DEFAULT '{"gate":"nda_required","watermark":true}'::jsonb,
  ADD COLUMN IF NOT EXISTS refresh_cadence text,
  ADD COLUMN IF NOT EXISTS license_tier text NOT NULL DEFAULT 'standard';

ALTER TABLE private_offer
  ADD COLUMN IF NOT EXISTS dataset_version_id text REFERENCES dataset_version(id),
  ADD COLUMN IF NOT EXISTS sample_preview_uri text,
  ADD COLUMN IF NOT EXISTS sample_preview_policy jsonb NOT NULL DEFAULT '{"gate":"operator_approved","watermark":true}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'catalogue_listing_visibility_check'
  ) THEN
    ALTER TABLE catalogue_listing
      ADD CONSTRAINT catalogue_listing_visibility_check
      CHECK (visibility IN ('public', 'partner', 'private'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'catalogue_listing_license_tier_check'
  ) THEN
    ALTER TABLE catalogue_listing
      ADD CONSTRAINT catalogue_listing_license_tier_check
      CHECK (license_tier IN ('standard', 'evaluation', 'enterprise', 'exclusive'));
  END IF;
END;
$$;

WITH latest_versions AS (
  SELECT DISTINCT ON (dataset_id)
    dataset_id,
    id
  FROM dataset_version
  WHERE deleted_at IS NULL
  ORDER BY dataset_id, released_at DESC NULLS LAST, updated_at DESC
)
UPDATE catalogue_listing listing
SET dataset_version_id = latest_versions.id
FROM latest_versions
WHERE listing.dataset_id = latest_versions.dataset_id
  AND listing.dataset_version_id IS NULL;

WITH latest_versions AS (
  SELECT DISTINCT ON (dataset_id)
    dataset_id,
    id
  FROM dataset_version
  WHERE deleted_at IS NULL
  ORDER BY dataset_id, released_at DESC NULLS LAST, updated_at DESC
)
UPDATE private_offer offer
SET dataset_version_id = latest_versions.id
FROM latest_versions
WHERE offer.dataset_id = latest_versions.dataset_id
  AND offer.dataset_version_id IS NULL;

CREATE TABLE IF NOT EXISTS sample_preview_access (
  id text PRIMARY KEY CHECK (app_private.assert_ulid_prefixed(id, 'pa')),
  org_id text NOT NULL REFERENCES organization(id),
  catalogue_listing_id text REFERENCES catalogue_listing(id),
  private_offer_id text REFERENCES private_offer(id),
  buyer_org_id text NOT NULL REFERENCES organization(id),
  requester_contact_id text REFERENCES contact(id),
  state text NOT NULL DEFAULT 'requested' CHECK (
    state IN ('requested', 'nda_acknowledged', 'approved', 'denied', 'revoked', 'expired')
  ),
  nda_acknowledged_at timestamptz,
  watermark_subject text NOT NULL DEFAULT 'buyer_org' CHECK (
    watermark_subject IN ('buyer_org', 'buyer_contact', 'operator')
  ),
  decision_reason text,
  expires_at timestamptz,
  decided_by text REFERENCES "operator"(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text REFERENCES "operator"(id),
  deleted_at timestamptz,
  CHECK (num_nonnulls(catalogue_listing_id, private_offer_id) = 1)
);

CREATE INDEX IF NOT EXISTS catalogue_listing_dataset_version_idx
  ON catalogue_listing (dataset_version_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS private_offer_dataset_version_idx
  ON private_offer (dataset_version_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS sample_preview_access_listing_idx
  ON sample_preview_access (catalogue_listing_id, buyer_org_id, state)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS sample_preview_access_offer_idx
  ON sample_preview_access (private_offer_id, buyer_org_id, state)
  WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS sample_preview_access_touch_updated_at ON sample_preview_access;
CREATE TRIGGER sample_preview_access_touch_updated_at
  BEFORE UPDATE ON sample_preview_access
  FOR EACH ROW
  EXECUTE FUNCTION app_private.touch_updated_at();

ALTER TABLE sample_preview_access ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sample_preview_access_operator_scope ON sample_preview_access;
CREATE POLICY sample_preview_access_operator_scope ON sample_preview_access
  USING (app_private.is_service_role() OR org_id = app_private.current_org_id())
  WITH CHECK (app_private.is_service_role() OR org_id = app_private.current_org_id());
