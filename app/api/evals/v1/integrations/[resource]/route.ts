import { z } from "zod";
import { authenticateCustomerToken, customerApiErrorHeaders } from "@/lib/evals/monitoring/tokens";
import { CUSTOMER_API_FIELDS, CUSTOMER_API_LIMITS, CUSTOMER_API_RESOURCES, type CustomerResource } from "@/lib/evals/monitoring/customer-api";
import { withTenant } from "@/lib/evals/repositories/db";
import { EvalError } from "@/lib/evals/domain/errors";
export const runtime="nodejs";
/** Selected columns come from the documented field lists (Settings → Developers → API reference). */
const columns=(resource:CustomerResource,alias="")=>CUSTOMER_API_FIELDS[resource].map(field=>`${alias}${field}`).join(",");
export async function GET(request:Request){
  const headers={"Cache-Control":"private, no-store","X-Robots-Tag":"noindex, nofollow"};
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
