DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM compliance_control_scope
    WHERE deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Cannot roll back compliance control scopes while active rows exist';
  END IF;
END;
$$;

DROP TABLE IF EXISTS compliance_control_scope;
