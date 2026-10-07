-- Keep role-change audit details and memberships intact. To pause this feature,
-- revert the app image and revoke only the mutation function's execution grant:
-- REVOKE EXECUTE ON FUNCTION evals.amend_workspace_member_role(text,text,text,text)
--   FROM evals_execution_admin;
-- Forward repair restores that grant after validation. Never drop audit details.
DO $$ BEGIN
  RAISE EXCEPTION 'Workspace member roles require forward repair; preserve membership and audit history.';
END $$;
