import { describe,expect,it } from "vitest";
import { compareCompatibility,normalizeComparisonPlan } from "../../lib/evals/scoring/aggregate";
import { classifyMonitoringOutcome } from "../../lib/evals/monitoring/alerts";

describe("WP-13 monitoring comparison",()=>{
  const runPlan={suite_version_id:"suite-1",case_revisions:[{revision_id:"case-1",family_id:"family-1"}],
    candidate_context_hash:"same",tool_fixture_hashes:[],repetition_policy:"frozen_case_limits",execution_conditions_hash:"same"};
  it("normalizes persisted run plans and rejects a changed suite",()=>{
    expect(normalizeComparisonPlan(runPlan).caseRevisions).toEqual([{revisionId:"case-1",familyId:"family-1"}]);
    expect(compareCompatibility(normalizeComparisonPlan(runPlan),normalizeComparisonPlan({...runPlan,suite_version_id:"suite-2"})).compatible).toBe(false);
  });
  it("never calls incomplete or incomparable evidence a regression",()=>{
    const complete={status:"completed",coverage:1,criticalUnassessed:0};
    expect(classifyMonitoringOutcome({baseline:complete,candidate:{...complete,coverage:0.5},
      comparison:{status:"compatible",regressed:1,improved:0,common:["case-1"],unassessed:0,compatible:true,reasons:[]}}).status).toBe("inconclusive");
    expect(classifyMonitoringOutcome({baseline:complete,candidate:complete,
      comparison:{status:"incompatible",regressed:1,improved:0,common:["case-1"],unassessed:0,compatible:false,reasons:["suite_changed"]}}).status).toBe("inconclusive");
    expect(classifyMonitoringOutcome({baseline:complete,candidate:complete,
      comparison:{status:"compatible",regressed:1,improved:0,common:["case-1"],unassessed:0,compatible:true,reasons:[]}}).status).toBe("regression");
    expect(classifyMonitoringOutcome({baseline:complete,candidate:{...complete,status:"failed"},comparison:null}).status).toBe("unknown");
  });
});
