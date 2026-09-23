-- Keep workspace entitlement limits immutable to the runtime while allowing
-- budgeted workflows to hold a transaction-scoped lock during their decision.
BEGIN;

CREATE FUNCTION evals.lock_workspace_entitlement(p_org_id uuid)
RETURNS SETOF evals.workspace_entitlement
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog,evals
AS $$
BEGIN
  IF p_org_id IS DISTINCT FROM evals.org_id() THEN
    RETURN;
  END IF;

  IF NOT evals.is_admin() AND NOT EXISTS (
    SELECT 1 FROM evals.membership m
    WHERE m.org_id=p_org_id AND m.user_id=evals.actor_id()
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
    SELECT e.*
    FROM evals.workspace_entitlement e
    WHERE e.org_id=p_org_id
    FOR SHARE;
END
$$;

REVOKE ALL ON FUNCTION evals.lock_workspace_entitlement(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION evals.lock_workspace_entitlement(uuid) TO evals_runtime;

COMMIT;
