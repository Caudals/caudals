-- M3 document and time-series modality coverage.
-- Extends modality contracts beyond the M2 video/audio/geospatial set.

ALTER TABLE modality_contract DROP CONSTRAINT IF EXISTS modality_contract_modality_check;
ALTER TABLE modality_contract
  ADD CONSTRAINT modality_contract_modality_check
  CHECK (modality IN ('video','audio','geospatial','document','timeseries'));
