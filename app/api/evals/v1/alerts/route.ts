import { z } from "zod";
import { api,requireWorkspace } from "@/lib/evals/domain/http";
import { withTenant } from "@/lib/evals/repositories/db";
export const runtime="nodejs";
export const GET=api(async(request,identity)=>{
  const orgId=z.uuid().parse(new URL(request.url).searchParams.get("orgId"));
  await requireWorkspace(identity,orgId,"read");
  return withTenant({orgId,actorId:identity.user.id},async db=>(await db.query(`SELECT a.id,a.schedule_dispatch_id,
    d.schedule_id,d.scheduled_for,a.baseline_run_id,a.candidate_run_id,a.comparison_id,
    a.status,a.reason_codes,a.created_at FROM evals.regression_alert a
    JOIN evals.schedule_dispatch d ON (d.org_id,d.id)=(a.org_id,a.schedule_dispatch_id)
    WHERE a.org_id=$1 ORDER BY a.created_at DESC,a.id DESC LIMIT 100`,[orgId])).rows);
});
