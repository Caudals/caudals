-- M3 supplier portal v1.
-- Adds supplier-scoped integration metadata for read-only Stripe Connect payout
-- visibility while keeping actual transfer execution in operator-controlled flows.

ALTER TABLE integration ADD COLUMN IF NOT EXISTS supplier_org_id text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'integration_supplier_org_id_fkey'
  ) THEN
    ALTER TABLE integration
      ADD CONSTRAINT integration_supplier_org_id_fkey
      FOREIGN KEY (supplier_org_id) REFERENCES organization(id);
  END IF;
END;
$$;

ALTER TABLE integration DROP CONSTRAINT IF EXISTS integration_scope_check;
ALTER TABLE integration
  ADD CONSTRAINT integration_scope_check
  CHECK (integration_scope IN ('internal','buyer_delivery','supplier_delivery','supplier_payout'));

ALTER TABLE integration DROP CONSTRAINT IF EXISTS integration_supplier_payout_scope_check;
ALTER TABLE integration
  ADD CONSTRAINT integration_supplier_payout_scope_check
  CHECK (integration_scope <> 'supplier_payout' OR supplier_org_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS integration_supplier_scope_idx
  ON integration (supplier_org_id, integration_scope, state, updated_at DESC)
  WHERE deleted_at IS NULL AND supplier_org_id IS NOT NULL;
