-- Operator Platform section (spec §5.1, §13.3, §14.1, §14.3).
--
-- Registry and budget changes stay on the separately provisioned
-- evals_execution_admin login; the web runtime still cannot change funded
-- limits. Every amendment is an immutable, attributed record with a reason.
BEGIN;

CREATE TABLE evals.budget_amendment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES evals.workspace(id),
  target_kind text NOT NULL CHECK (target_kind IN ('workspace_budget','run_budget','evaluation_cap','entitlement','provider_account')),
  target_id uuid NOT NULL,
  previous jsonb NOT NULL,
  next jsonb NOT NULL,
  reason text NOT NULL CHECK (length(reason) BETWEEN 3 AND 2000),
  actor_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id,id)
);
CREATE INDEX budget_amendment_recent ON evals.budget_amendment(org_id,created_at DESC);
ALTER TABLE evals.budget_amendment ENABLE ROW LEVEL SECURITY;
ALTER TABLE evals.budget_amendment FORCE ROW LEVEL SECURITY;
CREATE POLICY budget_amendment_tenant ON evals.budget_amendment
  USING (org_id=nullif(current_setting('evals.org_id',true),'')::uuid)
  WITH CHECK (org_id=nullif(current_setting('evals.org_id',true),'')::uuid AND actor_id=evals.actor_id());
CREATE FUNCTION evals.budget_amendment_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'immutable budget amendment' USING ERRCODE='55000'; END $$;
CREATE TRIGGER budget_amendment_immutable BEFORE UPDATE OR DELETE ON evals.budget_amendment
  FOR EACH ROW EXECUTE FUNCTION evals.budget_amendment_immutable();
REVOKE ALL ON evals.budget_amendment FROM PUBLIC;
GRANT SELECT ON evals.budget_amendment TO evals_runtime;
GRANT SELECT,INSERT ON evals.budget_amendment TO evals_execution_admin;

-- Funded limits: only the configuration login may change them.
GRANT SELECT ON evals.workspace_entitlement TO evals_execution_admin;
GRANT UPDATE (max_active_runs,monthly_spend_limit,allowed_connection_types,can_schedule,can_export,review_allowance,version,updated_by,updated_at)
  ON evals.workspace_entitlement TO evals_execution_admin;
GRANT SELECT (id,org_id,title,commercial_cap,currency) ON evals.evaluation TO evals_execution_admin;
GRANT UPDATE (commercial_cap,updated_at) ON evals.evaluation TO evals_execution_admin;

-- Platform administrators can list who holds platform roles; nobody else can.
CREATE FUNCTION evals.list_platform_roles()
RETURNS TABLE (user_id text, email text, name text, role text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,evals,public AS $$
  SELECT r.user_id, u.email, u.name, r.role
  FROM evals.platform_role r JOIN public.auth_user u ON u.id=r.user_id
  WHERE evals.is_admin()
  ORDER BY r.role, u.email
$$;
REVOKE ALL ON FUNCTION evals.list_platform_roles() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION evals.list_platform_roles() TO evals_runtime;

CREATE FUNCTION evals.list_workspace_members()
RETURNS TABLE (org_id uuid, workspace text, user_id text, email text, role text, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,evals,public AS $$
  SELECT m.org_id, w.name, m.user_id, u.email, m.role, m.created_at
  FROM evals.membership m JOIN evals.workspace w ON w.id=m.org_id JOIN public.auth_user u ON u.id=m.user_id
  WHERE evals.is_admin()
  ORDER BY w.name, m.role, u.email
  LIMIT 1000
$$;
REVOKE ALL ON FUNCTION evals.list_workspace_members() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION evals.list_workspace_members() TO evals_runtime;

COMMIT;
