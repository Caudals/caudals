import { z } from "zod";
import { authenticateCustomerToken, type CustomerTokenScope } from "@/lib/evals/monitoring/tokens";
import { withTenant } from "@/lib/evals/repositories/db";
import { EvalError } from "@/lib/evals/domain/errors";
export const runtime="nodejs";
const resources={runs:"runs:read",reports:"reports:read",schedules:"schedules:read"} as const;
export async function GET(request:Request){
  const headers={"Cache-Control":"private, no-store","X-Robots-Tag":"noindex, nofollow"};
  try{
    const url=new URL(request.url),orgId=z.uuid().parse(url.searchParams.get("orgId")),
      resource=url.pathname.split("/").at(-1) as keyof typeof resources;
    if(!Object.hasOwn(resources,resource))throw new EvalError("SCOPE_DENIED",404);
    await authenticateCustomerToken(orgId,request.headers.get("authorization"),resources[resource] as CustomerTokenScope);
    const data=await withTenant({orgId,actorId:"customer-api-token"},async db=>{
      if(resource==="runs")return (await db.query(`SELECT id,evaluation_id,target_revision_id,suite_version_id,status,phase,
        reason_code,created_at,updated_at FROM evals.run WHERE org_id=$1 ORDER BY created_at DESC,id DESC LIMIT 100`,[orgId])).rows;
      if(resource==="reports")return (await db.query(`SELECT r.id,r.title,r.current_revision_id,r.updated_at
        FROM evals.report r WHERE r.org_id=$1 AND r.publication_status='published'
        ORDER BY r.updated_at DESC,r.id DESC LIMIT 100`,[orgId])).rows;
      return (await db.query(`SELECT id,evaluation_id,target_revision_id,suite_version_id,status,next_due_at,
        timezone,cadence,local_time,weekday,day_of_month,version FROM evals.monitor_schedule
        WHERE org_id=$1 ORDER BY updated_at DESC,id DESC LIMIT 100`,[orgId])).rows;
    });
    return Response.json({data},{headers});
  }catch(error){
    const known=error instanceof EvalError;
    return Response.json({error:{code:known?error.code:"INPUT_INVALID"}},{status:known?error.status:400,headers});
  }
}
