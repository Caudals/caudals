BEGIN;
ALTER TABLE public.product_analytics_event
 ADD COLUMN org_id uuid,
 ADD COLUMN run_id text CHECK(run_id IS NULL OR run_id ~ '^[a-f0-9]{64}$'),
 ADD COLUMN attribution jsonb NOT NULL DEFAULT '{}'::jsonb,
 ADD COLUMN event_key text;
CREATE UNIQUE INDEX product_analytics_event_dedupe ON public.product_analytics_event(event_key) WHERE event_key IS NOT NULL;
CREATE INDEX product_analytics_event_growth ON public.product_analytics_event(occurred_at DESC,event_name) INCLUDE(org_id,run_id);
CREATE INDEX product_analytics_event_workspace ON public.product_analytics_event(org_id,occurred_at) WHERE org_id IS NOT NULL;
ALTER TABLE public.product_analytics_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_analytics_event FORCE ROW LEVEL SECURITY;
CREATE POLICY analytics_append ON public.product_analytics_event FOR INSERT WITH CHECK(true);
CREATE POLICY analytics_operator_read ON public.product_analytics_event FOR SELECT USING(
 EXISTS(SELECT 1 FROM evals.platform_role WHERE user_id=evals.actor_id() AND role IN ('operator','platform_admin'))
);
GRANT INSERT,SELECT ON public.product_analytics_event TO evals_runtime;
GRANT INSERT ON public.product_analytics_event TO evals_worker,evals_document,evals_browser;
ALTER TABLE demo.run ADD COLUMN attribution jsonb NOT NULL DEFAULT '{}'::jsonb;
-- First-touch snapshot survives demo retention and is reserved for L-12's first payment.
ALTER TABLE evals.workspace ADD COLUMN acquisition_attribution jsonb NOT NULL DEFAULT '{}'::jsonb;
CREATE FUNCTION evals.set_acquisition_attribution(workspace_id uuid, touch jsonb) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,evals AS $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM evals.workspace WHERE id=workspace_id AND created_by=evals.actor_id()) THEN RAISE EXCEPTION 'SCOPE_DENIED'; END IF;
 IF jsonb_typeof(touch)<>'object' OR octet_length(touch::text)>4096 THEN RAISE EXCEPTION 'INPUT_INVALID'; END IF;
 UPDATE evals.workspace SET acquisition_attribution=touch WHERE id=workspace_id AND acquisition_attribution='{}'::jsonb;
 END $$;
REVOKE ALL ON FUNCTION evals.set_acquisition_attribution(uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION evals.set_acquisition_attribution(uuid,jsonb) TO evals_runtime;
-- Conflict checks need SELECT visibility under RLS. Keep raw reads operator-only
-- and expose this bounded, insert-only operation to the server roles instead.
CREATE FUNCTION evals.append_analytics_event(event_id text,event_name text,event_source text,event_path text,event_session text,event_metadata jsonb,event_org uuid,event_run text,event_attribution jsonb,dedupe text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,evals AS $$ BEGIN
 IF event_source NOT IN ('client','server') OR jsonb_typeof(event_metadata)<>'object' OR jsonb_typeof(event_attribution)<>'object'
    OR octet_length(event_metadata::text)>4096 OR octet_length(event_attribution::text)>4096 OR length(event_name)>80
    OR (dedupe IS NOT NULL AND dedupe !~ '^[a-f0-9]{64}$') THEN RAISE EXCEPTION 'INPUT_INVALID'; END IF;
 INSERT INTO public.product_analytics_event(id,event_name,event_category,source,path,session_id,metadata,org_id,run_id,attribution,event_key)
 VALUES(event_id,event_name,'product',event_source,event_path,event_session,event_metadata,event_org,event_run,event_attribution,dedupe)
 ON CONFLICT(event_key) WHERE event_key IS NOT NULL DO NOTHING;
 END $$;
REVOKE ALL ON FUNCTION evals.append_analytics_event(text,text,text,text,text,jsonb,uuid,text,jsonb,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION evals.append_analytics_event(text,text,text,text,text,jsonb,uuid,text,jsonb,text) TO evals_runtime,evals_worker,evals_document,evals_browser;
COMMIT;
