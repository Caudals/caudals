import { randomUUID, createHash } from 'node:crypto';
import { CreateBucketCommand, DeleteObjectCommand, GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { describe, expect, it, vi } from 'vitest';
import { objectKey, readVerified, sealObject, writeUpload } from '@/lib/evals/storage/private';
const endpoint=process.env.EVALS_TEST_S3_ENDPOINT;
describe.skipIf(!endpoint)('private S3 upload/finalize/get',()=>{
 it('checks hash and bounds, keeps sealed bytes immutable after upload replay, and rejects anonymous reads',async()=>{
  if (!endpoint?.startsWith('http://127.0.0.1:')) throw new Error('Disposable local endpoint required');
  const bucket='evals-foundation-test';
  vi.stubEnv('DO_SPACES_ENDPOINT',endpoint);vi.stubEnv('DO_SPACES_REGION','us-east-1');vi.stubEnv('DO_SPACES_BUCKET',bucket);
  vi.stubEnv('DO_SPACES_ACCESS_KEY_ID','evals_test');vi.stubEnv('DO_SPACES_SECRET_ACCESS_KEY','evals_test_password');vi.stubEnv('DO_SPACES_FORCE_PATH_STYLE','true');
  const client=new S3Client({endpoint,region:'us-east-1',forcePathStyle:true,credentials:{accessKeyId:'evals_test',secretAccessKey:'evals_test_password'}});
  try {await client.send(new CreateBucketCommand({Bucket:bucket}));} catch(e) {if(!['BucketAlreadyOwnedByYou','BucketAlreadyExists'].includes((e as Error).name)) throw e;}
  const org=randomUUID(),id=randomUUID(),key=objectKey(org,id),sealed=objectKey(org,id,true);
  const bytes=Buffer.from('Evidence with source anchors.');const hash=createHash('sha256').update(bytes).digest('hex');
  try {
   await writeUpload(key,bytes,'text/plain');
   await writeUpload(key,bytes,'text/plain');
   expect(await readVerified(key,bytes.length,hash)).toEqual(bytes);
   await expect(readVerified(key,bytes.length,'0'.repeat(64))).rejects.toThrow('checksum');
   await expect(readVerified(key,bytes.length+1,hash)).rejects.toThrow('size');
   await sealObject(sealed,bytes,'text/plain');
   await expect(sealObject(sealed,bytes,'text/plain')).rejects.toThrow();
   expect((await fetch(`${endpoint}/${bucket}/${sealed}`)).ok).toBe(false);
   expect(await readVerified(sealed,bytes.length,hash)).toEqual(bytes);
   await client.send(new GetObjectCommand({Bucket:bucket,Key:sealed}));
  } finally {await Promise.all([key,sealed].map(Key=>client.send(new DeleteObjectCommand({Bucket:bucket,Key}))));client.destroy();vi.unstubAllEnvs();}
 },20000);
});
