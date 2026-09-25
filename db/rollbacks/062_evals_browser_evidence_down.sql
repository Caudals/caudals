-- Browser captures expire on their own after seven days. Disable capture in
-- the browser worker and ship a forward repair rather than dropping evidence.
DO $$ BEGIN
  RAISE EXCEPTION 'Refusing destructive rollback of browser evidence records';
END $$;
