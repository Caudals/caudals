-- One transaction, so the guard still holds when psql runs without
-- ON_ERROR_STOP.

BEGIN;

DO $$
DECLARE
  blocking_rows bigint := 0;
BEGIN
  -- Dynamic SQL: a static reference would fail to plan once the table is gone.
  IF to_regclass('public.modality_contract') IS NOT NULL THEN
    EXECUTE $sql$
      SELECT count(*)
      FROM modality_contract
      WHERE modality IN ('tabular','text','image')
    $sql$
      INTO blocking_rows;
  END IF;

  IF blocking_rows > 0 THEN
    RAISE EXCEPTION 'Cannot roll back all-modality contracts while tabular/text/image rows exist';
  END IF;
END;
$$;

ALTER TABLE modality_contract DROP CONSTRAINT IF EXISTS modality_contract_modality_check;
ALTER TABLE modality_contract
  ADD CONSTRAINT modality_contract_modality_check
  CHECK (modality IN ('video','audio','geospatial','document','timeseries'));

COMMIT;
