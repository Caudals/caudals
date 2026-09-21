-- WP-14 records contain attributed expert work, review and payment history.
-- Disable Stage E and forward-repair a compatible image; do not erase evidence.
DO $$ BEGIN RAISE EXCEPTION 'WP-14 expert-work records require forward repair; destructive rollback refused'; END $$;
