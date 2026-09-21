-- Schedule reason history is customer-visible audit evidence. Retain the column
-- and forward-repair a compatible image rather than deleting recorded reasons.
DO $$ BEGIN RAISE EXCEPTION 'monitor schedule reason history requires forward repair; destructive rollback refused'; END $$;
