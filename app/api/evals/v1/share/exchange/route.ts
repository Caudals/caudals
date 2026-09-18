import { randomUUID } from "node:crypto";
import { z } from "zod";
import { jsonBody,privateHeaders } from "@/lib/evals/domain/http";
import { resolveShare } from "@/lib/evals/repositories/managed";
export const runtime="nodejs";
export async function POST(request:Request){const requestId=randomUUID(),headers={...privateHeaders,"Content-Security-Policy":"default-src 'self'; frame-ancestors 'none'","Referrer-Policy":"no-referrer"};try{const origin=request.headers.get("origin"),host=request.headers.get("host");if(!origin||new URL(origin).host!==host)throw new Error("denied");const {token}=z.strictObject({token:z.string().regex(/^[A-Za-z0-9_-]{43}$/)}).parse(await jsonBody(request,1024));const data=await resolveShare(token,requestId);return Response.json({data,meta:{request_id:requestId}},{headers});}catch{return Response.json({error:{code:"SHARE_UNAVAILABLE",message:"This private report link is invalid, expired or revoked.",request_id:requestId,retryable:false}},{status:404,headers});}}
