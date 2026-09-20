import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { z } from 'zod';

export interface SecretScope { orgId: string; recordId: string; versionId: string; purpose: 'provider'|'target'|'webhook'; scopeId: string }
const sealedSchema = z.object({iv:z.string(),tag:z.string(),data:z.string()}).strict();
const envelopeSchema = z.object({algorithm:z.literal('aes-256-gcm'),keyVersion:z.string(),wrappedKey:sealedSchema,value:sealedSchema}).strict();
export type Envelope = z.infer<typeof envelopeSchema>;
export type Keyring = ReadonlyMap<string, Buffer>;
function aad(scope: SecretScope, keyVersion: string, component: string): Buffer {
  return Buffer.from(JSON.stringify(['evals-secret-v1',scope.orgId,scope.recordId,scope.versionId,scope.purpose,scope.scopeId,keyVersion,component]));
}
function seal(key: Buffer, value: Buffer, associated: Buffer) {
  const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm',key,iv); cipher.setAAD(associated);
  const data=Buffer.concat([cipher.update(value),cipher.final()]);
  return {iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:data.toString('base64')};
}
function open(key: Buffer, value: z.infer<typeof sealedSchema>, associated: Buffer): Buffer {
  const iv = Buffer.from(value.iv,'base64'), tag = Buffer.from(value.tag,'base64');
  if(iv.length!==12 || tag.length!==16) throw new Error('invalid_envelope');
  const cipher = createDecipheriv('aes-256-gcm',key,iv); cipher.setAAD(associated); cipher.setAuthTag(tag);
  return Buffer.concat([cipher.update(Buffer.from(value.data,'base64')),cipher.final()]);
}
export function encryptSecret(value: Buffer, scope: SecretScope, keyVersion: string, keys: Keyring): Envelope {
  const master=keys.get(keyVersion); if(master?.length!==32) throw new Error('master_key_unavailable');
  const dataKey=randomBytes(32);
  try { return {algorithm:'aes-256-gcm',keyVersion,wrappedKey:seal(master,dataKey,aad(scope,keyVersion,'key')),value:seal(dataKey,value,aad(scope,keyVersion,'value'))}; }
  finally { dataKey.fill(0); }
}
export function decryptSecret(raw: unknown, scope: SecretScope, keys: Keyring): Buffer {
  let key:Buffer|undefined;
  try { const e=envelopeSchema.parse(raw); const master=keys.get(e.keyVersion); if(master?.length!==32) throw new Error();
    key=open(master,e.wrappedKey,aad(scope,e.keyVersion,'key')); return open(key,e.value,aad(scope,e.keyVersion,'value'));
  } catch { throw new Error('secret_unavailable'); } finally {key?.fill(0);}
}
/** JSON {"key-version":"base64-32-byte-key"}; mounted outside the database. */
export function loadKeyring(file: string): Keyring {
  const raw=z.record(z.string(),z.string()).parse(JSON.parse(readFileSync(file,'utf8')));
  const keys=new Map(Object.entries(raw).map(([version,key])=>[version,Buffer.from(key,'base64')]));
  if(!keys.size || [...keys.values()].some(key=>key.length!==32)) throw new Error('invalid_master_key_file');
  return keys;
}
