import { z } from "zod";
import { authenticateCustomerToken, customerApiErrorHeaders, customerApiErrorResponse } from "@/lib/evals/monitoring/tokens";
import { CUSTOMER_API_FIELDS, CUSTOMER_API_LIMITS, CUSTOMER_API_RESOURCES, type CustomerResource } from "@/lib/evals/monitoring/customer-api";
import { integrationsV2Enabled } from "@/lib/evals/monitoring/integrations-flag";
import { startApiRun } from "@/lib/evals/monitoring/ci-runs";
import { withTenant } from "@/lib/evals/repositories/db";
import { EvalError } from "@/lib/evals/domain/errors";
import { jsonBody } from "@/lib/evals/domain/http";
export const runtime="nodejs";
const headers={"Cache-Control":"private, no-store","X-Robots-Tag":"noindex, nofollow"};
/** Selected columns come from the documented field lists (Settings → Developers → API reference). */
const columns=(resource:CustomerResource,alias="")=>CUSTOMER_API_FIELDS[resource].map(field=>`${alias}${field}`).join(",");
export async function GET(request:Request){
  try{
    const url=new URL(request.url),orgId=z.uuid().parse(url.searchParams.get("orgId")),
      resource=url.pathname.split("/").at(-1) as CustomerResource;
    if(!Object.hasOwn(CUSTOMER_API_RESOURCES,resource))throw new EvalError("SCOPE_DENIED",404);
    await authenticateCustomerToken(orgId,request.headers.get("authorization"),CUSTOMER_API_RESOURCES[resource]);
    const limit=CUSTOMER_API_LIMITS.listItems;
    const data=await withTenant({orgId,actorId:"customer-api-token"},async db=>{
      if(resource==="runs")return (await db.query(`SELECT ${columns("runs")} FROM evals.run WHERE org_id=$1 ORDER BY created_at DESC,id DESC LIMIT ${limit}`,[orgId])).rows;
      if(resource==="reports")return (await db.query(`SELECT ${columns("reports","r.")}
        FROM evals.report r WHERE r.org_id=$1 AND r.publication_status='published'
        ORDER BY r.updated_at DESC,r.id DESC LIMIT ${limit}`,[orgId])).rows;
      return (await db.query(`SELECT ${columns("schedules")} FROM evals.monitor_schedule
        WHERE org_id=$1 ORDER BY updated_at DESC,id DESC LIMIT ${limit}`,[orgId])).rows;
    });
    return Response.json({data},{headers});
  }catch(error){
    const known=error instanceof EvalError;
    return Response.json({error:{code:known?error.code:"INPUT_INVALID"}},{status:known?error.status:400,headers:{...headers,...customerApiErrorHeaders(error)}});
  }
}
/**
 * CI trigger (launch L-19, P-27): `POST /integrations/runs?orgId=…` with a
 * `runs:write` token, an Idempotency-Key and `{suiteVersionId,
 * targetRevisionId[, evaluationId]}`. 201 with the new run, 200 with the same
 * run when the key is replayed. Behind INTEGRATIONS_V2_ENABLED (404 when off).
 */
export async function POST(request:Request){
  try{
    const url=new URL(request.url);
    if(url.pathname.split("/").at(-1)!=="runs"||!integrationsV2Enabled())throw new EvalError("SCOPE_DENIED",404);
    const orgId=z.uuid().parse(url.searchParams.get("orgId"));
    const {tokenId}=await authenticateCustomerToken(orgId,request.headers.get("authorization"),"runs:write");
    const run=await startApiRun(orgId,tokenId,await jsonBody(request,8192),request.headers.get("idempotency-key"));
    return Response.json({data:run},{status:run.replayed?200:201,headers});
  }catch(error){return customerApiErrorResponse(error,headers);}
}
