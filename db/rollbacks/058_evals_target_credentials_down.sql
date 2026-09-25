-- Credential records, versions and revocation evidence are security history.
-- Disable credential entry in the app and ship a reviewed forward repair.
DO $$ BEGIN
  RAISE EXCEPTION 'Refusing destructive rollback of target credential history';
END $$;
