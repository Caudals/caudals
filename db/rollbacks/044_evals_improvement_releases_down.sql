-- WP-15 releases and intervention validations are evidence records.
-- Disable Stage E and forward-repair a compatible image; do not erase them.
DO $$ BEGIN RAISE EXCEPTION 'WP-15 improvement records require forward repair; destructive rollback refused'; END $$;
