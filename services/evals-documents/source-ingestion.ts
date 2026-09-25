// Customer source extraction for the document worker: claim a queued upload,
// verify its bytes, extract text with bounded parsers, seal the object and
// commit the immutable source revision. Exported so fixtures can drive it.
import { withTenant } from "../../lib/evals/repositories/db";
import { completeSourceIngestion, failSourceIngestion } from "../../lib/evals/repositories/evidence";
import { extractText } from "../../lib/evals/storage/text";
import { deletePrivateObject, objectKey, readVerified, sealObject } from "../../lib/evals/storage/private";

type SourceJob={
 id:string;source_id:string;artifact_id:string;object_key:string;sealed_object_key:string|null;
 sha256:string;byte_size:number;media_type:string;export_path:string;visibility:string
};
async function claimSourceIngestion(orgId:string,actorId:string):Promise<SourceJob|undefined>{
 return withTenant({orgId,actorId},async db=>{
  await db.query("UPDATE evals.source_ingestion_job SET status='failed',reason_code='source_worker_interrupted',updated_at=now() WHERE org_id=$1 AND status='running' AND updated_at<now()-interval '15 minutes' AND attempt_count>=3",[orgId]);
  await db.query("UPDATE evals.source_ingestion_job SET status='queued',reason_code='source_worker_interrupted',updated_at=now() WHERE org_id=$1 AND status='running' AND updated_at<now()-interval '15 minutes' AND attempt_count<3",[orgId]);
  const job=(await db.query(`SELECT j.id,j.source_id,j.artifact_id,j.sealed_object_key,a.object_key,a.sha256,a.byte_size,a.media_type,a.export_path,a.visibility
   FROM evals.source_ingestion_job j JOIN evals.artifact a ON (a.org_id,a.id)=(j.org_id,j.artifact_id)
   WHERE j.org_id=$1 AND j.status='queued' AND j.attempt_count<3 AND a.state='pending'
   ORDER BY j.created_at,j.id LIMIT 1 FOR UPDATE OF j SKIP LOCKED`,[orgId])).rows[0] as SourceJob|undefined;
  if(!job)return;
  const sealedKey=job.sealed_object_key??objectKey(orgId,job.artifact_id,true);
  await db.query("UPDATE evals.source_ingestion_job SET status='running',attempt_count=attempt_count+1,sealed_object_key=$3,reason_code=NULL,updated_at=now() WHERE org_id=$1 AND id=$2",[orgId,job.id,sealedKey]);
  return {...job,sealed_object_key:sealedKey};
 });
}
export async function processSourceOne(orgId:string,actorId:string){
 const job=await claimSourceIngestion(orgId,actorId);if(!job)return false;
 const scope={orgId,actorId};
 let bytes:Buffer;
 try{bytes=await readVerified(job.object_key,job.byte_size,job.sha256);}
 catch{await failSourceIngestion(scope,job.id,"source_storage_unavailable",true);return true;}
 let extraction:Awaited<ReturnType<typeof extractText>>;
 try{extraction=await extractText(bytes,job.media_type);}
 catch{await failSourceIngestion(scope,job.id,"source_extraction_failed");return true;}
 try{
  try{await sealObject(job.sealed_object_key!,bytes,job.media_type);}
  catch(error){
   if((error as {$metadata?:{httpStatusCode?:number}}).$metadata?.httpStatusCode!==412)throw error;
   await readVerified(job.sealed_object_key!,job.byte_size,job.sha256);
  }
  await completeSourceIngestion(scope,job.id,job.sealed_object_key!,extraction);
  try{await deletePrivateObject(job.object_key);}catch{console.warn(JSON.stringify({event:"source_upload_cleanup_deferred"}));}
 }catch{
  await failSourceIngestion(scope,job.id,"source_persistence_unavailable",true);
 }
 return true;
}

