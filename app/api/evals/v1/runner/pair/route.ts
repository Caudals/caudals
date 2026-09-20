import { z,ZodError } from "zod";
import { randomUUID } from "node:crypto";
import { isEvaluationHost } from "@/lib/evals/domain/routing";
import { EvalError } from "@/lib/evals/domain/errors";
import { jsonBody,privateHeaders } from "@/lib/evals/domain/http";
import { completePairing } from "@/lib/evals/private-runner/store";
export const runtime="nodejs";
export async function POST(request:Request){
  const requestId=randomUUID();
  try{
    if(!isEvaluationHost(request.headers.get("host")))throw new EvalError("SCOPE_DENIED",404);
    const {orgId,code,publicKey,connectorVersion}=z.strictObject({orgId:z.uuid(),code:z.string().min(32).max(256),
      publicKey:z.string().min(32).max(1024),connectorVersion:z.string().min(1).max(80)}).parse(await jsonBody(request,4096));
    const data=await completePairing(orgId,code,publicKey,connectorVersion);
    return Response.json({data,meta:{request_id:requestId}},{headers:privateHeaders});
  }catch(error){
    const known=error instanceof EvalError,invalid=error instanceof ZodError;
    return Response.json({error:{code:known?error.code:invalid?"INPUT_INVALID":"SERVICE_UNAVAILABLE",
      message:known?error.message:invalid?"Check the supplied fields.":"The service is temporarily unavailable.",request_id:requestId}},
      {status:known?error.status:invalid?400:503,headers:privateHeaders});
  }
}
