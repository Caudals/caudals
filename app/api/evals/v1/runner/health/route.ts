import { runnerApi } from "@/lib/evals/private-runner/http";
export const runtime="nodejs";
export const GET=runnerApi(async(_request,_db,runner)=>({runnerId:runner.id,projectId:runner.project_id,targetId:runner.target_id,status:"connected"}));
