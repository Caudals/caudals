-- Stage C records include immutable recipes, access policy and regression
-- provenance. Destructive rollback is intentionally refused. Disable browser
-- dispatch/customer onboarding and use a reviewed forward repair or restore a
-- verified pre-039 backup in isolation.
DO $$ BEGIN
 RAISE EXCEPTION '039 rollback refused: preserve Stage C evidence and entitlements';
END $$;
