DROP INDEX IF EXISTS integration_supplier_scope_idx;

ALTER TABLE integration
  DROP CONSTRAINT IF EXISTS integration_supplier_payout_scope_check,
  DROP CONSTRAINT IF EXISTS integration_supplier_org_id_fkey;

UPDATE integration
SET integration_scope = 'internal'
WHERE integration_scope = 'supplier_payout';

ALTER TABLE integration DROP CONSTRAINT IF EXISTS integration_scope_check;
ALTER TABLE integration
  ADD CONSTRAINT integration_scope_check
  CHECK (integration_scope IN ('internal','buyer_delivery','supplier_delivery'));

ALTER TABLE integration DROP COLUMN IF EXISTS supplier_org_id;
