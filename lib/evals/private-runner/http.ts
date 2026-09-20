import "server-only";
import { randomUUID } from "node:crypto";
import { z, ZodError } from "zod";
import { isEvaluationHost } from "../domain/routing";
import { EvalError } from "../domain/errors";
import { jsonBody, privateHeaders } from "../domain/http";
import { authenticateRunner } from "./store";
import type { PoolClient } from "pg";

export function runnerApi(handler:(request:Request,db:PoolClient,runner:Record<string,unknown>,body:unknown)=>Promise<unknown>) {
  return async(request:Request) => {
    const requestId=randomUUID();
    try {
      if(!isEvaluationHost(request.headers.get("host"))) throw new EvalError("SCOPE_DENIED",404);
      const orgId=z.uuid().parse(new URL(request.url).searchParams.get("orgId"));
      const bearer=request.headers.get("authorization")?.match(/^Bearer ([A-Za-z0-9_-]{32,256})$/)?.[1];
      if(!bearer) throw new EvalError("SESSION_REQUIRED",401);
      const body=request.method==="POST"?await jsonBody(request,262144):null;
      const data=await authenticateRunner(orgId,bearer,(db,runner)=>handler(request,db,runner,body));
      return Response.json({data,meta:{request_id:requestId}},{headers:privateHeaders});
    } catch(error) {
      const known=error instanceof EvalError,invalid=error instanceof ZodError;
      return Response.json({error:{code:known?error.code:invalid?"INPUT_INVALID":"SERVICE_UNAVAILABLE",
        message:known?error.message:invalid?"Check the supplied fields.":"The service is temporarily unavailable.",
        request_id:requestId,retryable:!known&&!invalid}},
        {status:known?error.status:invalid?400:503,headers:privateHeaders});
    }
  };
}
