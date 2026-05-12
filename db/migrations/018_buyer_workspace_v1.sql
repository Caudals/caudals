-- M3 buyer workspace v1.
-- Adds buyer-scoped commercial and delivery-integration fields for the
-- authenticated buyer workspace without exposing broader self-service flows.

ALTER TABLE quote ADD COLUMN IF NOT EXISTS buyer_org_id text;
ALTER TABLE invoice ADD COLUMN IF NOT EXISTS buyer_org_id text;

ALTER TABLE integration ADD COLUMN IF NOT EXISTS buyer_org_id text;
ALTER TABLE integration ADD COLUMN IF NOT EXISTS integration_scope text NOT NULL DEFAULT 'internal';
ALTER TABLE integration ADD COLUMN IF NOT EXISTS display_name text;
ALTER TABLE integration ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE integration ADD COLUMN IF NOT EXISTS last_verified_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'quote_buyer_org_id_fkey'
  ) THEN
    ALTER TABLE quote
      ADD CONSTRAINT quote_buyer_org_id_fkey
      FOREIGN KEY (buyer_org_id) REFERENCES organization(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'invoice_buyer_org_id_fkey'
  ) THEN
    ALTER TABLE invoice
      ADD CONSTRAINT invoice_buyer_org_id_fkey
      FOREIGN KEY (buyer_org_id) REFERENCES organization(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'integration_buyer_org_id_fkey'
  ) THEN
    ALTER TABLE integration
      ADD CONSTRAINT integration_buyer_org_id_fkey
      FOREIGN KEY (buyer_org_id) REFERENCES organization(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'integration_scope_check'
  ) THEN
    ALTER TABLE integration
      ADD CONSTRAINT integration_scope_check
      CHECK (integration_scope IN ('internal','buyer_delivery','supplier_delivery'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'integration_buyer_delivery_scope_check'
  ) THEN
    ALTER TABLE integration
      ADD CONSTRAINT integration_buyer_delivery_scope_check
      CHECK (integration_scope <> 'buyer_delivery' OR buyer_org_id IS NOT NULL);
  END IF;
END;
$$;

WITH single_buyer AS (
  SELECT org_id, min(id) AS buyer_org_id
  FROM organization
  WHERE kind = 'buyer'
    AND deleted_at IS NULL
  GROUP BY org_id
  HAVING count(*) = 1
)
UPDATE quote q
SET buyer_org_id = single_buyer.buyer_org_id
FROM single_buyer
WHERE q.org_id = single_buyer.org_id
  AND q.buyer_org_id IS NULL
  AND q.deleted_at IS NULL;

UPDATE invoice iv
SET buyer_org_id = qt.buyer_org_id
FROM quote qt
WHERE iv.quote_id = qt.id
  AND iv.buyer_org_id IS NULL
  AND qt.buyer_org_id IS NOT NULL
  AND iv.deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS quote_buyer_org_state_idx
  ON quote (buyer_org_id, state, updated_at DESC)
  WHERE deleted_at IS NULL AND buyer_org_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS invoice_buyer_org_state_idx
  ON invoice (buyer_org_id, state, updated_at DESC)
  WHERE deleted_at IS NULL AND buyer_org_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS integration_buyer_scope_idx
  ON integration (buyer_org_id, integration_scope, state, updated_at DESC)
  WHERE deleted_at IS NULL AND buyer_org_id IS NOT NULL;
