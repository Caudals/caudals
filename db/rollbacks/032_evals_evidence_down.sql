-- Deliberately refuses to destroy evidence. Restore the pre-032 backup in an
-- isolated database, or forward-repair after exporting and reconciling evidence.
DO $$ BEGIN RAISE EXCEPTION '032 contains immutable evidence; use documented backup restore / forward repair'; END $$;
