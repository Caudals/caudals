import { Pool } from "pg";
import { getSecretEnvValue } from "../../lib/env/secrets";

async function main(){
 const url=getSecretEnvValue("EVALS_MIGRATION_DATABASE_URL");
 if(!url)throw new Error("EVALS_MIGRATION_DATABASE_URL(_FILE) is required for the read-only release inspection.");
 if(process.env.EVALS_DISPATCH_ENABLED==="true"&&!process.argv.includes("--dispatch-reviewed"))throw new Error("Dispatch enablement requires the explicit reviewed release flag.");
 const pool=new Pool({connectionString:url,max:1});
 try{
 const roles=await pool.query(`SELECT rolname,rolsuper,rolbypassrls FROM pg_roles WHERE rolname IN ('evals_runtime','evals_worker','evals_document','evals_execution_admin','evals_scheduler','evals_browser') ORDER BY rolname`);
 const scheduler=await pool.query("SELECT pg_has_role('evals_scheduler','evals_runtime','USAGE') AS inherits_runtime");
 const migrations=await pool.query("SELECT name FROM public.evals_migration_history WHERE name LIKE '%_evals_%' ORDER BY name");
 const tables=await pool.query("SELECT count(*)::int AS count FROM pg_tables WHERE schemaname='evals'");
 if(roles.rows.length<6||roles.rows.some(role=>role.rolsuper||role.rolbypassrls)||!scheduler.rows[0]?.inherits_runtime)throw new Error("Evaluation service roles are missing, privileged, or the scheduler lacks tenant runtime grants.");
 const needed=["034_evals_connections.sql","035_evals_generation.sql","036_evals_scoring.sql","037_evals_reports.sql","038_evals_operations.sql","039_evals_stage_c.sql","046_evals_target_usage.sql","047_evals_website_recipe_source_grant.sql","048_evals_browser_target_usage_grant.sql"];
 if(needed.some(name=>!migrations.rows.some(row=>row.name===name)))throw new Error("Stage B migrations are incomplete.");
 const usage=await pool.query(`SELECT
   has_table_privilege('evals_browser','evals.target_invocation_ledger','SELECT') AS can_select,
   has_table_privilege('evals_browser','evals.target_invocation_ledger','INSERT') AS can_insert,
   bool_and(has_column_privilege('evals_browser','evals.target_invocation_ledger',field,'UPDATE')) AS can_update
   FROM unnest(ARRAY['state','reported_input_tokens','reported_output_tokens',
    'reported_cost_amount','reported_cost_currency','reported_cost_provenance',
    'reason_code','dispatched_at','finished_at']) AS field`);
 if(!usage.rows[0]?.can_select||!usage.rows[0]?.can_insert||!usage.rows[0]?.can_update)
  throw new Error("The browser worker lacks target invocation ledger grants.");
 console.log(JSON.stringify({status:"ready",workersPaused:process.env.EVALS_DISPATCH_ENABLED!=="true",roles:roles.rows.map(role=>role.rolname),tables:tables.rows[0].count}));
 }finally{await pool.end();}
}
main().catch(error=>{console.error(error instanceof Error?error.message:"Release check failed.");process.exitCode=1;});
