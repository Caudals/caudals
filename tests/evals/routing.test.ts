import { describe,it,expect,vi,afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { proxy } from '@/proxy';
import { safeRedirectPath } from '@/lib/evals/domain/routing';
describe('evaluation host isolation',()=>{
 afterEach(()=>vi.restoreAllMocks());
 const request=(host:string,path:string,extra:Record<string,string>={})=>new NextRequest(`https://${host}${path}`,{headers:{host,...extra}});
 it('rejects unknown hosts even with a forged forwarded host',async()=>{
  expect((await proxy(request('attacker.invalid','/ops',{'x-forwarded-host':'app.caudals.com'}))).status).toBe(404);
 });
 it('rejects evaluation routes and APIs on the marketing host',async()=>{
  for(const path of ['/ops','/workspace/evaluations','/api/evals/v1/workspaces','/share/123'])expect((await proxy(request('caudals.com',path))).status).toBe(404);
 });
 it('keeps the app English and private even for Spanish geolocation',async()=>{
  const response=await proxy(request('app.caudals.com','/ops',{'cf-ipcountry':'ES','accept-language':'es'}));
  expect(response.headers.get('cache-control')).toBe('private, no-store');expect(response.headers.get('x-robots-tag')).toContain('noindex');expect(response.cookies.get('NEXT_LOCALE')).toBeUndefined();expect(response.headers.get('x-middleware-request-x-evals-surface')).toBe('1');
 });
 it('uses a server identity landing path at app root',async()=>{
  expect((await proxy(request('app.caudals.com','/'))).headers.get('x-middleware-rewrite')).toContain('/evaluation-entry');
 });
 it('rejects external, backslash and removed-surface redirects',()=>{
  for(const path of ['//evil.test','/\\evil.test','https://evil.test','/buyer','/ops\nX:test'])expect(safeRedirectPath(path)).toBe('/evaluation-entry');
  expect(safeRedirectPath('/workspace/evaluations?orgId=abc')).toBe('/workspace/evaluations?orgId=abc');
 });
});

describe('bounded API JSON',()=>{
 it('rejects duplicate keys, malformed UTF-8 and excessive nesting',async()=>{
  const {jsonBody}=await import('@/lib/evals/domain/http');
  for(const body of [Buffer.from('{"name":"a","name":"b"}'),Buffer.from([0xff]),Buffer.from('['.repeat(70)+'0'+']'.repeat(70))]){
   await expect(jsonBody(new Request('http://localhost',{method:'POST',headers:{'content-type':'application/json'},body}))).rejects.toMatchObject({code:'INPUT_INVALID'});
  }
 });
});
