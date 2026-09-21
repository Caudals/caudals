import { describe,expect,it } from "vitest";
import { compareCompatibility,normalizeComparisonPlan,pairedComparison } from "../../lib/evals/scoring/aggregate";
import { classifyMonitoringOutcome } from "../../lib/evals/monitoring/alerts";

describe("WP-13 monitoring comparison",()=>{
  const runPlan={suite_version_id:"suite-1",case_revisions:[{revision_id:"case-1",family_id:"family-1"}],
    candidate_context_hash:"same",tool_fixture_hashes:[],repetition_policy:"frozen_case_limits",execution_conditions_hash:"same"};
  it("normalizes persisted run plans and rejects a changed suite",()=>{
    expect(normalizeComparisonPlan(runPlan).caseRevisions).toEqual([{revisionId:"case-1",familyId:"family-1"}]);
    const same=compareCompatibility(normalizeComparisonPlan(runPlan),normalizeComparisonPlan(runPlan));
    const changed=compareCompatibility(normalizeComparisonPlan(runPlan),normalizeComparisonPlan({...runPlan,suite_version_id:"suite-2"}));
    expect(changed.compatible).toBe(false);
    const newerPolicy=compareCompatibility(normalizeComparisonPlan({...runPlan,suite_version_id:"suite-2"}),normalizeComparisonPlan({...runPlan,suite_version_id:"suite-2"}));
    expect(newerPolicy.policyHash).not.toBe(same.policyHash);
    expect(pairedComparison({baseline:new Map([["case-1","pass"]]),candidate:new Map([["case-1","pass"]]),compatibility:same}).status).toBe("compatible");
  });
  it("never calls incomplete or incomparable evidence a regression",()=>{
    const complete={status:"completed",coverage:1,criticalUnassessed:0};
    expect(classifyMonitoringOutcome({baseline:complete,candidate:{...complete,coverage:0.5},
      comparison:{status:"compatible",regressed:1,improved:0,common:["case-1"],unassessed:0,compatible:true,reasons:[]}}).status).toBe("inconclusive");
    expect(classifyMonitoringOutcome({baseline:complete,candidate:complete,
      comparison:{status:"incompatible",regressed:1,improved:0,common:["case-1"],unassessed:0,compatible:false,reasons:["suite_changed"]}}).status).toBe("inconclusive");
    expect(classifyMonitoringOutcome({baseline:complete,candidate:complete,
      comparison:{status:"compatible",regressed:1,improved:0,common:["case-1"],unassessed:0,compatible:true,reasons:[]}}).status).toBe("regression");
    expect(classifyMonitoringOutcome({baseline:complete,candidate:complete,
      comparison:{status:"inconclusive",regressed:1,improved:1,common:["case-1","case-2"],unassessed:0,compatible:true,reasons:[]}}).status).toBe("inconclusive");
    expect(classifyMonitoringOutcome({baseline:complete,candidate:{...complete,status:"failed"},comparison:null}).status).toBe("unknown");
  });
});
