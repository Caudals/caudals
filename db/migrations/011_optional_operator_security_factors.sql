-- Make operator MFA/passkey enrollment optional.
-- Password-only Better Auth login remains valid for Phase 1 operators.

ALTER TABLE "operator"
  ALTER COLUMN mfa_required SET DEFAULT false,
  ALTER COLUMN webauthn_required SET DEFAULT false;

UPDATE "operator"
SET
  mfa_required = false,
  webauthn_required = false,
  updated_at = now()
WHERE deleted_at IS NULL
  AND (mfa_required IS DISTINCT FROM false OR webauthn_required IS DISTINCT FROM false);
