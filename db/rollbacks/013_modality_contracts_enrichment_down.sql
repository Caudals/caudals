-- Roll back M2 modality contracts and enrichment manifests.

DROP POLICY IF EXISTS enrichment_manifest_operator_scope ON enrichment_manifest;
ALTER TABLE IF EXISTS enrichment_manifest DISABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS enrichment_manifest_touch_updated_at ON enrichment_manifest;
DROP TABLE IF EXISTS enrichment_manifest;

DROP POLICY IF EXISTS modality_contract_operator_scope ON modality_contract;
ALTER TABLE IF EXISTS modality_contract DISABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS modality_contract_touch_updated_at ON modality_contract;
DROP TABLE IF EXISTS modality_contract;
