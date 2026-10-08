import { randomUUID } from "node:crypto";
import { z } from "zod";
import { jsonBody,privateHeaders } from "@/lib/evals/domain/http";
import { shareExport } from "@/lib/evals/repositories/managed";
import { reportDownloadName } from "@/lib/evals/reports/file-name";
export const runtime="nodejs";
/**
 * Downloads for a private share link. The token travels in the body, never the
 * URL. Returns the file, or 202 while the share's PDF is still rendering.
 */
export async function POST(request:Request){const requestId=randomUUID(),headers={...privateHeaders,"Content-Security-Policy":"default-src 'self'; frame-ancestors 'none'","Referrer-Policy":"no-referrer"};try{const origin=request.headers.get("origin"),host=request.headers.get("host");if(!origin||new URL(origin).host!==host)throw new Error("denied");const {token,kind,locale}=z.strictObject({token:z.string().regex(/^[A-Za-z0-9_-]{43}$/),kind:z.enum(["pdf","docx","csv","cef"]),locale:z.enum(["en","es"]).default("en")}).parse(await jsonBody(request,1024));const result=await shareExport(token,requestId,kind,locale);if(result.status==="preparing")return Response.json({data:{status:"preparing"},meta:{request_id:requestId}},{status:202,headers});if(result.status==="failed")return Response.json({error:{code:"EXPORT_FAILED",message:"This file could not be prepared. Try again in a few minutes.",request_id:requestId,retryable:true}},{status:503,headers});return new Response(new Uint8Array(result.bytes),{headers:{...headers,"Content-Type":result.mediaType,"Content-Disposition":`attachment; filename="${reportDownloadName(result.revisionId,result.mediaType,result.title)}"`,"Content-Length":String(result.bytes.length),"X-Content-Type-Options":"nosniff"}});}catch{return Response.json({error:{code:"SHARE_UNAVAILABLE",message:"This private report link is invalid, expired or revoked.",request_id:requestId,retryable:false}},{status:404,headers});}}
