ALTER TABLE supplier_opportunity
  ADD COLUMN IF NOT EXISTS supplier_org_id text REFERENCES organization(id);

ALTER TABLE supplier_asset
  ADD COLUMN IF NOT EXISTS supplier_org_id text REFERENCES organization(id),
  ADD COLUMN IF NOT EXISTS sample_upload_uri text,
  ADD COLUMN IF NOT EXISTS sample_upload_filename text,
  ADD COLUMN IF NOT EXISTS sample_upload_bytes bigint,
  ADD COLUMN IF NOT EXISTS sample_upload_content_type text,
  ADD COLUMN IF NOT EXISTS sample_upload_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS sample_upload_received_at timestamptz,
  ADD COLUMN IF NOT EXISTS supplier_portal_metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE supplier_asset AS sa
SET supplier_org_id = ct.counterparty_org_id
FROM contract AS ct
WHERE sa.contract_id = ct.id
  AND sa.supplier_org_id IS NULL
  AND ct.counterparty_org_id IS NOT NULL;

WITH single_supplier AS (
  SELECT org_id, min(id) AS supplier_org_id
  FROM organization
  WHERE kind = 'supplier'
    AND state = 'active'
    AND deleted_at IS NULL
  GROUP BY org_id
  HAVING count(*) = 1
)
UPDATE supplier_opportunity AS so
SET supplier_org_id = ss.supplier_org_id
FROM single_supplier AS ss
WHERE so.org_id = ss.org_id
  AND so.supplier_org_id IS NULL;

CREATE INDEX IF NOT EXISTS supplier_opportunity_supplier_org_idx
  ON supplier_opportunity (supplier_org_id, state, updated_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS supplier_asset_supplier_org_idx
  ON supplier_asset (supplier_org_id, state, updated_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS supplier_asset_sample_upload_idx
  ON supplier_asset (sample_upload_received_at DESC)
  WHERE sample_upload_uri IS NOT NULL AND deleted_at IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'supplier_asset_sample_upload_bytes_positive'
  ) THEN
    ALTER TABLE supplier_asset
      ADD CONSTRAINT supplier_asset_sample_upload_bytes_positive
      CHECK (sample_upload_bytes IS NULL OR sample_upload_bytes > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'supplier_asset_sample_received_requires_uri'
  ) THEN
    ALTER TABLE supplier_asset
      ADD CONSTRAINT supplier_asset_sample_received_requires_uri
      CHECK (
        sample_upload_received_at IS NULL
        OR (sample_upload_uri IS NOT NULL AND char_length(sample_upload_uri) > 1)
      );
  END IF;
END;
$$;
