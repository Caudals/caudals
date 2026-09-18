DO $$ BEGIN RAISE EXCEPTION 'WP-08 recovery policy records must outlive restored snapshots. Destructive rollback is refused; disable Stage B and use forward repair.'; END $$;
