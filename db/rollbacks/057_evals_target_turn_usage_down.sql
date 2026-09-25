-- Invocation-call records are immutable billing and recovery evidence. Keep
-- them and use a reviewed forward migration to repair an incompatible release.
DO $$ BEGIN
  RAISE EXCEPTION 'Refusing destructive rollback of target invocation call evidence';
END $$;
