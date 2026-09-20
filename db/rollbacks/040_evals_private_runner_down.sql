-- WP-12 records bind signed customer-runner evidence to immutable observations.
-- Do not drop these tables as a code rollback. Disable claims/uploads, retain
-- submissions, and forward-repair a compatible image after preserving backups.
DO $$ BEGIN RAISE EXCEPTION 'WP-12 private-runner records require forward repair; destructive rollback refused'; END $$;
