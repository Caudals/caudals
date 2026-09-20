import { runnerApi } from "@/lib/evals/private-runner/http";
import { pollRunner } from "@/lib/evals/private-runner/store";
export const runtime="nodejs";
export const GET=runnerApi(async(_request,db,runner)=>pollRunner(db,String(runner.org_id),String(runner.id)));
