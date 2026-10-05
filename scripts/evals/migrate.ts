/** Explicit foundation migrator. Never runs automatically in the web process. */
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Pool } from 'pg';
import { getSecretEnvValue } from '../../lib/env/secrets';
/** Explicit, reviewed order. Add new files at the end. */
const migrations=[
 '031_evals_identity.sql',
 '032_evals_evidence.sql',
 '033_evals_execution.sql',
 '034_evals_connections.sql',
 '035_evals_generation.sql',
 '036_evals_scoring.sql',
 '037_evals_reports.sql',
 '038_evals_operations.sql',
 '039_evals_stage_c.sql',
 '040_evals_private_runner.sql',
 '041_evals_monitoring.sql',
 '042_evals_monitor_schedule_reasons.sql',
 '043_evals_expert_work.sql',
 '044_evals_improvement_releases.sql',
 '045_evals_entitlement_lock.sql',
 '046_evals_target_usage.sql',
 '047_evals_website_recipe_source_grant.sql',
 '048_evals_browser_target_usage_grant.sql',
 '049_evals_browser_dispatch_timestamp_grant.sql',
 '050_evals_automatic_generation.sql',
 '051_evals_source_ingestion.sql',
 '052_evals_website_context.sql',
 '053_evals_generation_runtime_catalog_grants.sql',
 '054_evals_generation_runtime_context_question_grant.sql',
 '055_evals_generation_batch_step_versions.sql',
 '056_evals_generation_batch_retry_across_jobs.sql',
 '057_evals_target_turn_usage.sql',
 '058_evals_target_credentials.sql',
 '059_evals_rubric_judge.sql',
 '060_evals_platform_admin.sql',
 '061_evals_deletion_workflow.sql',
 '062_evals_browser_evidence.sql',
 '063_evals_engine_settings_and_lifecycle.sql',
 '064_evals_report_docx_and_catalog_grants.sql',
 '065_evals_notification_engine.sql',
 '066_evals_export_locale.sql',
 '067_evals_runtime_provider_tpm_grant.sql',
 '068_evals_browser_connection_check_grant.sql',
 '069_evals_generation_depth_and_question_context.sql',
 '070_evals_web_research.sql',
 '071_evals_web_search_engines.sql',
 '072_evals_provider_revision_retirement.sql',
 '073_evals_run_queue.sql',
 '074_evals_browser_step_retry.sql',
 '075_demo_and_self_serve.sql',
];
async function main(){
 const url=getSecretEnvValue('EVALS_MIGRATION_DATABASE_URL');if(!url)throw new Error('Set EVALS_MIGRATION_DATABASE_URL(_FILE) to the migration-owner connection.');
 const pool=new Pool({connectionString:url,max:1});const client=await pool.connect();
 try{
  await client.query("SELECT pg_advisory_lock(hashtext('caudals-evals-migrations'))");
  await client.query('CREATE TABLE IF NOT EXISTS public.evals_migration_history(name text PRIMARY KEY,sha256 text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())');
  for(const name of migrations){
   const sql=await readFile(new URL(`../../db/migrations/${name}`,import.meta.url),'utf8');const hash=createHash('sha256').update(sql).digest('hex');
   const {rows}=await client.query('SELECT sha256 FROM public.evals_migration_history WHERE name=$1',[name]);
   if(rows[0]){if(rows[0].sha256!==hash)throw new Error(`Migration checksum mismatch: ${name}`);continue;}
   // History commits atomically with SQL; files carry their own BEGIN/COMMIT.
   const withoutBoundary=sql.replace(/^BEGIN;\s*$/m,'').replace(/^COMMIT;\s*$/m,'');
   await client.query('BEGIN');try{await client.query(withoutBoundary);await client.query('INSERT INTO public.evals_migration_history(name,sha256) VALUES($1,$2)',[name,hash]);await client.query('COMMIT');}catch(error){await client.query('ROLLBACK');throw error;}
   console.log(`Applied ${name}`);
  }
 }finally{await client.query("SELECT pg_advisory_unlock(hashtext('caudals-evals-migrations'))");client.release();await pool.end();}
}
main().catch(()=>{console.error('Evaluation migration failed. Inspect schema/history privately; no credentials or SQL parameters logged.');process.exitCode=1;});
