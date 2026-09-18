import { createPrefixedId } from '@/lib/operator/ids';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { S3Client, CreateBucketCommand } from '@aws-sdk/client-s3';
import { describe, expect, it, vi } from 'vitest';
import { createProject, createUpload, finalizeSource, getArtifact, getSource, uploadArtifact, reviseSource, addRevision, createSuite, patchDraft, freezeSuite, getSuiteVersion } from '@/lib/evals/repositories/evidence';
import { getEvalsPool } from '@/lib/evals/repositories/db';
import { makeFixture } from './fixtures/contracts-fixtures';
import { sha256, withContentHash } from '@/lib/evals/contracts/hashing';
const dbUrl=process.env.EVALS_TEST_DATABASE_URL,endpoint=process.env.EVALS_TEST_S3_ENDPOINT;
describe.skipIf(!dbUrl||!endpoint)('live tenant-scoped evidence lifecycle',()=>{
 it('uploads, finalizes, app-downloads and revisions evidence; guessed objects fail across tenants',async()=>{
  if(!endpoint?.startsWith('http://127.0.0.1:') || !dbUrl?.includes('@127.0.0.1:')) throw new Error('Disposable services required');
  vi.stubEnv('EVALS_DATABASE_URL',process.env.EVALS_TEST_RUNTIME_DATABASE_URL??dbUrl.replace('postgres:evals_test@','evals_runtime:evals_test@'));
  vi.stubEnv('DO_SPACES_ENDPOINT',endpoint);vi.stubEnv('DO_SPACES_REGION','us-east-1');vi.stubEnv('DO_SPACES_BUCKET','evals-foundation-test');
  vi.stubEnv('DO_SPACES_ACCESS_KEY_ID','evals_test');vi.stubEnv('DO_SPACES_SECRET_ACCESS_KEY','evals_test_password');vi.stubEnv('DO_SPACES_FORCE_PATH_STYLE','true');
  const storage=new S3Client({endpoint,region:'us-east-1',forcePathStyle:true,credentials:{accessKeyId:'evals_test',secretAccessKey:'evals_test_password'}});
  try {await storage.send(new CreateBucketCommand({Bucket:'evals-foundation-test'}));} catch(error) {if(!['BucketAlreadyOwnedByYou','BucketAlreadyExists'].includes((error as Error).name))throw error;} finally{storage.destroy();}
  const admin=new Pool({connectionString:dbUrl,max:1}),actorId=createPrefixedId('au'),orgId=randomUUID(),otherOrg=randomUUID();
  try {
   await admin.query('INSERT INTO public.auth_user(id,name,email,"emailVerified","updatedAt") VALUES($1,$1,$2,true,now())',[actorId,`${actorId}@example.test`]);
   await admin.query("INSERT INTO evals.workspace(id,name,created_by) VALUES($1,'evidence lifecycle A',$3),($2,'evidence lifecycle B',$3)",[orgId,otherOrg,actorId]);
   const scope={orgId,actorId},other={orgId:otherOrg,actorId};
   const project=await createProject(scope,{title:'Lifecycle',description:''},randomUUID());
   const bytes=Buffer.from('This source supports an evidence-backed answer.');
   const input={projectId:project.id,title:'Source',mediaType:'text/plain',byteSize:bytes.length,sha256:sha256(bytes),rights:'customer_owned' as const,visibility:'candidate' as const};
   const key=randomUUID(),upload=await createUpload(scope,input,key);
   expect(upload.uploadUrl).toMatch(/^\/api\/evals\/v1\/artifacts\//);
   expect(await createUpload(scope,input,key)).toEqual(upload);
   await expect(createUpload(scope,{...input,title:'changed'},key)).rejects.toMatchObject({status:409});
   await expect(uploadArtifact(other,upload.artifactId,bytes)).rejects.toMatchObject({status:404});
   await uploadArtifact(scope,upload.artifactId,bytes);
   const finalizeKey=randomUUID(),ready=await finalizeSource(scope,upload.sourceId,finalizeKey);
   expect(await finalizeSource(scope,upload.sourceId,finalizeKey)).toEqual(ready);
   await expect(getArtifact(other,upload.artifactId)).rejects.toMatchObject({status:404});
   await expect(getSource(other,upload.sourceId)).rejects.toMatchObject({status:404});
   await expect(finalizeSource(other,upload.sourceId,randomUUID())).rejects.toMatchObject({status:404});
   expect((await getArtifact(scope,upload.artifactId)).bytes).toEqual(bytes);
   const source=await getSource(scope,upload.sourceId);expect(source.chunks[0].excerpt).toBe(bytes.toString());
   const revision=await reviseSource(scope,upload.sourceId,upload.artifactId,randomUUID());expect(revision.revisionId).not.toBe(ready.revisionId);
   expect((await getSource(scope,upload.sourceId)).revisions).toHaveLength(2);
   await expect(uploadArtifact(scope,upload.artifactId,bytes)).rejects.toMatchObject({status:404});
   for(const name of ['single-turn-arithmetic','deterministic-tool-call'] as const) {
    const fixture=makeFixture(name);
    const rubric=withContentHash({...fixture.rubrics[0],revision_id:randomUUID()});
    await addRevision(scope,project.id,{kind:'rubric',document:rubric},randomUUID());
    const output=withContentHash({...fixture.output_schemas[0],id:randomUUID()});
    await addRevision(scope,project.id,{kind:'output_schema',document:output},randomUUID());
    const tools=fixture.fixtures.map(f=>withContentHash({...f,revision_id:randomUUID()}));
    for(const tool of tools) await addRevision(scope,project.id,{kind:'tool_fixture',document:tool},randomUUID());
    const c=withContentHash({...fixture.cases[0],case_id:randomUUID(),revision_id:randomUUID(),scenario:{...fixture.cases[0].scenario,attachments:[{path:upload.artifactPath,sha256:input.sha256,size_bytes:bytes.length,media_type:'text/plain',visibility:'candidate' as const}]},reference:{...fixture.cases[0].reference,rubric_revision_id:rubric.revision_id,source_refs:[{source_revision_id:ready.revisionId,anchor:source.chunks[0].id}],graders:fixture.cases[0].reference.graders.map(g=>g.kind==='json_schema'?{...g,schema_ref:output.id}:g)}});
    await addRevision(scope,project.id,{kind:'case',document:c},randomUUID());
    const suite=await createSuite(scope,{projectId:project.id,title:'Release'},randomUUID());
    const manifest=withContentHash({...fixture.manifest,suite_id:suite.id,suite_version_id:randomUUID(),files:[{path:upload.artifactPath,sha256:input.sha256,size_bytes:bytes.length}],output_schema_revisions:[{revision_id:output.id,content_hash:output.content_hash}],fixture_revisions:tools.map(t=>({revision_id:t.revision_id,content_hash:t.content_hash})),case_revisions:[{case_id:c.case_id,revision_id:c.revision_id,content_hash:c.content_hash,family_id:c.family_id,split:c.split,weight:c.weight}],source_revisions:[{revision_id:ready.revisionId,content_hash:ready.contentHash}],rubric_revisions:[{revision_id:rubric.revision_id,content_hash:rubric.content_hash}]});
    await patchDraft(scope,suite.id,1,manifest);
    await expect(patchDraft(scope,suite.id,1,manifest)).rejects.toMatchObject({status:409});
    const frozen=await freezeSuite(scope,suite.id,2,randomUUID());
    const revised=withContentHash({...c,revision_id:randomUUID(),title:'A new case revision'});
    await addRevision(scope,project.id,{kind:'case',document:revised},randomUUID());
    const stored=await getSuiteVersion(scope,suite.id,frozen.id);
    expect(stored.manifest.case_revisions[0].revision_id).toBe(c.revision_id);
    expect(stored.manifest.output_schema_revisions[0].revision_id).toBe(output.id);
    expect(stored.manifest.fixture_revisions).toHaveLength(tools.length);
    await expect(getSuiteVersion(other,suite.id,frozen.id)).rejects.toMatchObject({status:404});
   }

  } finally {await admin.end();await getEvalsPool().end();vi.unstubAllEnvs();}
 },30000);
});
