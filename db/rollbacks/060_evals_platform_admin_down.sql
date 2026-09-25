-- Budget amendments are attributed financial-control history. Revoke the
-- admin grants or disable the Platform screens instead; never delete records.
DO $$ BEGIN
  RAISE EXCEPTION 'Refusing destructive rollback of budget amendment history';
END $$;
