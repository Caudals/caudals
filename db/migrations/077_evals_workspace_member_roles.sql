-- Administrator-only workspace roles with attributed before/after audit details.
-- Forward repair: revoke EXECUTE to disable changes; keep the audit column.
BEGIN;
ALTER TABLE evals.audit_event ADD COLUMN details jsonb;

CREATE FUNCTION evals.list_workspace_members(p_org_id uuid)
RETURNS TABLE (user_id text,email text,role text,created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,evals,public AS $$
  SELECT m.user_id,u.email,m.role,m.created_at FROM evals.membership m
    JOIN public.auth_user u ON u.id=m.user_id
    JOIN evals.workspace w ON w.id=m.org_id AND w.deleted_at IS NULL
    WHERE evals.is_admin() AND p_org_id=evals.org_id() AND m.org_id=p_org_id
    ORDER BY m.role,u.email
$$;
REVOKE ALL ON FUNCTION evals.list_workspace_members(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION evals.list_workspace_members(uuid) TO evals_runtime;

CREATE FUNCTION evals.amend_workspace_member_role(p_user_id text,p_role text,p_previous_role text,p_reason text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,evals AS $$
DECLARE scoped_org uuid := evals.org_id(); previous_role text;
BEGIN
  IF NOT evals.is_admin() OR scoped_org IS NULL THEN RAISE EXCEPTION 'platform_admin_required'; END IF;
  IF p_role IS NULL OR p_role NOT IN ('owner','editor','viewer','operator') OR
     p_reason IS NULL OR length(trim(p_reason)) NOT BETWEEN 3 AND 2000 THEN RAISE EXCEPTION 'INPUT_INVALID'; END IF;
  -- Serialize changes in this workspace so two owners cannot demote one another.
  PERFORM 1 FROM evals.workspace WHERE id=scoped_org AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'workspace_member_not_found'; END IF;
  SELECT role INTO previous_role FROM evals.membership WHERE org_id=scoped_org AND user_id=p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'workspace_member_not_found'; END IF;
  IF previous_role IS DISTINCT FROM p_previous_role THEN RAISE EXCEPTION 'membership_role_conflict'; END IF;
  IF previous_role='owner' AND p_role<>'owner' AND
     (SELECT count(*) FROM evals.membership WHERE org_id=scoped_org AND role='owner')<=1 THEN
    RAISE EXCEPTION 'last_workspace_owner';
  END IF;
  UPDATE evals.membership SET role=p_role WHERE org_id=scoped_org AND user_id=p_user_id;
  INSERT INTO evals.audit_event(org_id,actor_id,action,subject_id,details)
    VALUES(scoped_org,evals.actor_id(),'membership.role_amended',p_user_id,
      jsonb_build_object('previous_role',previous_role,'role',p_role,'reason',trim(p_reason)));
  RETURN p_role;
END $$;
REVOKE ALL ON FUNCTION evals.amend_workspace_member_role(text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION evals.amend_workspace_member_role(text,text,text,text) TO evals_execution_admin;
COMMIT;
