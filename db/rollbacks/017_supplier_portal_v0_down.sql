ALTER TABLE supplier_asset
  DROP CONSTRAINT IF EXISTS supplier_asset_sample_received_requires_uri,
  DROP CONSTRAINT IF EXISTS supplier_asset_sample_upload_bytes_positive;

DROP INDEX IF EXISTS supplier_asset_sample_upload_idx;
DROP INDEX IF EXISTS supplier_asset_supplier_org_idx;
DROP INDEX IF EXISTS supplier_opportunity_supplier_org_idx;

ALTER TABLE supplier_asset
  DROP COLUMN IF EXISTS supplier_portal_metadata,
  DROP COLUMN IF EXISTS sample_upload_received_at,
  DROP COLUMN IF EXISTS sample_upload_requested_at,
  DROP COLUMN IF EXISTS sample_upload_content_type,
  DROP COLUMN IF EXISTS sample_upload_bytes,
  DROP COLUMN IF EXISTS sample_upload_filename,
  DROP COLUMN IF EXISTS sample_upload_uri,
  DROP COLUMN IF EXISTS supplier_org_id;

ALTER TABLE supplier_opportunity
  DROP COLUMN IF EXISTS supplier_org_id;
