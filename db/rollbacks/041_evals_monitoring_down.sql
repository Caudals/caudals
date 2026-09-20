-- WP-13 schedules, deliveries, alerts and API-token audit history must be retained.
-- Disable schedule/webhook dispatch and forward-repair a compatible image.
DO $$ BEGIN RAISE EXCEPTION 'WP-13 monitoring records require forward repair; destructive rollback refused'; END $$;
