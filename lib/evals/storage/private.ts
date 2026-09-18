import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { createSpacesClient, getSpacesRuntimeConfig } from '@/lib/storage/spaces-config';
import { MAX_SOURCE_BYTES } from './text';

function storage() {
  const config = getSpacesRuntimeConfig();
  if (!config.endpoint || !config.region || !config.accessKeyId || !config.secretAccessKey) throw new Error('Private storage unavailable');
  return { client: createSpacesClient(), bucket: config.bucket };
}
export function objectKey(orgId: string, artifactId: string, finalized = false) {
  if (![orgId, artifactId].every(v => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v))) throw new Error('Invalid object scope');
  return `evals/${orgId}/${artifactId}/${finalized ? 'sealed' : 'upload'}/${randomUUID()}`;
}
export const MAX_PRIVATE_ARTIFACT_BYTES=25*1024*1024;
export async function readVerified(key: string, expectedBytes: number, hash: string) {
  if (expectedBytes < 1 || expectedBytes > MAX_PRIVATE_ARTIFACT_BYTES) throw new Error('Invalid size');
  const { client, bucket } = storage();
  try {
  const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }), { abortSignal: AbortSignal.timeout(15000) });
  if (response.ContentLength !== expectedBytes || !response.Body) throw new Error('Object size mismatch');
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
    size += chunk.length;
    if (size > expectedBytes) throw new Error('Object exceeds declared size');
    chunks.push(Buffer.from(chunk));
  }
  const bytes = Buffer.concat(chunks);
  if (size !== expectedBytes || createHash('sha256').update(bytes).digest('hex') !== hash) throw new Error('Object checksum mismatch');
  return bytes;
  } finally {client.destroy();}
}
export async function deletePrivateObject(key:string){const {client,bucket}=storage();try{await client.send(new DeleteObjectCommand({Bucket:bucket,Key:key}),{abortSignal:AbortSignal.timeout(15000)});}finally{client.destroy();}}
/** Seal verified bytes under a fresh key; upload retries cannot mutate evidence. */
export async function sealObject(key: string, bytes: Buffer, mediaType: string) {
  const { client, bucket } = storage();
  try { await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: bytes, ContentType: mediaType, IfNoneMatch: '*' }), { abortSignal: AbortSignal.timeout(15000) }); }
  finally {client.destroy();}
}
/** App gateway writes only the server-selected pending key. Identical retries are safe. */
export async function writeUpload(key:string, bytes:Buffer, mediaType:string) {
 try { await sealObject(key,bytes,mediaType); }
 catch(error) {
  if ((error as { $metadata?: {httpStatusCode?:number} }).$metadata?.httpStatusCode!==412) throw error;
  await readVerified(key,bytes.length,createHash('sha256').update(bytes).digest('hex'));
 }
}
