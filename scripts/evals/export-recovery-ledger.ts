import { writeFile } from "node:fs/promises";
import { Pool } from "pg";
import { getSecretEnvValue } from "../../lib/env/secrets";

async function main(){
 const output=process.argv[2];
 if(!output||!output.startsWith("/"))throw new Error("usage: export-recovery-ledger <absolute-private-path>");
 const url=getSecretEnvValue("EVALS_MIGRATION_DATABASE_URL");
 if(!url)throw new Error("Migration-owner connection required.");
 const pool=new Pool({connectionString:url,max:1});
 try{const rows=(await pool.query("SELECT id,org_id,action,subject_type,subject_id,occurred_at,actor_id,payload_hash FROM evals.recovery_control_event ORDER BY id")).rows;await writeFile(output,rows.map(row=>JSON.stringify(row)).join("\n")+"\n",{flag:"wx",mode:0o600});console.log(JSON.stringify({exported:rows.length,path:output}));}finally{await pool.end();}
}
main().catch(error=>{console.error(error instanceof Error?error.message:"Recovery ledger export failed.");process.exitCode=1;});
