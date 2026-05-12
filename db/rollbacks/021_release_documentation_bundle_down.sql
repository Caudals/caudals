DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM release_documentation_bundle
    WHERE deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Cannot roll back release documentation bundles while active rows exist';
  END IF;
END;
$$;

DROP TABLE IF EXISTS release_documentation_bundle;
