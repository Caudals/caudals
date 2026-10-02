import { z } from "zod";
import { hashSchema, timestampSchema } from "../contracts/primitives";
import { withContentHash } from "../contracts/hashing";
import type { aggregateRun } from "../scoring/aggregate";

const reportMetricsSchema=z.strictObject({n_planned:z.number().int().nonnegative(),n_eligible:z.number().int().nonnegative(),n_executed:z.number().int().nonnegative(),n_scorable:z.number().int().nonnegative(),n_pass:z.number().int().nonnegative(),n_partial:z.number().int().nonnegative(),n_fail:z.number().int().nonnegative(),n_unscorable:z.number().int().nonnegative(),n_pending:z.number().int().nonnegative(),n_unresolved:z.number().int().nonnegative(),strict_pass_rate:z.number().min(0).max(1).nullable(),rubric_score:z.number().min(0).max(100).nullable(),assessed_coverage:z.number().min(0).max(1).nullable(),execution_completion:z.number().min(0).max(1).nullable(),pass_bounds:z.strictObject({low:z.number(),high:z.number()}).nullable(),wilson_interval:z.strictObject({low:z.number(),high:z.number()}).nullable(),family_cluster_interval:z.strictObject({low:z.number(),high:z.number()}).nullable(),critical_unassessed:z.number().int().nonnegative(),headline_status:z.enum(["complete","incomplete"])});
/**
 * Optional per-result detail added by grading engine v2 (docs/evals/grading-engine.md).
 * Older snapshots omit it and still parse.
 */
export const RESULT_LABELS=["correct","partially_correct","incorrect","not_answered","test_issue","capture_issue","not_run","pending"] as const;
export type ResultLabel=typeof RESULT_LABELS[number];
const resultDetailShape={
  label:z.enum(RESULT_LABELS).optional(),
  expected:z.string().max(8000).optional(),
  key_facts:z.array(z.strictObject({fact:z.string().max(500),status:z.enum(["present","missing","contradicted"]).nullable()})).max(20).optional(),
  source_excerpts:z.array(z.strictObject({source_revision_id:z.string(),anchor:z.string(),title:z.string().max(300).nullable(),excerpt:z.string().max(2000)})).max(3).optional(),
  failure_category:z.string().max(60).nullable().optional(),
  contradictions:z.array(z.string().max(400)).max(10).optional(),
  unsupported_claims:z.array(z.string().max(400)).max(10).optional(),
  confirmed_claims:z.array(z.string().max(400)).max(10).optional(),
  web_sources:z.array(z.strictObject({url:z.string().max(2000),title:z.string().max(300).optional()})).max(8).optional(),
  offered_actions:z.array(z.string().max(200)).max(20).optional(),
  graded_by:z.enum(["judge","lexical","precheck","deterministic","human"]).optional(),
  confidence:z.enum(["high","medium","low"]).nullable().optional(),
  language:z.string().max(40).optional(),
};
export const reportSnapshotSchema=z.strictObject({schema_version:z.literal("1.0"),report_revision_id:z.string().min(1),run_id:z.string().min(1),created_at:timestampSchema,content_hash:hashSchema,system:z.strictObject({name:z.string(),target_revision_id:z.string(),purpose:z.string(),execution_mode:z.enum(["deployed_system","controlled_model","imported_responses"])}),scope:z.strictObject({suite_version_id:z.string(),evidence_policy:z.enum(["exploratory","source_grounded"]),started_at:timestampSchema,finished_at:timestampSchema,languages:z.array(z.string()),review_status:z.enum(["preliminary","reviewed"])}),metrics:reportMetricsSchema,findings:z.array(z.strictObject({id:z.string(),title:z.string(),severity:z.enum(["low","medium","high","critical"]),evidence_strength:z.string(),frequency_n:z.number().int(),frequency_denominator:z.number().int(),observation:z.string(),cause_hypothesis:z.string().nullable(),recommendation:z.string(),assessment_ids:z.array(z.string())})),results:z.array(z.strictObject({case_revision_id:z.string(),title:z.string(),topic:z.string(),severity:z.enum(["low","medium","high","critical"]),outcome:z.enum(["pass","partial","fail","unscorable"]),assessment_id:z.string(),observation_id:z.string(),input:z.string(),output:z.string(),rationale:z.string(),source_refs:z.array(z.strictObject({source_revision_id:z.string(),anchor:z.string()})),review_status:z.string(),...resultDetailShape})),improvements:z.array(z.strictObject({id:z.string(),priority:z.number().int().positive(),title:z.string(),owner:z.string().nullable(),status:z.enum(["proposed","planned","in_progress","validated","closed"]),finding_ids:z.array(z.string()),validation_plan:z.string()})),methodology:z.strictObject({cef_version:z.literal("1.0"),scorer_version:z.string(),grader_revisions:z.array(z.string()),rubric_revisions:z.array(z.string()),source_revisions:z.array(z.string()),sampling:z.string(),exclusions:z.array(z.string()),review_coverage:z.string(),cost:z.strictObject({settled:z.string(),reserved:z.string(),unresolved:z.string(),currency:z.string()}).nullable(),limitations:z.array(z.string())}),takeaways:z.array(z.strictObject({text:z.string().min(1),finding_ids:z.array(z.string()),assessment_ids:z.array(z.string())})).max(5)}).superRefine((report,ctx)=>{const findings=new Set(report.findings.map(item=>item.id)),assessments=new Set(report.results.map(item=>item.assessment_id));for(const takeaway of report.takeaways){if(takeaway.finding_ids.some(id=>!findings.has(id))||takeaway.assessment_ids.some(id=>!assessments.has(id)))ctx.addIssue({code:"custom",message:"Takeaway evidence is not in this snapshot"});}if(report.metrics.headline_status==="incomplete"&&!report.methodology.limitations.length)ctx.addIssue({code:"custom",message:"Incomplete report requires a visible limitation"});});
export type ReportSnapshot=z.infer<typeof reportSnapshotSchema>;

export function buildReportSnapshot(input:Omit<ReportSnapshot,"content_hash"|"takeaways">&{takeaways?:ReportSnapshot["takeaways"]}):ReportSnapshot {
  const deterministic=input.findings.slice(0,5).map(finding=>({text:`${finding.title}: ${finding.frequency_n} of ${finding.frequency_denominator} relevant assessed results.`,finding_ids:[finding.id],assessment_ids:finding.assessment_ids}));
  return reportSnapshotSchema.parse(withContentHash({...input,takeaways:input.takeaways??deterministic}));
}
export type AggregatedMetrics=ReturnType<typeof aggregateRun>;
