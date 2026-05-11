DROP POLICY IF EXISTS sample_preview_access_operator_scope ON sample_preview_access;
DROP TRIGGER IF EXISTS sample_preview_access_touch_updated_at ON sample_preview_access;
DROP TABLE IF EXISTS sample_preview_access CASCADE;

DROP INDEX IF EXISTS catalogue_listing_dataset_version_idx;
DROP INDEX IF EXISTS private_offer_dataset_version_idx;

ALTER TABLE catalogue_listing
  DROP CONSTRAINT IF EXISTS catalogue_listing_visibility_check,
  DROP CONSTRAINT IF EXISTS catalogue_listing_license_tier_check,
  DROP COLUMN IF EXISTS dataset_version_id,
  DROP COLUMN IF EXISTS visibility,
  DROP COLUMN IF EXISTS sample_preview_uri,
  DROP COLUMN IF EXISTS sample_preview_policy,
  DROP COLUMN IF EXISTS refresh_cadence,
  DROP COLUMN IF EXISTS license_tier;

ALTER TABLE private_offer
  DROP COLUMN IF EXISTS dataset_version_id,
  DROP COLUMN IF EXISTS sample_preview_uri,
  DROP COLUMN IF EXISTS sample_preview_policy;
