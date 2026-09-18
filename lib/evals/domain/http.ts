import "server-only";
import { randomUUID } from "node:crypto";
import { ZodError } from "zod";
import { parseJsonBytes } from "../contracts/bundle";
import { EvalError } from "./errors";
import { requireIdentity, type EvalIdentity } from "./identity";
export { requireWorkspace } from "./identity";
export { EvalError } from "./errors";
export const privateHeaders = { 'Cache-Control':'private, no-store', 'X-Robots-Tag':'noindex, nofollow', 'Referrer-Policy':'no-referrer' };
export function api(handler:(request:Request,identity:EvalIdentity)=>Promise<unknown>) {
  return async(request:Request) => {
    const requestId=randomUUID();
    try {
      const identity=await requireIdentity(request.headers);
      if(!['GET','HEAD'].includes(request.method)) {
        const origin=request.headers.get('origin');
        const host=request.headers.get('host');
        if(!origin || new URL(origin).host!==host || (process.env.NODE_ENV==='production' && new URL(origin).protocol!=='https:')) throw new EvalError('SCOPE_DENIED',403);
      }
      const data=await handler(request,identity);
      if(data instanceof Response) { for(const [key,value] of Object.entries(privateHeaders)) data.headers.set(key,value); return data; }
      return Response.json({data,meta:{request_id:requestId}},{headers:privateHeaders});
    } catch(error) {
      const known=error instanceof EvalError;
      const validation=error instanceof ZodError || error instanceof SyntaxError;
      return Response.json({error:{code:known?error.code:validation?'INPUT_INVALID':'SERVICE_UNAVAILABLE',message:known?error.message:validation?'Check the supplied fields.':'The service is temporarily unavailable.',field_errors:error instanceof ZodError?error.issues.map(x=>({path:x.path,message:x.message})):[],request_id:requestId,retryable:!known&&!validation}},{status:known?error.status:validation?400:503,headers:privateHeaders});
    }
  };
}
export async function jsonBody(request:Request,maxBytes=65536):Promise<unknown> {
  if(!request.headers.get('content-type')?.startsWith('application/json')) throw new EvalError('INPUT_INVALID',415,'JSON is required.');
  const reader=request.body?.getReader(); if(!reader) throw new EvalError('INPUT_INVALID',400);
  const chunks:Uint8Array[]=[];let size=0;
  try { while(true){const {done,value}=await reader.read();if(done) break;size+=value.byteLength;if(size>maxBytes) {await reader.cancel();throw new EvalError('INPUT_INVALID',413,'Request is too large.');}chunks.push(value);} } finally {reader.releaseLock();}
  try { return parseJsonBytes(Buffer.concat(chunks),maxBytes); } catch { throw new EvalError('INPUT_INVALID',400,'Supply bounded, valid UTF-8 JSON without duplicate fields.'); }
}
