-- Remove mandatory operator MFA/passkey requirements.
-- TOTP and passkeys remain available as optional Better Auth hardening.

ALTER TABLE "operator"
  ALTER COLUMN mfa_required SET DEFAULT false,
  ALTER COLUMN webauthn_required SET DEFAULT false;

WITH candidates AS (
  SELECT
    id,
    org_id,
    mfa_required AS previous_mfa_required,
    webauthn_required AS previous_webauthn_required
  FROM "operator"
  WHERE deleted_at IS NULL
    AND (
      mfa_required IS DISTINCT FROM false
      OR webauthn_required IS DISTINCT FROM false
    )
),
updated AS (
  UPDATE "operator" o
  SET
    mfa_required = false,
    webauthn_required = false,
    updated_at = now()
  FROM candidates c
  WHERE o.id = c.id
  RETURNING
    o.id,
    o.org_id,
    c.previous_mfa_required,
    c.previous_webauthn_required
),
actor AS (
  SELECT id
  FROM "operator"
  WHERE deleted_at IS NULL
    AND state = 'active'
    AND role = 'admin'
  ORDER BY
    CASE WHEN email::text ILIKE '%@caudals.local' THEN 1 ELSE 0 END,
    created_at
  LIMIT 1
)
INSERT INTO audit_event (
  id,
  org_id,
  actor_id,
  action,
  target_type,
  target_id,
  metadata
)
SELECT
  'ae_' || upper(replace(gen_random_uuid()::text, '-', '')),
  updated.org_id,
  (SELECT id FROM actor),
  'operator_security.optional_factors',
  'operator',
  updated.id,
  jsonb_build_object(
    'source', '024_remove_operator_mfa_requirement',
    'previous_mfa_required', updated.previous_mfa_required,
    'mfa_required', false,
    'previous_webauthn_required', updated.previous_webauthn_required,
    'webauthn_required', false
  )
FROM updated;
