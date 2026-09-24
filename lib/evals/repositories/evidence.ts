import 'server-only';
import { z } from 'zod';
import { caseSchema, rubricSchema, sourceSchema } from '../contracts/cases';
import { randomUUID } from 'node:crypto';
import { canonicalJson, sha256, verifyContentHash, withContentHash } from '../contracts/hashing';
import { bundleSchema, parseBundle } from '../contracts/bundle';
import { toolFixtureSchema } from '../contracts/scenarios';
import { targetConfigSchema } from '../contracts/connectors';
import { manifestSchema } from '../contracts/manifest';
import { EvalError } from '../domain/errors';
import type { PoolClient } from 'pg';
import { withTenant } from './db';
import { extractText, MAX_SOURCE_BYTES } from '../storage/text';
import { objectKey, readVerified, sealObject, writeUpload } from '../storage/private';

const uuidSchema = z.uuid();

export type EvidenceScope = { orgId: string; actorId: string };
export class EvidenceError extends EvalError { constructor(status: number, message: string) { super('EVIDENCE_ERROR',status,message); } }
function required<T>(row: T | undefined): T { if (!row) throw new EvidenceError(404, 'Evidence not found'); return row; }
export async function idempotent<T>(db: PoolClient, scope: EvidenceScope, route: string, key: string, payload: unknown, fn: () => Promise<T>): Promise<T> {
  if (!key || key.length > 200) throw new EvidenceError(400, 'Idempotency-Key required');
  const hash = sha256(canonicalJson(payload));
  await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [JSON.stringify([scope.orgId, scope.actorId, route, key])]);
  const old = (await db.query('SELECT request_hash,response FROM evals.evidence_request WHERE org_id=$1 AND created_by=$2 AND route=$3 AND request_key=$4', [scope.orgId,scope.actorId,route,key])).rows[0];
  if (old) { if (old.request_hash !== hash) throw new EvidenceError(409,'Idempotency key payload mismatch'); return old.response; }
  const response = await fn();
  await db.query('INSERT INTO evals.evidence_request(org_id,route,request_key,request_hash,response) VALUES($1,$2,$3,$4,$5)', [scope.orgId,route,key,hash,JSON.stringify(response)]);
  return response;
}
export function listProjects(scope: EvidenceScope, after?: string) {
  return withTenant(scope, async db => (await db.query('SELECT id,title,description,created_at FROM evals.project WHERE org_id=$1 AND ($2::uuid IS NULL OR (created_at,id) > (SELECT created_at,id FROM evals.project WHERE org_id=$1 AND id=$2)) ORDER BY created_at,id LIMIT 50', [scope.orgId,after ?? null])).rows);
}
export function listSuiteVersions(scope: EvidenceScope, projectId?: string) {
  return withTenant(scope, async db => (await db.query(
    `SELECT s.id AS suite_id,sv.id AS suite_version_id,s.project_id,p.title AS project_title,
            COALESCE(sv.manifest->>'title',s.title) AS title,sv.content_hash,sv.created_at AS frozen_at,
            count(cr.id) FILTER (WHERE cr.split <> 'holdout')::int AS case_count
     FROM evals.suite_version sv
     JOIN evals.suite s ON (s.org_id,s.id)=(sv.org_id,sv.suite_id)
     JOIN evals.project p ON (p.org_id,p.id)=(s.org_id,s.project_id)
     LEFT JOIN evals.suite_case sc ON (sc.org_id,sc.suite_version_id)=(sv.org_id,sv.id)
     LEFT JOIN evals.case_revision cr ON (cr.org_id,cr.id)=(sc.org_id,sc.case_revision_id)
     WHERE sv.org_id=$1 AND ($2::uuid IS NULL OR s.project_id=$2)
     GROUP BY s.id,sv.id,s.project_id,p.title,s.title,sv.manifest,sv.content_hash,sv.created_at
     ORDER BY sv.created_at DESC,sv.id DESC LIMIT 200`,
    [scope.orgId,projectId ?? null],
  )).rows);
}
export function createProject(scope: EvidenceScope, input: {title: string; description: string}, key: string) {
  return withTenant(scope, db => idempotent(db,scope,'projects',key,input,async () => (await db.query('INSERT INTO evals.project(org_id,title,description) VALUES($1,$2,$3) RETURNING id,title,description,created_at',[scope.orgId,input.title,input.description])).rows[0]));
}
export function createUpload(scope: EvidenceScope, input: {projectId: string; evaluationId?:string; title: string; mediaType: string; byteSize: number; sha256: string; rights: 'customer_owned'|'licensed'|'public_domain'|'caudals_owned'; visibility?: 'internal'|'candidate'|'judge'|'customer'; exportPath?:string}, key: string) {
  return withTenant(scope, db => idempotent(db,scope,'uploads',key,input,async () => {
    required((await db.query('SELECT id FROM evals.project WHERE org_id=$1 AND id=$2',[scope.orgId,input.projectId])).rows[0]);
    if(input.evaluationId){
      const evaluation=required((await db.query('SELECT id,project_id FROM evals.evaluation WHERE org_id=$1 AND id=$2 FOR UPDATE',[scope.orgId,input.evaluationId])).rows[0]);
      if(evaluation.project_id!==input.projectId)throw new EvidenceError(422,'Source project does not match evaluation');
      const usage=(await db.query(`SELECT count(*)::int AS files,COALESCE(sum(a.byte_size),0)::bigint AS bytes
        FROM evals.source s JOIN evals.source_upload u ON u.org_id=s.org_id AND u.source_id=s.id
        JOIN evals.artifact a ON a.org_id=u.org_id AND a.id=u.artifact_id
        WHERE s.org_id=$1 AND s.evaluation_id=$2 AND NOT EXISTS
          (SELECT 1 FROM evals.website_source_job w WHERE w.org_id=s.org_id AND w.source_id=s.id)` ,[scope.orgId,input.evaluationId])).rows[0];
      if(usage.files>=20||Number(usage.bytes)+input.byteSize>100_000_000)throw new EvidenceError(413,'Evaluation source limit exceeded');
    }
    const id = randomUUID(); const storageKey = objectKey(scope.orgId,id);
    const extensions:Record<string,string>={'text/plain':'txt','text/markdown':'md','application/vnd.openxmlformats-officedocument.wordprocessingml.document':'docx','application/pdf':'pdf','text/csv':'csv','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':'xlsx'}; const exportPath=input.exportPath??('sources/'+id+'.'+(extensions[input.mediaType]??'bin'));
    await db.query('INSERT INTO evals.artifact(id,org_id,project_id,object_key,sha256,byte_size,media_type,export_path,visibility) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[id,scope.orgId,input.projectId,storageKey,input.sha256,input.byteSize,input.mediaType,exportPath,input.visibility??'internal']);
    const source = (await db.query('INSERT INTO evals.source(org_id,project_id,evaluation_id,title,rights) VALUES($1,$2,$3,$4,$5) RETURNING id',[scope.orgId,input.projectId,input.evaluationId??null,input.title,input.rights])).rows[0];
    // Persist binding: source cannot finalize a different source's upload.
    await db.query('INSERT INTO evals.source_upload(org_id,source_id,artifact_id) VALUES($1,$2,$3)',[scope.orgId,source.id,id]);
    return { sourceId: source.id, artifactId: id, artifactPath:exportPath, uploadUrl: `/api/evals/v1/artifacts/${id}/upload?orgId=${scope.orgId}`, method: 'PUT' };
  }));
}
async function replay(scope: EvidenceScope, route: string, key: string, payload: unknown) {
 if (!key || key.length>200) throw new EvidenceError(400,'Idempotency-Key required');
 return withTenant(scope,async db=>{
  const old=(await db.query('SELECT request_hash,response FROM evals.evidence_request WHERE org_id=$1 AND created_by=$2 AND route=$3 AND request_key=$4',[scope.orgId,scope.actorId,route,key])).rows[0];
  if(old && old.request_hash!==sha256(canonicalJson(payload))) throw new EvidenceError(409,'Idempotency key payload mismatch');
  return old?.response;
 });
}
export async function finalizeSource(scope: EvidenceScope, sourceId: string, key: string) {
  const route="finalize/"+sourceId;
  const old=await replay(scope,route,key,{});if(old)return old;
  const artifact=await withTenant(scope,async db=>required((await db.query('SELECT a.* FROM evals.artifact a JOIN evals.source_upload u ON u.org_id=a.org_id AND u.artifact_id=a.id WHERE u.org_id=$1 AND u.source_id=$2',[scope.orgId,sourceId])).rows[0]));
  if(artifact.state!=="pending"||new Date(artifact.expires_at)<new Date())throw new EvidenceError(409,"Upload is no longer pending");
  await readVerified(artifact.object_key,artifact.byte_size,artifact.sha256);
  return withTenant(scope,db=>idempotent(db,scope,route,key,{},async()=>{
    const current=required((await db.query("SELECT * FROM evals.artifact WHERE org_id=$1 AND id=$2 FOR UPDATE",[scope.orgId,artifact.id])).rows[0]);
    if(current.state!=="pending"||current.object_key!==artifact.object_key||new Date(current.expires_at)<new Date())throw new EvidenceError(409,"Upload state changed");
    const inserted=await db.query("INSERT INTO evals.source_ingestion_job(org_id,source_id,artifact_id,status) VALUES($1,$2,$3,'queued') ON CONFLICT(org_id,artifact_id) DO NOTHING RETURNING id,status",[scope.orgId,sourceId,artifact.id]); const job=inserted.rows[0]??required((await db.query("SELECT id,status FROM evals.source_ingestion_job WHERE org_id=$1 AND artifact_id=$2",[scope.orgId,artifact.id])).rows[0]);
    return {status:"extracting",sourceId,artifactId:artifact.id,ingestionJobId:job.id};
  }));
}
export function createWebsiteSource(scope:EvidenceScope,input:{evaluationId:string;projectId:string;url:string;title:string;rights:"customer_owned"|"licensed"|"public_domain"},key:string){
 return withTenant(scope,db=>idempotent(db,scope,"website-source/"+input.evaluationId,key,input,async()=>{
  const evaluation=required((await db.query("SELECT id,project_id FROM evals.evaluation WHERE org_id=$1 AND id=$2",[scope.orgId,input.evaluationId])).rows[0]);
  if(evaluation.project_id!==input.projectId)throw new EvidenceError(422,"Website source project does not match evaluation");
  const source=required((await db.query("INSERT INTO evals.source(org_id,project_id,evaluation_id,title,rights) VALUES($1,$2,$3,$4,$5) RETURNING id",[scope.orgId,input.projectId,input.evaluationId,input.title,input.rights])).rows[0]);
  const job=required((await db.query("INSERT INTO evals.website_source_job(org_id,evaluation_id,source_id,start_url,created_by) VALUES($1,$2,$3,$4,$5) RETURNING id,status",[scope.orgId,input.evaluationId,source.id,input.url,scope.actorId])).rows[0]);
  return {sourceId:source.id,jobId:job.id,status:job.status};
 }));
}

export async function createWebsiteCaptureArtifact(scope:EvidenceScope,jobId:string,bytes:Buffer){
 if(bytes.length<1||bytes.length>MAX_SOURCE_BYTES)throw new EvidenceError(422,"Website text is outside extraction limits");
 const digest=sha256(bytes);
 return withTenant(scope,async db=>{
  const job=required((await db.query("SELECT id,source_id,artifact_id,status FROM evals.website_source_job WHERE org_id=$1 AND id=$2 FOR UPDATE",[scope.orgId,jobId])).rows[0]);
  if(job.status!=="persisting"&&job.status!=="extracting")throw new EvidenceError(409,"Website capture is no longer active");
  if(job.artifact_id){
   const existing=required((await db.query("SELECT id,object_key,sha256,byte_size,media_type,export_path,visibility FROM evals.artifact WHERE org_id=$1 AND id=$2",[scope.orgId,job.artifact_id])).rows[0]);
   if(existing.sha256!==digest||existing.byte_size!==bytes.length)throw new EvidenceError(409,"Website changed during capture retry");
   return existing;
  }
  const artifactId=randomUUID(),storageKey=objectKey(scope.orgId,artifactId);
  const artifact=required((await db.query("INSERT INTO evals.artifact(id,org_id,project_id,object_key,sha256,byte_size,media_type,export_path,visibility) VALUES($1,$2,(SELECT project_id FROM evals.source WHERE org_id=$2 AND id=$3),$4,$5,$6,'text/markdown',$7,'internal') RETURNING id,object_key,sha256,byte_size,media_type,export_path,visibility",[artifactId,scope.orgId,job.source_id,storageKey,digest,bytes.length,"sources/website-"+job.source_id+".md"])).rows[0]);
  await db.query("INSERT INTO evals.source_upload(org_id,source_id,artifact_id) VALUES($1,$2,$3)",[scope.orgId,job.source_id,artifact.id]);
  await db.query("UPDATE evals.website_source_job SET artifact_id=$3,updated_at=now() WHERE org_id=$1 AND id=$2",[scope.orgId,job.id,artifact.id]);
  return artifact;
 });
}

export function queueWebsiteSourceExtraction(scope:EvidenceScope,jobId:string,artifactId:string){
 return withTenant(scope,async db=>{
  const job=required((await db.query("SELECT source_id,status,artifact_id FROM evals.website_source_job WHERE org_id=$1 AND id=$2 FOR UPDATE",[scope.orgId,jobId])).rows[0]);
  if(job.artifact_id!==artifactId||!["persisting","extracting"].includes(job.status))throw new EvidenceError(409,"Website capture is no longer active");
  await db.query("INSERT INTO evals.source_ingestion_job(org_id,source_id,artifact_id,status) VALUES($1,$2,$3,'queued') ON CONFLICT(org_id,artifact_id) DO NOTHING",[scope.orgId,job.source_id,artifactId]);
  await db.query("UPDATE evals.website_source_job SET status='extracting',captured_text=NULL,reason_code=NULL,updated_at=now() WHERE org_id=$1 AND id=$2",[scope.orgId,jobId]);
 });
}

export async function uploadArtifact(scope: EvidenceScope, id:string, bytes:Buffer) {
 const a=await withTenant(scope,async db=>required((await db.query("SELECT * FROM evals.artifact WHERE org_id=$1 AND id=$2 AND state='pending' AND expires_at>now()",[scope.orgId,id])).rows[0]));
 if(bytes.length!==a.byte_size || sha256(bytes)!==a.sha256) throw new EvidenceError(422,'Upload size or checksum mismatch');
 await writeUpload(a.object_key,bytes,a.media_type);
 return {id,uploaded:true};
}
export async function getArtifact(scope: EvidenceScope, id: string) {
 const a=await withTenant(scope,async db=>required((await db.query("SELECT * FROM evals.artifact WHERE org_id=$1 AND id=$2 AND state='ready' AND expires_at>now()",[scope.orgId,id])).rows[0]));
 const bytes=await readVerified(a.object_key,a.byte_size,a.sha256);
 return {id:a.id,sha256:a.sha256,bytes};
}
export function getSource(scope: EvidenceScope, id: string) {
  return withTenant(scope,async db => {
    const source = required((await db.query('SELECT id,title,project_id FROM evals.source WHERE org_id=$1 AND id=$2',[scope.orgId,id])).rows[0]);
    const revisions = (await db.query('SELECT id,artifact_id,content_hash,extraction_version FROM evals.source_revision WHERE org_id=$1 AND source_id=$2 ORDER BY created_at DESC,id DESC LIMIT 20',[scope.orgId,id])).rows;
    const chunks = revisions.length ? (await db.query('SELECT id,source_revision_id,ordinal,excerpt,anchor FROM evals.source_chunk WHERE org_id=$1 AND source_revision_id=$2 ORDER BY ordinal LIMIT 256',[scope.orgId,revisions[0].id])).rows : [];
    const ingestion=(await db.query('SELECT id,status,attempt_count,reason_code,source_revision_id,updated_at FROM evals.source_ingestion_job WHERE org_id=$1 AND source_id=$2 ORDER BY created_at DESC,id DESC LIMIT 1',[scope.orgId,id])).rows[0]??null;
    const websiteCapture=(await db.query('SELECT id,start_url,status,reason_code,source_revision_id,updated_at FROM evals.website_source_job WHERE org_id=$1 AND source_id=$2 ORDER BY created_at DESC,id DESC LIMIT 1',[scope.orgId,id])).rows[0]??null;
    return { ...source, revisions, chunks, ingestion, websiteCapture };
  });
}
export function getDraft(scope: EvidenceScope, id: string) {
  return withTenant(scope,async db => required((await db.query('SELECT id,draft,version FROM evals.suite WHERE org_id=$1 AND id=$2',[scope.orgId,id])).rows[0]));
}
export function getSuiteDraftCases(scope: EvidenceScope, id: string) {
  return withTenant(scope, async db => {
    const suite = required((await db.query('SELECT id,title,project_id,draft,version FROM evals.suite WHERE org_id=$1 AND id=$2',[scope.orgId,id])).rows[0]);
    const manifest = manifestSchema.parse(suite.draft);
    verifiedHash(manifest);
    const editable = manifest.case_revisions.filter(item => item.split !== 'holdout');
    const rows = editable.length ? (await db.query(
      `SELECT cr.id,cr.content_hash,cr.document FROM evals.case_revision cr
       JOIN evals."case" c ON (c.org_id,c.id)=(cr.org_id,cr.case_id)
       WHERE cr.org_id=$1 AND c.project_id=$2 AND cr.id=ANY($3::uuid[])`,
      [scope.orgId, suite.project_id, editable.map(item => item.revision_id)],
    )).rows : [];
    const byId = new Map(rows.map(row => [row.id, row]));
    const cases = editable.map(reference => {
      const row = required(byId.get(reference.revision_id));
      if (row.content_hash !== reference.content_hash) throw new EvidenceError(409,'Draft case revision changed');
      const document = caseSchema.parse(row.document);
      verifyContentHash(document);
      return { caseRevisionId: row.id, document };
    });
    return { suiteId: suite.id, suiteTitle: suite.title, version: suite.version, cases };
  });
}
export function patchDraft(scope: EvidenceScope, id: string, version: number, draft: unknown) {
  return withTenant(scope,async db => {
    const result = await db.query('UPDATE evals.suite SET draft=$4,version=version+1 WHERE org_id=$1 AND id=$2 AND version=$3 RETURNING id,draft,version',[scope.orgId,id,version,JSON.stringify(draft)]);
    if (!result.rowCount) throw new EvidenceError(409,'Draft changed or is unavailable');
    return result.rows[0];
  });
}
export function editSuiteDraftCase(
  scope: EvidenceScope,
  suiteId: string,
  caseRevisionId: string,
  input: { title: string; contents: string[]; expected: unknown },
  key: string,
) {
  return withTenant(scope, db => idempotent(db,scope,`suite-case-edit/${suiteId}/${caseRevisionId}`,key,input,async () => {
    const suite = required((await db.query('SELECT id,project_id,draft,version FROM evals.suite WHERE org_id=$1 AND id=$2 FOR UPDATE',[scope.orgId,suiteId])).rows[0]);
    const manifest = manifestSchema.parse(suite.draft);
    verifiedHash(manifest);
    const reference = manifest.case_revisions.find(item => item.revision_id === caseRevisionId);
    if (!reference || reference.split === 'holdout') throw new EvidenceError(404,'Editable test-set case not found');
    const row = required((await db.query(
      `SELECT cr.document,cr.content_hash FROM evals.case_revision cr
       JOIN evals."case" c ON (c.org_id,c.id)=(cr.org_id,cr.case_id)
       WHERE cr.org_id=$1 AND cr.id=$2 AND c.project_id=$3`,
      [scope.orgId,caseRevisionId,suite.project_id],
    )).rows[0]);
    if (row.content_hash !== reference.content_hash) throw new EvidenceError(409,'Draft case revision changed');
    const original = caseSchema.parse(row.document);
    verifyContentHash(original);
    if (input.contents.length !== original.scenario.messages.length) throw new EvidenceError(422,'The message structure cannot change in a customer fork');
    const revisionId = randomUUID();
    const editedAt = new Date().toISOString();
    const document = caseSchema.parse(withContentHash({
      ...original,
      revision_id: revisionId,
      title: input.title,
      scenario: { ...original.scenario, messages: original.scenario.messages.map((message,index) => ({...message,content:input.contents[index]})) },
      reference: { ...original.reference, expected: input.expected as typeof original.reference.expected },
      provenance: { ...original.provenance, evidence_level: 'customer_supplied_unreviewed' as const, reviewer_ids: [] },
      extensions: { ...original.extensions, 'caudals.evals/customer-edit': { actor_id: scope.actorId, edited_at: editedAt } },
    }));
    await db.query(
      'INSERT INTO evals.case_revision(id,org_id,case_id,family_id,split,content_hash,document,rubric_revision_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
      [document.revision_id,scope.orgId,document.case_id,document.family_id,document.split,document.content_hash,document,document.reference.rubric_revision_id],
    );
    const nextManifest = manifestSchema.parse(withContentHash({
      ...manifest,
      suite_version_id: randomUUID(),
      created_at: editedAt,
      case_revisions: manifest.case_revisions.map(item => item.revision_id === caseRevisionId
        ? {...item,revision_id:document.revision_id,content_hash:document.content_hash}
        : item),
    }));
    const updated = required((await db.query(
      'UPDATE evals.suite SET draft=$3,version=version+1 WHERE org_id=$1 AND id=$2 RETURNING version',
      [scope.orgId,suiteId,nextManifest],
    )).rows[0]);
    return { suiteId, version: updated.version, caseRevisionId: document.revision_id, contentHash: document.content_hash };
  }));
}

export function createSuite(scope: EvidenceScope, input: {projectId: string; title: string}, key: string) {
  return withTenant(scope,db => idempotent(db,scope,'suites',key,input,async () => {
    required((await db.query('SELECT id FROM evals.project WHERE org_id=$1 AND id=$2',[scope.orgId,input.projectId])).rows[0]);
    return (await db.query('INSERT INTO evals.suite(org_id,project_id,title) VALUES($1,$2,$3) RETURNING id,title,version,draft',[scope.orgId,input.projectId,input.title])).rows[0];
  }));
}
export function assertReleasedRegressionRevision(
  candidate: { revision_id: string; extensions: Record<string, unknown> },
  release: { draft_case_revision_id: string; redaction_status: string; validation_status: string } | undefined,
) {
  if (!release || release.draft_case_revision_id !== candidate.revision_id ||
      release.redaction_status !== 'redacted' || release.validation_status !== 'valid') {
    throw new EvidenceError(409,'Regression revision must be redacted and revalidated before freezing');
  }
}
export function freezeSuite(scope: EvidenceScope, id: string, version: number, key: string) {
  return withTenant(scope,db => idempotent(db,scope,`freeze/${id}`,key,{version},async () => {
    const suite = required((await db.query('SELECT * FROM evals.suite WHERE org_id=$1 AND id=$2 FOR UPDATE',[scope.orgId,id])).rows[0]);
    if (suite.version !== version) throw new EvidenceError(409,'Draft changed');
    const manifest = manifestSchema.parse(suite.draft);
    verifiedHash(manifest);
    if (manifest.suite_id !== id || !/^[0-9a-f-]{36}$/i.test(manifest.suite_version_id)) throw new EvidenceError(400,'Manifest identity mismatch');
    const frozen = (await db.query('SELECT content_hash FROM evals.suite_version WHERE org_id=$1 AND id=$2 AND suite_id=$3',[scope.orgId,manifest.suite_version_id,id])).rows[0];
    if (frozen) {
      if (frozen.content_hash !== manifest.content_hash) throw new EvidenceError(409,'Frozen test-set identity changed');
      return { id: manifest.suite_version_id, contentHash: manifest.content_hash, manifest };
    }
    async function documents(table:string,refs:{revision_id:string;content_hash:string}[]) {
      const documents=[];
      for(const ref of refs) {
        uuidSchema.parse(ref.revision_id);
        const row=required((await db.query(`SELECT document,content_hash FROM evals.${table} WHERE org_id=$1 AND id=$2`,[scope.orgId,ref.revision_id])).rows[0]);
        if(row.content_hash!==ref.content_hash) throw new EvidenceError(422,'Revision hash mismatch');
        documents.push(row.document);
      }
      return documents;
    }
    const bundle=parseEvidenceBundle({manifest,cases:await documents('case_revision',manifest.case_revisions),sources:await documents('source_revision',manifest.source_revisions),rubrics:await documents('rubric_revision',manifest.rubric_revisions),fixtures:await documents('tool_fixture_revision',manifest.fixture_revisions),output_schemas:await documents('output_schema_revision',manifest.output_schema_revisions),observations:[],assessments:[]});
    for (const candidate of bundle.cases) {
      const link = candidate.extensions['caudals.evals/regression'];
      if (link === undefined) continue;
      if (!link || typeof link !== 'object' || Array.isArray(link) ||
          typeof link.regression_case_id !== 'string') {
        throw new EvidenceError(422,'Regression revision has an invalid release link');
      }
      const release = (await db.query(
        `SELECT draft_case_revision_id,redaction_status,validation_status
         FROM evals.regression_case WHERE org_id=$1 AND id=$2`,
        [scope.orgId,link.regression_case_id],
      )).rows[0];
      assertReleasedRegressionRevision(candidate, release);
    }
    const artifacts=new Map<string,{id:string;visibility:string;sha256:string;byte_size:number}>();
    if(manifest.files.length>256) throw new EvidenceError(422,'Too many manifest files');
    for(const file of manifest.files) {
      const artifact=required((await db.query("SELECT id,visibility,sha256,byte_size FROM evals.artifact WHERE org_id=$1 AND project_id=$2 AND export_path=$3 AND state='ready' AND expires_at>now()",[scope.orgId,suite.project_id,file.path])).rows[0]);
      if(artifact.sha256!==file.sha256 || artifact.byte_size!==file.size_bytes) throw new EvidenceError(422,'Artifact checksum or size mismatch');
      artifacts.set(file.path,artifact);
    }
    for(const attachment of [...bundle.sources.map(source=>source.artifact),...bundle.cases.flatMap(c=>c.scenario.attachments)]) {
      const artifact=artifacts.get(attachment.path);
      if(!artifact || artifact.sha256!==attachment.sha256 || artifact.byte_size!==attachment.size_bytes || (attachment.visibility==='candidate' && artifact.visibility!=='candidate')) throw new EvidenceError(422,'Artifact is absent or not permitted for this audience');
    }
    await db.query('INSERT INTO evals.suite_version(id,org_id,suite_id,content_hash,manifest) VALUES($1,$2,$3,$4,$5)',[manifest.suite_version_id,scope.orgId,id,manifest.content_hash,manifest]);
    for (const [ordinal,c] of manifest.case_revisions.entries()) await db.query('INSERT INTO evals.suite_case(org_id,suite_version_id,case_revision_id,ordinal) VALUES($1,$2,$3,$4)',[scope.orgId,manifest.suite_version_id,c.revision_id,ordinal]);
    for(const artifact of artifacts.values()) await db.query('INSERT INTO evals.suite_artifact(org_id,suite_version_id,artifact_id) VALUES($1,$2,$3)',[scope.orgId,manifest.suite_version_id,artifact.id]);
    return { id: manifest.suite_version_id, contentHash: manifest.content_hash, manifest };
  }));
}

/** Caller has already authorized project writes; revisions are append-only. */
export function addRevision(scope: EvidenceScope, projectId: string, input: {kind:'case'|'rubric'|'output_schema'|'tool_fixture'; document:unknown}, key: string) {
  return withTenant(scope,db => idempotent(db,scope,`revisions/${projectId}`,key,input,async () => {
    required((await db.query('SELECT id FROM evals.project WHERE org_id=$1 AND id=$2',[scope.orgId,projectId])).rows[0]);
    if (input.kind==='output_schema' || input.kind==='tool_fixture') {
      const document=input.kind==='output_schema'?bundleSchema.shape.output_schemas.element.parse(input.document):toolFixtureSchema.parse(input.document);
      verifiedHash(document);
      const id='revision_id' in document?document.revision_id:document.id;uuidSchema.parse(id);
      const table=input.kind==='output_schema'?'output_schema_revision':'tool_fixture_revision';
      return (await db.query(`INSERT INTO evals.${table}(id,org_id,project_id,content_hash,document) VALUES($1,$2,$3,$4,$5) RETURNING id,content_hash`,[id,scope.orgId,projectId,document.content_hash,document])).rows[0];
    }
    if (input.kind === 'rubric') {
      const r = rubricSchema.parse(input.document); verifiedHash(r);
      uuidSchema.parse(r.revision_id);
      return (await db.query('INSERT INTO evals.rubric_revision(id,org_id,project_id,content_hash,document) VALUES($1,$2,$3,$4,$5) RETURNING id,content_hash',[r.revision_id,scope.orgId,projectId,r.content_hash,r])).rows[0];
    }
    const c = caseSchema.parse(input.document); verifiedHash(c);
    uuidSchema.parse(c.case_id); uuidSchema.parse(c.revision_id); uuidSchema.parse(c.reference.rubric_revision_id);
    required((await db.query('SELECT id FROM evals.rubric_revision WHERE org_id=$1 AND project_id=$2 AND id=$3',[scope.orgId,projectId,c.reference.rubric_revision_id])).rows[0]);
    for (const ref of c.reference.source_refs) {
      uuidSchema.parse(ref.source_revision_id);
      required((await db.query("SELECT ch.id FROM evals.source_chunk ch JOIN evals.source_revision r ON r.org_id=ch.org_id AND r.id=ch.source_revision_id JOIN evals.source s ON s.org_id=r.org_id AND s.id=r.source_id WHERE ch.org_id=$1 AND s.project_id=$2 AND r.id=$3 AND ch.id::text=$4",[scope.orgId,projectId,ref.source_revision_id,ref.anchor])).rows[0]);
    }
    await db.query('INSERT INTO evals."case"(id,org_id,project_id) VALUES($1,$2,$3) ON CONFLICT(id) DO NOTHING',[c.case_id,scope.orgId,projectId]);
    required((await db.query('SELECT id FROM evals."case" WHERE org_id=$1 AND project_id=$2 AND id=$3',[scope.orgId,projectId,c.case_id])).rows[0]);
    return (await db.query('INSERT INTO evals.case_revision(id,org_id,case_id,family_id,split,content_hash,document,rubric_revision_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,content_hash',[c.revision_id,scope.orgId,c.case_id,c.family_id,c.split,c.content_hash,c,c.reference.rubric_revision_id])).rows[0];
  }));
}

export async function persistSourceRevision(db: PoolClient, scope: EvidenceScope, sourceId: string, artifact: {id:string;sha256:string;byte_size:number;media_type:string;export_path:string;visibility:string}, extraction: Awaited<ReturnType<typeof extractText>>) {
    const source = required((await db.query('SELECT title,rights FROM evals.source WHERE org_id=$1 AND id=$2',[scope.orgId,sourceId])).rows[0]);
    const revisionId = randomUUID();
    const chunks = extraction.chunks.map(chunk => ({...chunk,id:randomUUID()}));
    const document = sourceSchema.parse(withContentHash({schema_version:'1.0',source_id:sourceId,revision_id:revisionId,title:source.title,
      artifact:{path:artifact.export_path,sha256:artifact.sha256,size_bytes:artifact.byte_size,media_type:artifact.media_type,visibility:artifact.visibility},
      anchors:chunks.map(c=>({id:c.id,excerpt:c.excerpt,locator:`utf16:${c.anchor.start}:${c.anchor.end}`})),
      access:{candidate:artifact.visibility==='candidate',judge:true,customer:true,public:false},rights:source.rights,created_at:new Date().toISOString(),extensions:{'caudals.evals/extraction':{version:extraction.extractionVersion,anchor_space:'extracted_text',normalization:extraction.extractionVersion==='docx-text-v1'?'paragraphs, tabs and breaks converted to text; formatting omitted':'none'}}}));
    await db.query('INSERT INTO evals.source_revision(id,org_id,source_id,artifact_id,content_hash,extraction_version,document) VALUES($1,$2,$3,$4,$5,$6,$7)',[revisionId,scope.orgId,sourceId,artifact.id,document.content_hash,extraction.extractionVersion,document]);
    for (const chunk of chunks) await db.query('INSERT INTO evals.source_chunk(id,org_id,source_revision_id,ordinal,excerpt,anchor) VALUES($1,$2,$3,$4,$5,$6)',[chunk.id,scope.orgId,revisionId,chunk.ordinal,chunk.excerpt,chunk.anchor]);
    return { sourceId, revisionId, artifactId: artifact.id, contentHash:document.content_hash,sha256: artifact.sha256, chunks: chunks.length };
}

export async function completeSourceIngestion(scope:EvidenceScope,jobId:string,sealedObjectKey:string,extraction:Awaited<ReturnType<typeof extractText>>){
 return withTenant(scope,async db=>{
  const job=required((await db.query("SELECT * FROM evals.source_ingestion_job WHERE org_id=$1 AND id=$2 FOR UPDATE",[scope.orgId,jobId])).rows[0]);
  if(job.status!=="running")throw new EvidenceError(409,"Source ingestion job is no longer running");
  const artifact=required((await db.query("SELECT * FROM evals.artifact WHERE org_id=$1 AND id=$2 FOR UPDATE",[scope.orgId,job.artifact_id])).rows[0]);
  if(artifact.state!=="pending")throw new EvidenceError(409,"Source artifact is no longer pending");
  await db.query("UPDATE evals.artifact SET state='ready',object_key=$3,expires_at=now()+interval '90 days' WHERE org_id=$1 AND id=$2",[scope.orgId,artifact.id,sealedObjectKey]);
  const revision=await persistSourceRevision(db,scope,job.source_id,{id:artifact.id,sha256:artifact.sha256,byte_size:artifact.byte_size,media_type:artifact.media_type,export_path:artifact.export_path,visibility:artifact.visibility},extraction);
  await db.query("UPDATE evals.source_ingestion_job SET status='completed',reason_code=NULL,source_revision_id=$3,updated_at=now() WHERE org_id=$1 AND id=$2",[scope.orgId,job.id,revision.revisionId]);
  await db.query("UPDATE evals.website_source_job SET status='completed',reason_code=NULL,source_revision_id=$3,updated_at=now() WHERE org_id=$1 AND artifact_id=$2",[scope.orgId,artifact.id,revision.revisionId]);
  return {...revision,status:"ready"};
 });
}

export function failSourceIngestion(scope:EvidenceScope,jobId:string,reasonCode:string,retryable=false){
 return withTenant(scope,async db=>{
  const result=await db.query("UPDATE evals.source_ingestion_job SET status=CASE WHEN $4 AND attempt_count<3 THEN 'queued' ELSE 'failed' END,reason_code=$3,updated_at=now() WHERE org_id=$1 AND id=$2 AND status='running' RETURNING id,status,reason_code",[scope.orgId,jobId,reasonCode,retryable]);
  if(result.rows[0]?.status==="failed")await db.query("UPDATE evals.website_source_job SET status='failed',reason_code=$3,updated_at=now() WHERE org_id=$1 AND artifact_id=(SELECT artifact_id FROM evals.source_ingestion_job WHERE org_id=$1 AND id=$2)",[scope.orgId,jobId,reasonCode]);
  return result.rows[0]??null;
 });
}

export async function failWebsiteSource(scope:EvidenceScope,jobId:string,reasonCode:string,retryable:boolean){
 return withTenant(scope,async db=>{
  const result=await db.query("UPDATE evals.website_source_job SET status=CASE WHEN $4 AND attempt_count<3 THEN 'queued' ELSE 'failed' END,reason_code=$3,updated_at=now() WHERE org_id=$1 AND id=$2 AND status='running' RETURNING id,status",[scope.orgId,jobId,reasonCode,retryable]);
  return result.rows[0]??null;
 });
}

export function failWebsitePersistence(scope:EvidenceScope,jobId:string){
 return withTenant(scope,async db=>{
  const result=await db.query("UPDATE evals.website_source_job SET status=CASE WHEN artifact_attempt_count<3 THEN 'captured' ELSE 'failed' END,captured_text=CASE WHEN artifact_attempt_count<3 THEN captured_text ELSE NULL END,reason_code='website_storage_unavailable',updated_at=now() WHERE org_id=$1 AND id=$2 AND status='persisting' RETURNING id,status",[scope.orgId,jobId]);
  return result.rows[0]??null;
 });
}

export async function reviseSource(scope: EvidenceScope, sourceId: string, artifactId: string, key: string) {
 const route=`source-revision/${sourceId}`,payload={artifactId};
 const old=await replay(scope,route,key,payload);if(old) return old;
 const a=await withTenant(scope,async db=>required((await db.query("SELECT a.* FROM evals.artifact a JOIN evals.source s ON s.org_id=a.org_id AND s.project_id=a.project_id WHERE s.org_id=$1 AND s.id=$2 AND a.id=$3 AND a.state='ready' AND a.expires_at>now()",[scope.orgId,sourceId,artifactId])).rows[0]));
 const bytes=await readVerified(a.object_key,a.byte_size,a.sha256),extraction=await extractSource(bytes,a.media_type);
 return withTenant(scope,db=>idempotent(db,scope,route,key,payload,async()=>{
  required((await db.query("SELECT id FROM evals.artifact WHERE org_id=$1 AND id=$2 AND state='ready' AND expires_at>now() FOR SHARE",[scope.orgId,artifactId])).rows[0]);
  return persistSourceRevision(db,scope,sourceId,a,extraction);
 }));
}
export function addTarget(scope: EvidenceScope, projectId: string, input: {title:string;targetId?:string;config:unknown}, key: string) {
 return withTenant(scope,db=>idempotent(db,scope,`target/${projectId}`,key,input,async()=>{
  required((await db.query('SELECT id FROM evals.project WHERE org_id=$1 AND id=$2',[scope.orgId,projectId])).rows[0]);
  const config=targetConfigSchema.parse(input.config);uuidSchema.parse(config.target_revision_id);
  const targetId=input.targetId??randomUUID();
  if (input.targetId) required((await db.query('SELECT id FROM evals.target WHERE org_id=$1 AND project_id=$2 AND id=$3',[scope.orgId,projectId,targetId])).rows[0]);
  else await db.query('INSERT INTO evals.target(id,org_id,project_id,title) VALUES($1,$2,$3,$4)',[targetId,scope.orgId,projectId,input.title]);
  if ('credential' in config && config.credential.kind!=='none') {
   const bound=(await db.query(`SELECT v.id FROM evals.secret_version v JOIN evals.secret_record r ON (r.org_id,r.id)=(v.org_id,v.record_id)
    WHERE v.org_id=$1 AND v.id=$2 AND r.purpose='target' AND r.scope_id=$3 AND r.revoked_at IS NULL`,[scope.orgId,config.credential.secret_version_id,targetId])).rows[0];
   if(!bound) throw new EvidenceError(422,'Credential is not an active secret scoped to this target');
  }
  return (await db.query('INSERT INTO evals.target_revision(id,org_id,target_id,content_hash,document) VALUES($1,$2,$3,$4,$5) RETURNING id,target_id,content_hash',[config.target_revision_id,scope.orgId,targetId,sha256(canonicalJson(config)),config])).rows[0];
 }));
}
export function getSuiteVersion(scope: EvidenceScope, suiteId: string, versionId: string) {
 return withTenant(scope,async db=>required((await db.query('SELECT id,content_hash,manifest FROM evals.suite_version WHERE org_id=$1 AND suite_id=$2 AND id=$3',[scope.orgId,suiteId,versionId])).rows[0]));
}

async function extractSource(bytes:Uint8Array, mediaType:string) {
 try {return await extractText(bytes,mediaType);}
 catch {throw new EvidenceError(422,'Document is unsupported, malformed or exceeds extraction limits');}
}

function verifiedHash(value:{content_hash:string}) {
 try {verifyContentHash(value);} catch {throw new EvidenceError(422,'Content hash mismatch');}
}
function parseEvidenceBundle(input:unknown) {
 try {return parseBundle(input);} catch(error) {
  if(error instanceof z.ZodError) throw error;
  throw new EvidenceError(422,'Bundle content hash mismatch');
 }
}
