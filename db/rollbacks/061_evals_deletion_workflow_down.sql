-- Deletion requests, tombstones and notification delivery records are
-- compliance evidence. Disable the features and ship a forward repair.
DO $$ BEGIN
  RAISE EXCEPTION 'Refusing destructive rollback of deletion and notification history';
END $$;
