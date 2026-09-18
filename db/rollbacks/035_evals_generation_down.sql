DO $$ BEGIN RAISE EXCEPTION 'WP-05 generation provenance is immutable. Use forward repair or restore a verified pre-035 backup; destructive rollback is refused.'; END $$;
