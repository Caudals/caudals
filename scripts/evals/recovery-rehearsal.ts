import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { getSecretEnvValue } from "../../lib/env/secrets";
import { replayRecoveryControls } from "../../lib/evals/operations/lifecycle";

async function main(){
 const snapshotAt=process.argv[2];
 if(!snapshotAt||!Number.isFinite(Date.parse(snapshotAt)))throw new Error("usage: recovery-rehearsal <snapshot-utc>");
 if(process.env.EVALS_DISPATCH_ENABLED==="true")throw new Error("Keep restored workers paused while replaying recovery controls.");
 const url=getSecretEnvValue("EVALS_MIGRATION_DATABASE_URL");
 if(!url)throw new Error("Set the isolated restore database owner URL.");
 const ledgerPath=process.env.EVALS_RECOVERY_LEDGER_FILE;
 if(!ledgerPath)throw new Error("Mount the independently retained recovery ledger.");
 const pool=new Pool({connectionString:url,max:1}),client=await pool.connect();
 try{
  await client.query("BEGIN");
  for(const line of (await readFile(ledgerPath,"utf8")).split(/\r?\n/).filter(Boolean)){
   const event=JSON.parse(line);
   await client.query(`INSERT INTO evals.recovery_control_event(id,org_id,action,subject_type,subject_id,occurred_at,actor_id,payload_hash) OVERRIDING SYSTEM VALUE VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING`,[event.id,event.org_id,event.action,event.subject_type,event.subject_id,event.occurred_at,event.actor_id,event.payload_hash]);
  }
  await client.query("SELECT setval(pg_get_serial_sequence('evals.recovery_control_event','id'),GREATEST(1,COALESCE((SELECT max(id) FROM evals.recovery_control_event),1)),true)");
  const rehearsal=(await client.query("INSERT INTO evals.recovery_rehearsal(snapshot_at,workers_paused) VALUES($1,true) RETURNING id",[snapshotAt])).rows[0],replay=await replayRecoveryControls(client,snapshotAt);
  const inaccessible=(await client.query(`SELECT (SELECT count(*) FROM evals.share_grant WHERE revoked_at IS NOT NULL) AS revoked_shares,(SELECT count(*) FROM evals.artifact WHERE state='deleted') AS deleted_artifacts`)).rows[0];
  await client.query("UPDATE evals.recovery_rehearsal SET completed_at=now(),ledger_replayed_through=$2,records_verified=$3,status='passed',evidence=$4 WHERE id=$1",[rehearsal.id,replay.through,Number(inaccessible.revoked_shares)+Number(inaccessible.deleted_artifacts),inaccessible]);
  await client.query("COMMIT");console.log(JSON.stringify({status:"passed",rehearsalId:rehearsal.id,replayed:replay.replayed}));
 }catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();await pool.end();}
}
main().catch(error=>{console.error(error instanceof Error?error.message:"Recovery rehearsal failed.");process.exitCode=1;});
