-- Preserve the saved platform preference; repair forward instead.
DO $$ BEGIN
  RAISE EXCEPTION 'Forward repair required: do not drop demo.model_setting';
END $$;
