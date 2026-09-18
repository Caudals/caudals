DO $$ BEGIN RAISE EXCEPTION 'WP-07 published report and share audit history is immutable. Withdraw/revoke and use forward repair; destructive rollback is refused.'; END $$;
