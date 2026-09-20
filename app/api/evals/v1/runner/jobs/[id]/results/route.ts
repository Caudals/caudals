import { z } from "zod";
import { runnerApi } from "@/lib/evals/private-runner/http";
import { submitRunnerResult } from "@/lib/evals/private-runner/store";
import { EvalError } from "@/lib/evals/domain/errors";
export const runtime="nodejs";
export const POST=runnerApi(async(request,db,runner,body)=>{
  const jobId=z.uuid().parse(new URL(request.url).pathname.split("/").at(-2));
  if((body as {job_id?:unknown})?.job_id!==jobId)throw new EvalError("SCOPE_DENIED",404);
  return submitRunnerResult(db,runner,body);
});
