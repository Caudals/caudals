ALTER TABLE "operator"
  ALTER COLUMN mfa_required SET DEFAULT true,
  ALTER COLUMN webauthn_required SET DEFAULT false;
