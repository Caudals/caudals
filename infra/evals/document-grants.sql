-- Provision evals_document as LOGIN NOSUPERUSER NOBYPASSRLS with no inherited
-- runtime/worker/admin role. Reapply after migrations 031-052.
GRANT USAGE ON SCHEMA evals TO evals_document;
GRANT EXECUTE ON FUNCTION evals.org_id(),evals.actor_id() TO evals_document;
GRANT SELECT ON evals.export_job,evals.report_revision,evals.report TO evals_document;
GRANT UPDATE(status,artifact_id,reason_code,updated_at) ON evals.export_job TO evals_document;
GRANT SELECT,INSERT ON evals.artifact,evals.report_artifact,evals.notification TO evals_document;

-- Customer source extraction runs only in this resource-limited document worker.
GRANT SELECT ON evals.source,evals.source_upload,evals.source_ingestion_job,evals.website_source_job TO evals_document;
GRANT INSERT ON evals.source_upload,evals.source_ingestion_job TO evals_document;
GRANT SELECT,INSERT ON evals.source_revision,evals.source_chunk TO evals_document;
GRANT SELECT ON evals.artifact TO evals_document;
GRANT UPDATE(state,object_key,expires_at) ON evals.artifact TO evals_document;
GRANT UPDATE(status,attempt_count,reason_code,source_revision_id,sealed_object_key,updated_at)
  ON evals.source_ingestion_job TO evals_document;

-- Website captures finish through this bounded document and object-store service.
GRANT UPDATE(status,artifact_attempt_count,artifact_id,captured_text,source_revision_id,reason_code,updated_at) ON evals.website_source_job TO evals_document;

-- Credit ledger (migration 084): read this workspace's rows under RLS and move
-- credits only through the billing functions; no direct writes.
DO $$ BEGIN
 IF to_regnamespace('billing') IS NOT NULL THEN
  GRANT USAGE ON SCHEMA billing TO evals_document;
  GRANT SELECT ON billing.credit_account,billing.credit_lot,billing.credit_hold,billing.ledger_entry TO evals_document;
  GRANT EXECUTE ON FUNCTION billing.hold(uuid,text,bigint,timestamptz,uuid,uuid,uuid,uuid,text),
   billing.capture(uuid,text,bigint,text,jsonb),billing.release(uuid,text,text,text),
   billing.charge_action(uuid,text,text,bigint,numeric,uuid,uuid,uuid,boolean,text),
   billing.verify_account(uuid) TO evals_document;
 END IF;
END $$;

-- Engine hooks (migration 089): pricing context and shadow-mode recording on
-- the run path; reads of the shadow ledger stay scoped by RLS.
DO $$ BEGIN
 IF to_regprocedure('billing.engine_pricing(uuid,uuid,integer,uuid,uuid,uuid,uuid,uuid)') IS NOT NULL THEN
  GRANT SELECT ON billing.shadow_entry TO evals_document;
  GRANT EXECUTE ON FUNCTION billing.engine_pricing(uuid,uuid,integer,uuid,uuid,uuid,uuid,uuid),
   billing.action_pricing(uuid,text,uuid,uuid),
   billing.shadow_hold(uuid,text,bigint,uuid,uuid,uuid,uuid,uuid,jsonb),
   billing.shadow_capture(uuid,text,bigint,jsonb,jsonb),billing.shadow_release(uuid,text,text),
   billing.shadow_charge(uuid,text,text,text,bigint,numeric,uuid,uuid,uuid,jsonb) TO evals_document;
 END IF;
END $$;

-- Plans v2 (migration 093): the per-workspace credit enforcement override,
-- read under RLS on the credit path.
DO $$ BEGIN
 IF to_regclass('billing.workspace_override') IS NOT NULL THEN
  GRANT SELECT ON billing.workspace_override TO evals_document;
 END IF;
END $$;
