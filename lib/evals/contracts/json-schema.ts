import { z } from "zod";
import { bundleSchema } from "./bundle";
import { caseSchema, sourceSchema, rubricSchema } from "./cases";
import { manifestSchema } from "./manifest";
import { observationSchema, assessmentSchema } from "./results";
import { toolFixtureSchema } from "./scenarios";
import { candidateInputSchema, candidateProjectionSchema, judgeProjectionSchema, customerProjectionSchema, publicProjectionSchema } from "./projections";
import { targetConfigSchema, capabilityReportSchema, connectionCheckSchema, invocationMetadataSchema } from "./connectors";

export const cefSchemas = { manifest: manifestSchema, case: caseSchema, source: sourceSchema, rubric: rubricSchema, tool_fixture: toolFixtureSchema, observation: observationSchema, assessment: assessmentSchema, bundle: bundleSchema, candidate_input: candidateInputSchema, candidate_projection: candidateProjectionSchema, judge_projection: judgeProjectionSchema, customer_projection: customerProjectionSchema, public_projection: publicProjectionSchema, target_config: targetConfigSchema, capability_report: capabilityReportSchema, connection_check: connectionCheckSchema, invocation_metadata: invocationMetadataSchema } as const;
/** Refinements (hashes, cross-record references, BCP47 and policy) require executable validation too. */
export function exportJsonSchemas() {
  return Object.fromEntries(Object.entries(cefSchemas).map(([name, schema]) => [name, { ...z.toJSONSchema(schema, { target: "draft-2020-12", io: "input" }), $id: `https://caudals.com/schemas/cef/1.0/${name}.schema.json`, $comment: "CEF structural schema; also run executable CEF validation for semantic invariants and hashes." }]));
}
