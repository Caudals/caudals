import { recordProductEvent } from "@/lib/analytics/funnel-events-server";
import { captureServerError } from "@/lib/observability/capture";
import "server-only";
import { randomUUID } from "node:crypto";
import { ZodError } from "zod";
import { parseJsonBytes } from "../contracts/bundle";
import { EvalError, inputError, PlanLimitError } from "./errors";
import { requireIdentity, type EvalIdentity } from "./identity";
import { typedPlanLimit } from "./plan-limits";
import { resolveInterfaceLocale } from "../interface-locale";
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
      if(data instanceof Response) { for(const [key,value] of Object.entries(privateHeaders)) if(!(key==='Cache-Control' && /\bno-store\b/.test(data.headers.get(key)??''))) data.headers.set(key,value); return data; }
      return Response.json({data,meta:{request_id:requestId}},{headers:privateHeaders});
    } catch(caught) {
      const error=(await typedPlanLimit(caught))??inputError(caught)??caught;
      const known=error instanceof EvalError;
      const validation=error instanceof ZodError || error instanceof SyntaxError;
      const code=known?error.code:validation?'INPUT_INVALID':'SERVICE_UNAVAILABLE';
      const status=known?error.status:validation?400:503;
      if (["BUDGET_PAUSED", "LIMIT_EXCEEDED", "PLAN_LIMIT", "PAYMENT_REQUIRED"].includes(code) || error instanceof PlanLimitError) {
        await recordProductEvent({ eventName: "limit_hit", source: "server", path: new URL(request.url).pathname, orgId: error instanceof PlanLimitError ? error.orgId : undefined, payload: { kind: code } });
      }
      const databaseCode =
        typeof error === "object" && error !== null && "code" in error &&
        typeof error.code === "string" && /^[0-9A-Z]{5}$/.test(error.code)
          ? error.code
          : undefined;
      // Correlate failures without putting exception text, SQL, credentials or
      // customer data in application logs.
      console.error("eval_api_request_failed",{request_id:requestId,code,status,error_type:error instanceof Error?error.name:typeof error,database_code:databaseCode});
      // Unexpected failures (503) go to Sentry, scrubbed; expected codes do not.
      if(!known&&!validation)captureServerError(error,{request_id:requestId,route:new URL(request.url).pathname,method:request.method,code,database_code:databaseCode});
      const message=known?error.message:validation?'Check the supplied fields.':'The service is temporarily unavailable.';
      // A link opened in the browser (a download or a file in a new tab) gets a page in the reader's language, not JSON.
      if(isBrowserNavigation(request)) { const page=await errorPage(request,status,code,message,requestId).catch(()=>null); if(page) return page; }
      return Response.json({error:{code,message,field_errors:error instanceof ZodError?error.issues.map(x=>({path:x.path,message:x.message})):[],request_id:requestId,retryable:!known&&!validation,...(error instanceof PlanLimitError?{limit:error.view()}:{})}},{status,headers:privateHeaders});
    }
  };
}
/** A GET the browser makes to show a page (a link, a new tab), never a fetch from the app or an integration. */
export function isBrowserNavigation(request:Request):boolean {
  return request.method==='GET' && request.headers.get('sec-fetch-mode')==='navigate' && (request.headers.get('sec-fetch-dest') ?? 'document')==='document';
}
const escapeHtml=(value:string)=>value.replace(/[&<>"']/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]!);
/** The API error as a small page in the reader's language (launch L-23b); the status and headers stay those of the API. */
export async function errorPage(request:Request,status:number,code:string,message:string,requestId:string):Promise<Response> {
  // Loaded only for this page, so API routes do not carry the message catalogues.
  const { API_ERROR_PAGE, API_ERROR_REFERENCE, apiErrorText } = await import("../messages/api-errors");
  const cookie=request.headers.get('cookie')?.match(/(?:^|;\s*)caudals_locale=(en|es)(?:;|$)/)?.[1];
  const locale=resolveInterfaceLocale(cookie,request.headers.get('accept-language'));
  const copy=API_ERROR_PAGE[locale];
  const text=apiErrorText(code,message,locale);
  const reference=API_ERROR_REFERENCE[locale].replace('{id}',requestId);
  const html=`<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${escapeHtml(copy.title)} · Caudals</title></head>`+
    `<body style="font-family:system-ui,sans-serif;max-width:36rem;margin:15vh auto;padding:0 16px;line-height:1.5;color:#1a1a1a;background:#fff">`+
    `<h1 style="font-size:1.25rem">${escapeHtml(copy.title)}</h1><p>${escapeHtml(text)}</p><p style="color:#555;font-size:.875rem">${escapeHtml(reference)}</p>`+
    `<p><a href="/workspace">${escapeHtml(copy.back)}</a></p></body></html>`;
  return new Response(html,{status,headers:{...privateHeaders,'Content-Type':'text/html; charset=utf-8'}});
}
export async function jsonBody(request:Request,maxBytes=65536):Promise<unknown> {
  if(!request.headers.get('content-type')?.startsWith('application/json')) throw new EvalError('INPUT_INVALID',415,'JSON is required.');
  const reader=request.body?.getReader(); if(!reader) throw new EvalError('INPUT_INVALID',400);
  const chunks:Uint8Array[]=[];let size=0;
  try { while(true){const {done,value}=await reader.read();if(done) break;size+=value.byteLength;if(size>maxBytes) {await reader.cancel();throw new EvalError('INPUT_INVALID',413,'Request is too large.');}chunks.push(value);} } finally {reader.releaseLock();}
  try { return parseJsonBytes(Buffer.concat(chunks),maxBytes); } catch { throw new EvalError('INPUT_INVALID',400,'Supply bounded, valid UTF-8 JSON without duplicate fields.'); }
}
