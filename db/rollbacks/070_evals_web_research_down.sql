-- Drops web research. Discovery suggestions are disposable; captured sources stay.
BEGIN;
DROP TABLE evals.web_discovery_job;
ALTER TABLE evals.generation_provider_route DROP COLUMN web_research;
ALTER TABLE evals.platform_model_route DROP COLUMN web_research;
COMMIT;
