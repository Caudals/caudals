-- Target dispatch and external-billing history must be retained. Roll back
-- worker code by disabling dispatch and shipping a forward-repair migration.
DO $$ BEGIN RAISE EXCEPTION 'target invocation ledger cannot be dropped'; END $$;
