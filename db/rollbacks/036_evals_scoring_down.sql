DO $$ BEGIN RAISE EXCEPTION 'WP-06 assessment and adjudication history is immutable. Use forward repair or restore a verified pre-036 backup.'; END $$;
