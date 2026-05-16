-- Restore operator factor flags changed by
-- 024_remove_operator_mfa_requirement.sql.

ALTER TABLE "operator"
  ALTER COLUMN mfa_required SET DEFAULT true,
  ALTER COLUMN webauthn_required SET DEFAULT false;

WITH changed_by_migration AS (
  SELECT DISTINCT
    target_id AS operator_id,
    COALESCE((metadata ->> 'previous_mfa_required')::boolean, false) AS previous_mfa_required,
    COALESCE((metadata ->> 'previous_webauthn_required')::boolean, false) AS previous_webauthn_required
  FROM audit_event
  WHERE action = 'operator_security.optional_factors'
    AND target_type = 'operator'
    AND metadata ->> 'source' = '024_remove_operator_mfa_requirement'
)
UPDATE "operator" o
SET
  mfa_required = changed_by_migration.previous_mfa_required,
  webauthn_required = changed_by_migration.previous_webauthn_required,
  updated_at = now()
FROM changed_by_migration
WHERE o.id = changed_by_migration.operator_id
  AND o.deleted_at IS NULL;
