import { z } from "zod";
import { api,EvalError,jsonBody,requireWorkspace } from "@/lib/evals/domain/http";
import { createTargetAwareRun } from "@/lib/evals/repositories/managed";
import { listEvaluationRuns } from "@/lib/evals/repositories/operator-actions";
export const runtime="nodejs";
export const GET=api(async(request,identity)=>{const url=new URL(request.url),orgId=z.uuid().parse(url.searchParams.get("orgId")),evaluationId=z.uuid().optional().parse(url.searchParams.get("evaluationId")??undefined),relatedRunId=z.uuid().optional().parse(url.searchParams.get("relatedRunId")??undefined);if(!evaluationId&&!relatedRunId)throw new EvalError("INPUT_INVALID",422,"evaluationId or relatedRunId is required.");await requireWorkspace(identity,orgId,"read");return listEvaluationRuns({orgId,actorId:identity.user.id},{evaluationId,relatedRunId});});
export const POST=api(async(request,identity)=>{const body=await jsonBody(request,262144),orgId=z.uuid().parse((body as {orgId?:unknown}).orgId);await requireWorkspace(identity,orgId,"write");return createTargetAwareRun({orgId,actorId:identity.user.id},Object.fromEntries(Object.entries(body as object).filter(([key])=>key!=="orgId")),request.headers.get("idempotency-key")??"");});
