DROP POLICY IF EXISTS delta_manifest_operator_scope ON delta_manifest;
DROP POLICY IF EXISTS subscription_operator_scope ON subscription;

DROP TRIGGER IF EXISTS delta_manifest_sync_subscription ON delta_manifest;
DROP TRIGGER IF EXISTS delta_manifest_sync_delivery ON delta_manifest;
DROP FUNCTION IF EXISTS app_private.sync_published_delta_to_subscription();
DROP FUNCTION IF EXISTS app_private.sync_delta_manifest_to_delivery();

DROP TRIGGER IF EXISTS delta_manifest_touch_updated_at ON delta_manifest;
DROP TRIGGER IF EXISTS subscription_touch_updated_at ON subscription;

DROP INDEX IF EXISTS delivery_subscription_idx;
DROP INDEX IF EXISTS delta_manifest_dataset_version_idx;
DROP INDEX IF EXISTS delta_manifest_subscription_state_idx;
DROP INDEX IF EXISTS subscription_dataset_idx;
DROP INDEX IF EXISTS subscription_buyer_state_idx;

DROP TABLE IF EXISTS delta_manifest CASCADE;

ALTER TABLE delivery DROP CONSTRAINT IF EXISTS delivery_subscription_id_fkey;
ALTER TABLE delivery DROP COLUMN IF EXISTS subscription_id;

DROP TABLE IF EXISTS subscription CASCADE;
