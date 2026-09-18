-- Deliberately non-destructive: reservations, unknown liabilities and results must survive rollback.
DO $$ BEGIN RAISE EXCEPTION '033 rollback requires forward repair: stop dispatch, preserve execution/secret/cost records, restore a verified backup only after explicit data-loss approval'; END $$;
