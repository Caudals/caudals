import { z } from "zod";
import { authenticateCustomerToken } from "@/lib/evals/monitoring/tokens";
import { withTenant } from "@/lib/evals/repositories/db";
import { EvalError } from "@/lib/evals/domain/errors";
export const runtime="nodejs";
export async function GET(request:Request){
  const headers={"Cache-Control":"private, no-store","X-Robots-Tag":"noindex, nofollow"};
  try{
    const url=new URL(request.url),orgId=z.uuid().parse(url.searchParams.get("orgId")),
      scheduleId=z.uuid().parse(url.pathname.split("/").at(-1));
    await authenticateCustomerToken(orgId,request.headers.get("authorization"),"runs:read");
    const result=await withTenant({orgId,actorId:"customer-api-token"},async db=>{
      const schedule=(await db.query("SELECT id FROM evals.monitor_schedule WHERE org_id=$1 AND id=$2",[orgId,scheduleId])).rows[0];
      if(!schedule)throw new EvalError("SCOPE_DENIED",404);
      const latest=(await db.query(`SELECT d.id,d.scheduled_for,d.run_id,d.status AS dispatch_status,d.reason_code,
        a.status AS outcome,a.reason_codes AS outcome_reasons FROM evals.schedule_dispatch d
        LEFT JOIN evals.regression_alert a ON (a.org_id,a.schedule_dispatch_id)=(d.org_id,d.id)
        WHERE d.org_id=$1 AND d.schedule_id=$2 ORDER BY d.scheduled_for DESC,d.id DESC LIMIT 1`,[orgId,scheduleId])).rows[0];
      return latest?{schedule_id:scheduleId,dispatch_id:latest.id,scheduled_for:latest.scheduled_for,
        run_id:latest.run_id,status:latest.outcome??(latest.dispatch_status==="skipped"||latest.dispatch_status==="failed"?"unknown":"pending"),
        reason_codes:latest.outcome_reasons??(latest.reason_code?[latest.reason_code]:[])}:
        {schedule_id:scheduleId,status:"pending",reason_codes:["no_dispatch_yet"]};
    });
    return Response.json({data:result},{headers});
  }catch(error){const known=error instanceof EvalError;
    return Response.json({error:{code:known?error.code:"INPUT_INVALID"}},{status:known?error.status:400,headers});}
}
