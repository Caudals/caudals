import { z } from "zod";
import { api,jsonBody,requireWorkspace,EvalError } from "@/lib/evals/domain/http";
import { createAccountCrmDraft,createCrmHandoffDraft,createSnapshotCrmDraft,listCrmHandoffDrafts } from "@/lib/evals/monitoring/crm";
import { requireSnapshotOperator } from "@/lib/evals/repositories/prospects";
export const runtime="nodejs";
export const GET=api(async(request,identity)=>{
  if(!identity.platformRole)throw new EvalError("SCOPE_DENIED",404);
  const orgId=z.uuid().parse(new URL(request.url).searchParams.get("orgId"));
  await requireWorkspace(identity,orgId,"manage");return listCrmHandoffDrafts({orgId,actorId:identity.user.id});
});
// Every variant only writes a draft for the operator to review and copy into
// Warmbly; nothing is sent and no contact or campaign changes (launch L-21).
const reviewed=z.strictObject({orgId:z.uuid(),reportRevisionId:z.uuid()});
const snapshot=z.strictObject({prospectSnapshotId:z.uuid(),outreach:z.strictObject({locale:z.enum(["en","es"]),linkedin:z.string(),emailSubject:z.string(),emailBody:z.string()})});
const account=z.strictObject({orgId:z.uuid(),source:z.literal("growth")});
export const POST=api(async(request,identity)=>{
  if(!identity.platformRole)throw new EvalError("SCOPE_DENIED",404);
  const raw=await jsonBody(request);
  const asSnapshot=snapshot.safeParse(raw);
  if(asSnapshot.success){
    requireSnapshotOperator(identity);
    return createSnapshotCrmDraft(identity.user.id,asSnapshot.data.prospectSnapshotId,asSnapshot.data.outreach);
  }
  const asAccount=account.safeParse(raw);
  if(asAccount.success){
    await requireWorkspace(identity,asAccount.data.orgId,"manage");
    return createAccountCrmDraft({orgId:asAccount.data.orgId,actorId:identity.user.id});
  }
  const body=reviewed.parse(raw);
  await requireWorkspace(identity,body.orgId,"manage");
  return createCrmHandoffDraft({orgId:body.orgId,actorId:identity.user.id},body.reportRevisionId);
});
