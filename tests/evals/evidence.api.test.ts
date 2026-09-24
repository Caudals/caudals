import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({requireIdentity:vi.fn(),requireWorkspace:vi.fn(),getArtifact:vi.fn(),uploadArtifact:vi.fn(),getSource:vi.fn(),createUpload:vi.fn()}));
vi.mock('@/lib/evals/domain/identity',()=>({requireIdentity:mocks.requireIdentity,requireWorkspace:mocks.requireWorkspace}));
vi.mock('@/lib/evals/repositories/evidence',()=>({getArtifact:mocks.getArtifact,uploadArtifact:mocks.uploadArtifact,getSource:mocks.getSource,createUpload:mocks.createUpload}));
import { GET } from '@/app/api/evals/v1/artifacts/[id]/route';
import { PUT } from '@/app/api/evals/v1/artifacts/[id]/upload/route';
import { POST } from '@/app/api/evals/v1/sources/uploads/route';
import { EvalError } from '@/lib/evals/domain/errors';
const org='11111111-1111-4111-8111-111111111111',id='22222222-2222-4222-8222-222222222222';
beforeEach(()=>{
 vi.clearAllMocks();
 mocks.requireIdentity.mockResolvedValue({user:{id:'actor'},platformRole:null,workspaces:[{id:org,role:'editor'}]});
 mocks.requireWorkspace.mockImplementation(async(_identity,scope,action)=>{if(scope!==org || action!=='write') throw new EvalError('SCOPE_DENIED',404);});
 mocks.getArtifact.mockResolvedValue({id,bytes:Buffer.from('private evidence')});
 mocks.uploadArtifact.mockResolvedValue({id,uploaded:true});
});
describe('private artifact gateway authorization',()=>{
 it('returns private attachment bytes without a storage endpoint or object key',async()=>{
  const response=await GET(new Request(`https://evals.test/api/evals/v1/artifacts/${id}?orgId=${org}`));
  expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toBe('private, no-store');
  expect(response.headers.get('content-disposition')).toContain('attachment');expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  expect(await response.text()).toBe('private evidence');
  expect(mocks.getArtifact).toHaveBeenCalledWith({orgId:org,actorId:'actor'},id);
 });
 it('changing tenant headers cannot authorize a guessed object in another workspace',async()=>{
  const response=await GET(new Request(`https://evals.test/api/evals/v1/artifacts/${id}?orgId=${id}`,{headers:{'x-org-id':org}}));
  expect(response.status).toBe(404);expect(mocks.getArtifact).not.toHaveBeenCalled();
 });
 it('checks upload scope before reading body or reaching storage',async()=>{
  const response=await PUT(new Request(`https://evals.test/api/evals/v1/artifacts/${id}/upload?orgId=${id}`,{method:'PUT',headers:{origin:'https://evals.test',host:'evals.test'},body:'data'}));
  expect(response.status).toBe(404);expect(mocks.uploadArtifact).not.toHaveBeenCalled();
 });
 it('rejects oversized gateway bodies without writing storage',async()=>{
  const response=await PUT(new Request(`https://evals.test/api/evals/v1/artifacts/${id}/upload?orgId=${org}`,{method:'PUT',headers:{origin:'https://evals.test',host:'evals.test'},body:'x'.repeat(25000001)}));
  expect(response.status).toBe(413);expect(mocks.uploadArtifact).not.toHaveBeenCalled();
 });
 it('validates document format honestly before creating an upload session',async()=>{
  const response=await POST(new Request('https://evals.test/api/evals/v1/sources/uploads',{method:'POST',headers:{origin:'https://evals.test',host:'evals.test','content-type':'application/json'},body:JSON.stringify({orgId:org,projectId:id,title:'PDF',mediaType:'application/pdf',byteSize:10,sha256:'a'.repeat(64),rights:'customer_owned'})}));
  expect(response.status).toBe(400);expect(mocks.createUpload).not.toHaveBeenCalled();
 });
});
