-- Blueprint §18 all-modality coverage.
-- Extends modality contracts from later-phase edge modalities to all eight first-class dataset types.

ALTER TABLE modality_contract DROP CONSTRAINT IF EXISTS modality_contract_modality_check;
ALTER TABLE modality_contract
  ADD CONSTRAINT modality_contract_modality_check
  CHECK (
    modality IN (
      'tabular',
      'text',
      'image',
      'video',
      'audio',
      'geospatial',
      'document',
      'timeseries'
    )
  );
