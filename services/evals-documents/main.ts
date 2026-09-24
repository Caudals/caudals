import { randomUUID } from "node:crypto";
import { chromium } from "@playwright/test";
import { z } from "zod";
import { getEvalsPool,withTenant } from "../../lib/evals/repositories/db";
import { reportSnapshotSchema } from "../../lib/evals/reports/contracts";
import { renderReportPdf } from "../../lib/evals/reports/render";
import { sha256 } from "../../lib/evals/contracts/hashing";
import { completeSourceIngestion, createWebsiteCaptureArtifact, failSourceIngestion, failWebsitePersistence, queueWebsiteSourceExtraction } from "../../lib/evals/repositories/evidence";
import { extractText } from "../../lib/evals/storage/text";
import { deletePrivateObject, objectKey, readVerified, sealObject, writeUpload } from "../../lib/evals/storage/private";

type Claimed={id:string;report_revision_id:string;snapshot:unknown;project_id:string};
async function claim(orgId:string,actorId:string):Promise<Claimed|undefined>{return withTenant({orgId,actorId},async db=>{await db.query("UPDATE evals.export_job SET status='queued',reason_code='render_worker_interrupted',updated_at=now() WHERE org_id=$1 AND kind='pdf' AND status='running' AND updated_at<now()-interval '15 minutes'",[orgId]);const job=(await db.query(`SELECT j.id,j.report_revision_id,rr.snapshot,r.project_id FROM evals.export_job j JOIN evals.report_revision rr ON (rr.org_id,rr.id)=(j.org_id,j.report_revision_id) JOIN evals.report r ON (r.org_id,r.id)=(rr.org_id,rr.report_id) WHERE j.org_id=$1 AND j.kind='pdf' AND j.status='queued' ORDER BY j.created_at,j.id LIMIT 1 FOR UPDATE OF j SKIP LOCKED`,[orgId])).rows[0];if(!job)return;await db.query("UPDATE evals.export_job SET status='running',reason_code=NULL,updated_at=now() WHERE org_id=$1 AND id=$2",[orgId,job.id]);return job;});}

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
async function processSourceOne(orgId:string,actorId:string){
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

type CapturedWebsite={id:string;captured_text:string};
async function claimCapturedWebsite(orgId:string,actorId:string):Promise<CapturedWebsite|undefined>{
 return withTenant({orgId,actorId},async db=>{
  await db.query("UPDATE evals.website_source_job SET status='failed',captured_text=NULL,reason_code='website_storage_unavailable',updated_at=now() WHERE org_id=$1 AND status='persisting' AND updated_at<now()-interval '15 minutes' AND artifact_attempt_count>=3",[orgId]);
  await db.query("UPDATE evals.website_source_job SET status='captured',reason_code='website_storage_retry',updated_at=now() WHERE org_id=$1 AND status='persisting' AND updated_at<now()-interval '15 minutes' AND artifact_attempt_count<3",[orgId]);
  const job=(await db.query("SELECT id,captured_text FROM evals.website_source_job WHERE org_id=$1 AND status='captured' AND artifact_attempt_count<3 AND captured_text IS NOT NULL ORDER BY created_at,id LIMIT 1 FOR UPDATE SKIP LOCKED",[orgId])).rows[0] as CapturedWebsite|undefined;
  if(!job)return;
  await db.query("UPDATE evals.website_source_job SET status='persisting',artifact_attempt_count=artifact_attempt_count+1,reason_code=NULL,updated_at=now() WHERE org_id=$1 AND id=$2",[orgId,job.id]);
  return job;
 });
}
async function processCapturedWebsiteOne(orgId:string,actorId:string){
 const job=await claimCapturedWebsite(orgId,actorId);if(!job)return false;
 const scope={orgId,actorId},bytes=Buffer.from(job.captured_text,"utf8");
 try{
  const artifact=await createWebsiteCaptureArtifact(scope,job.id,bytes);
  await writeUpload(artifact.object_key,bytes,artifact.media_type);
  await queueWebsiteSourceExtraction(scope,job.id,artifact.id);
 }catch{await failWebsitePersistence(scope,job.id);}
 return true;
}

async function processOne(orgId:string,actorId:string){const job=await claim(orgId,actorId);if(!job)return false;try{const snapshot=reportSnapshotSchema.parse(job.snapshot),bytes=Buffer.from(await renderReportPdf(snapshot,async()=>{const browser=await chromium.launch({headless:true});const page=await browser.newPage();return {page,close:()=>browser.close()};}));if(bytes.length>25*1024*1024)throw new Error("pdf_too_large");const artifactId=randomUUID(),key=objectKey(orgId,artifactId,true),hash=sha256(bytes);await sealObject(key,bytes,"application/pdf");await withTenant({orgId,actorId},async db=>{await db.query(`INSERT INTO evals.artifact(id,org_id,project_id,export_path,visibility,object_key,sha256,byte_size,media_type,state,expires_at) VALUES($1,$2,$3,$4,'customer',$5,$6,$7,'application/pdf','ready',now()+interval '12 months')`,[artifactId,orgId,job.project_id,`reports/${job.report_revision_id}.pdf`,key,hash,bytes.length]);await db.query("INSERT INTO evals.report_artifact(org_id,report_revision_id,artifact_id,kind) VALUES($1,$2,$3,'pdf') ON CONFLICT(org_id,report_revision_id,kind) DO NOTHING",[orgId,job.report_revision_id,artifactId]);await db.query("UPDATE evals.export_job SET status='completed',artifact_id=$3,updated_at=now() WHERE org_id=$1 AND id=$2",[orgId,job.id,artifactId]);await db.query("INSERT INTO evals.notification(org_id,event_id,kind,audience,payload,status,delivered_at) VALUES($1,$2,'export_completed','workspace',$3,'delivered',now()) ON CONFLICT(org_id,event_id,audience) DO NOTHING",[orgId,`export:${job.id}:completed`,{exportJobId:job.id,artifactId}]);});return true;}catch{await withTenant({orgId,actorId},db=>db.query("UPDATE evals.export_job SET status='failed',reason_code='pdf_render_failed',updated_at=now() WHERE org_id=$1 AND id=$2",[orgId,job.id]));return true;}}

async function main(){if(process.env.EVALS_DOCUMENTS_ENABLED!=="true")throw new Error("documents_disabled");const orgIds=z.array(z.uuid()).min(1).parse(JSON.parse(process.env.EVALS_DOCUMENT_ORG_IDS??"[]")),actorId=z.string().min(1).parse(process.env.EVALS_DOCUMENT_ACTOR_ID);let stopping=false;const stop=()=>{stopping=true;};process.once("SIGTERM",stop);process.once("SIGINT",stop);console.info(JSON.stringify({event:"document_worker_ready",environment:process.env.EVALS_ENV}));try{while(!stopping){let worked=false;for(const orgId of orgIds){worked=await processCapturedWebsiteOne(orgId,actorId)||worked;worked=await processSourceOne(orgId,actorId)||worked;worked=await processOne(orgId,actorId)||worked;}if(!worked)await new Promise(resolve=>setTimeout(resolve,1000));}}finally{await getEvalsPool().end();}}
main().catch(()=>{console.error(JSON.stringify({event:"document_worker_stopped",reason:"configuration_or_runtime_failure"}));process.exitCode=1;});
