DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM modality_contract
    WHERE modality IN ('document','timeseries')
  ) THEN
    RAISE EXCEPTION 'Cannot roll back M3 modality contracts while document/timeseries rows exist';
  END IF;
END;
$$;

ALTER TABLE modality_contract DROP CONSTRAINT IF EXISTS modality_contract_modality_check;
ALTER TABLE modality_contract
  ADD CONSTRAINT modality_contract_modality_check
  CHECK (modality IN ('video','audio','geospatial'));
