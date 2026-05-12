DROP INDEX IF EXISTS integration_buyer_scope_idx;
DROP INDEX IF EXISTS invoice_buyer_org_state_idx;
DROP INDEX IF EXISTS quote_buyer_org_state_idx;

ALTER TABLE integration
  DROP CONSTRAINT IF EXISTS integration_buyer_delivery_scope_check,
  DROP CONSTRAINT IF EXISTS integration_scope_check,
  DROP CONSTRAINT IF EXISTS integration_buyer_org_id_fkey,
  DROP COLUMN IF EXISTS last_verified_at,
  DROP COLUMN IF EXISTS metadata,
  DROP COLUMN IF EXISTS display_name,
  DROP COLUMN IF EXISTS integration_scope,
  DROP COLUMN IF EXISTS buyer_org_id;

ALTER TABLE invoice
  DROP CONSTRAINT IF EXISTS invoice_buyer_org_id_fkey,
  DROP COLUMN IF EXISTS buyer_org_id;

ALTER TABLE quote
  DROP CONSTRAINT IF EXISTS quote_buyer_org_id_fkey,
  DROP COLUMN IF EXISTS buyer_org_id;
