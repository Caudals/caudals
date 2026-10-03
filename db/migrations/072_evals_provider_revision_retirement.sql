-- Retiring a model revision (docs/evals/grading-engine.md, Settings → AI models).
--
-- 033 made provider revisions fully immutable, so "Remove provider" (which
-- retires the provider's model revisions, migration 063 granted
-- UPDATE(retired_at)) always failed with "immutable execution record" and
-- rolled the whole removal back. A revision may now be retired exactly once;
-- every other column stays frozen and rows still cannot be deleted, so past
-- results keep pointing at the exact model they ran on.
BEGIN;

CREATE FUNCTION evals.provider_revision_retire_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.retired_at IS NULL AND NEW.retired_at IS NOT NULL
     AND (to_jsonb(NEW) - 'retired_at') = (to_jsonb(OLD) - 'retired_at') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'immutable execution record';
END $$;

DROP TRIGGER immutable_execution ON evals.provider_revision;
CREATE TRIGGER immutable_execution BEFORE UPDATE OR DELETE ON evals.provider_revision
  FOR EACH ROW EXECUTE FUNCTION evals.provider_revision_retire_only();

COMMIT;
