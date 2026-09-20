import { describe,expect,it } from "vitest";
import { handoffSummary } from "../../lib/evals/monitoring/crm";

describe("WP-13 CRM handoff draft",()=>{
  it("keeps a reviewable internal summary and cannot contain an outreach instruction",()=>{
    const summary=handoffSummary({reportId:"report-1",reportRevisionId:"revision-1",title:"Evaluation",
      metrics:{n_planned:10,n_scorable:9},findings:[{title:"Retrieval gaps",severity:"high"}]});
    expect(summary).toMatchObject({report_id:"report-1",report_revision_id:"revision-1",title:"Evaluation",
      status:"draft_for_operator_review"});
    expect(JSON.stringify(summary)).not.toMatch(/send|email|publish|contact/i);
  });
});
