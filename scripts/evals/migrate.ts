/** Explicit foundation migrator. Never runs automatically in the web process. */
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Pool } from 'pg';
import { getSecretEnvValue } from '../../lib/env/secrets';
async function main(){
 const url=getSecretEnvValue('EVALS_MIGRATION_DATABASE_URL');if(!url)throw new Error('Set EVALS_MIGRATION_DATABASE_URL(_FILE) to the migration-owner connection.');
 const pool=new Pool({connectionString:url,max:1});const client=await pool.connect();
 try{
  await client.query("SELECT pg_advisory_lock(hashtext('caudals-evals-migrations'))");
  await client.query('CREATE TABLE IF NOT EXISTS public.evals_migration_history(name text PRIMARY KEY,sha256 text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())');
  for(const name of ['031_evals_identity.sql','032_evals_evidence.sql','033_evals_execution.sql','034_evals_connections.sql','035_evals_generation.sql','036_evals_scoring.sql','037_evals_reports.sql','038_evals_operations.sql','039_evals_stage_c.sql','040_evals_private_runner.sql','041_evals_monitoring.sql','042_evals_monitor_schedule_reasons.sql','043_evals_expert_work.sql','044_evals_improvement_releases.sql','045_evals_entitlement_lock.sql','046_evals_target_usage.sql']){
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
