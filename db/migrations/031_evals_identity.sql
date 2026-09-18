-- Additive evaluation identity. Apply as migration owner, never as web runtime.
BEGIN;
CREATE SCHEMA evals;
REVOKE ALL ON SCHEMA evals FROM PUBLIC;
DO $$ BEGIN
 IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='evals_runtime') THEN
   CREATE ROLE evals_runtime NOLOGIN NOSUPERUSER NOBYPASSRLS;
 END IF;
END $$;
GRANT USAGE ON SCHEMA evals TO evals_runtime;
CREATE FUNCTION evals.actor_id() RETURNS text LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('evals.actor_id',true),'') $$;
CREATE FUNCTION evals.org_id() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('evals.org_id',true),'')::uuid $$;
CREATE TABLE evals.platform_role (
 user_id text PRIMARY KEY REFERENCES public.auth_user(id),
 role text NOT NULL CHECK(role IN ('platform_admin','operator')),
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE evals.platform_role ENABLE ROW LEVEL SECURITY;
ALTER TABLE evals.platform_role FORCE ROW LEVEL SECURITY;
CREATE POLICY self_role ON evals.platform_role FOR SELECT USING(user_id=evals.actor_id());
CREATE FUNCTION evals.is_admin() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT EXISTS(SELECT 1 FROM evals.platform_role WHERE user_id=evals.actor_id() AND role='platform_admin') $$;
CREATE TABLE evals.workspace (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL CHECK(length(name) BETWEEN 1 AND 160),
 created_by text NOT NULL REFERENCES public.auth_user(id), created_at timestamptz NOT NULL DEFAULT now(),
 data_policy text NOT NULL DEFAULT 'local_only' CHECK(data_policy IN ('local_only','approved_providers'))
);
CREATE TABLE evals.membership (
 org_id uuid NOT NULL REFERENCES evals.workspace(id), user_id text NOT NULL REFERENCES public.auth_user(id),
 role text NOT NULL CHECK(role IN ('owner','editor','viewer','operator')),
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(org_id,user_id)
);
ALTER TABLE evals.membership ENABLE ROW LEVEL SECURITY;
ALTER TABLE evals.membership FORCE ROW LEVEL SECURITY;
CREATE POLICY own_memberships ON evals.membership FOR SELECT USING(user_id=evals.actor_id() OR evals.is_admin());
ALTER TABLE evals.workspace ENABLE ROW LEVEL SECURITY;
ALTER TABLE evals.workspace FORCE ROW LEVEL SECURITY;
CREATE POLICY visible_workspaces ON evals.workspace FOR SELECT USING(evals.is_admin() OR EXISTS(SELECT 1 FROM evals.membership m WHERE m.org_id=id AND m.user_id=evals.actor_id()));
CREATE TABLE evals.invitation (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL REFERENCES evals.workspace(id),
 email text NOT NULL CHECK(length(email)<=254), role text NOT NULL CHECK(role IN ('owner','editor','viewer')),
 token_hash text NOT NULL UNIQUE CHECK(token_hash ~ '^[a-f0-9]{64}$'),
 expires_at timestamptz NOT NULL, revoked_at timestamptz, accepted_at timestamptz,
 created_by text NOT NULL REFERENCES public.auth_user(id), created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE evals.invitation ENABLE ROW LEVEL SECURITY;
ALTER TABLE evals.invitation FORCE ROW LEVEL SECURITY;
CREATE POLICY manage_invites ON evals.invitation USING(org_id=evals.org_id() AND (evals.is_admin() OR EXISTS(SELECT 1 FROM evals.membership m WHERE m.org_id=invitation.org_id AND m.user_id=evals.actor_id() AND m.role IN ('owner','operator'))));
CREATE TABLE evals.audit_event (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid REFERENCES evals.workspace(id),
 actor_id text NOT NULL, action text NOT NULL, subject_id text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE evals.audit_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE evals.audit_event FORCE ROW LEVEL SECURITY;
CREATE POLICY audit_scope ON evals.audit_event USING(org_id=evals.org_id() AND (evals.is_admin() OR EXISTS(SELECT 1 FROM evals.membership m WHERE m.org_id=audit_event.org_id AND m.user_id=evals.actor_id() AND m.role IN ('owner','operator'))));
CREATE POLICY audit_insert ON evals.audit_event FOR INSERT WITH CHECK(actor_id=evals.actor_id() AND org_id=evals.org_id());
CREATE TABLE evals.idempotency (
 actor_id text NOT NULL, route text NOT NULL, key text NOT NULL CHECK(length(key) BETWEEN 8 AND 160),
 request_hash text NOT NULL, response jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(actor_id,route,key)
);
ALTER TABLE evals.idempotency ENABLE ROW LEVEL SECURITY;
ALTER TABLE evals.idempotency FORCE ROW LEVEL SECURITY;
CREATE POLICY actor_idempotency ON evals.idempotency USING(actor_id=evals.actor_id());
-- Narrow privileged identity operations; actor always comes from verified server session.
CREATE FUNCTION evals.create_workspace(workspace_name text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,evals AS $$
DECLARE result uuid; actor text := evals.actor_id(); BEGIN
 IF NOT EXISTS(SELECT 1 FROM evals.platform_role WHERE user_id=actor) THEN RAISE EXCEPTION 'SCOPE_DENIED'; END IF;
 INSERT INTO evals.workspace(name,created_by) VALUES(workspace_name,actor) RETURNING id INTO result;
 INSERT INTO evals.membership(org_id,user_id,role) VALUES(result,actor,'operator');
 INSERT INTO evals.audit_event(org_id,actor_id,action,subject_id) VALUES(result,actor,'workspace.created',result::text);
 RETURN result;
END $$;
CREATE FUNCTION evals.accept_invitation(digest text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,evals AS $$
DECLARE invite_row evals.invitation; actor text:=evals.actor_id(); recipient text; BEGIN
 SELECT lower(email) INTO recipient FROM public.auth_user WHERE id=actor AND "emailVerified"=true;
 SELECT * INTO invite_row FROM evals.invitation WHERE token_hash=digest FOR UPDATE;
 IF invite_row.id IS NULL OR recipient IS NULL OR lower(invite_row.email)<>recipient OR invite_row.revoked_at IS NOT NULL OR invite_row.accepted_at IS NOT NULL OR invite_row.expires_at<=now() THEN RAISE EXCEPTION 'SCOPE_DENIED'; END IF;
 INSERT INTO evals.membership(org_id,user_id,role) VALUES(invite_row.org_id,actor,invite_row.role) ON CONFLICT DO NOTHING;
 UPDATE evals.invitation SET accepted_at=now() WHERE id=invite_row.id;
 INSERT INTO evals.audit_event(org_id,actor_id,action,subject_id) VALUES(invite_row.org_id,actor,'invitation.accepted',invite_row.id::text);
 RETURN invite_row.org_id;
END $$;
-- Enrollment requires possession of a live one-time invitation. Existing accounts
-- must authenticate instead; no password replacement through invitation links.
CREATE FUNCTION evals.enrollment_allowed(digest text) RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,evals AS $$
 SELECT EXISTS(SELECT 1 FROM evals.invitation i WHERE token_hash=digest AND revoked_at IS NULL AND accepted_at IS NULL AND expires_at>now() AND NOT EXISTS(SELECT 1 FROM public.auth_user u WHERE lower(u.email)=lower(i.email)))
$$;
CREATE FUNCTION evals.enroll_invitation(digest text, display_name text, password_hash text, user_id text, account_id text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,evals AS $$
DECLARE invite_row evals.invitation; BEGIN
 SELECT * INTO invite_row FROM evals.invitation WHERE token_hash=digest FOR UPDATE;
 IF invite_row.id IS NULL OR invite_row.revoked_at IS NOT NULL OR invite_row.accepted_at IS NOT NULL OR invite_row.expires_at<=now() OR EXISTS(SELECT 1 FROM public.auth_user WHERE lower(email)=lower(invite_row.email)) THEN RAISE EXCEPTION 'SCOPE_DENIED'; END IF;
 IF length(display_name) NOT BETWEEN 1 AND 120 OR length(password_hash) NOT BETWEEN 64 AND 256 THEN RAISE EXCEPTION 'INPUT_INVALID'; END IF;
 INSERT INTO public.auth_user(id,name,email,"emailVerified","createdAt","updatedAt") VALUES(user_id,display_name,lower(invite_row.email),true,now(),now());
 INSERT INTO public.auth_account(id,"accountId","providerId","userId",password,"createdAt","updatedAt") VALUES(account_id,user_id,'credential',user_id,password_hash,now(),now());
 INSERT INTO evals.membership(org_id,user_id,role) VALUES(invite_row.org_id,user_id,invite_row.role);
 UPDATE evals.invitation SET accepted_at=now() WHERE id=invite_row.id;
 INSERT INTO evals.audit_event(org_id,actor_id,action,subject_id) VALUES(invite_row.org_id,user_id,'invitation.enrolled',invite_row.id::text);
 RETURN invite_row.org_id;
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA evals FROM PUBLIC;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA evals TO evals_runtime;
GRANT SELECT ON evals.platform_role,evals.workspace,evals.membership TO evals_runtime;
GRANT SELECT,INSERT,UPDATE ON evals.invitation TO evals_runtime;
GRANT SELECT,INSERT ON evals.audit_event,evals.idempotency TO evals_runtime;
CREATE INDEX ON evals.membership(user_id,org_id);
CREATE INDEX ON evals.invitation(org_id,created_at,id);
CREATE INDEX ON evals.audit_event(org_id,created_at,id);
COMMIT;
