import "server-only";
import { randomUUID } from "node:crypto";
import { withContentHash } from "../contracts/hashing";
import { assessmentSchema, observationSchema, type Assessment } from "../contracts/results";
import { matchGradedRows, type GradedRow } from "../contracts/graded-results";
import { EvalError } from "../domain/errors";
import { GRADER_V2, VERDICT_EXTENSION, gradeV2, type VerdictRecord } from "../scoring/answer-judge";
import { humanOverride } from "../scoring/deterministic";
import { withTenant } from "./db";
import { idempotent, type EvidenceScope } from "./evidence";
import { createReportForRun, publishReport } from "./managed";

const SCORE = { pass: 1, partial: 0.5, fail: 0 } as const;

/** A person's verdict in the same shape the answer judge records, so the report reads it the same way. */
function personVerdict(row: GradedRow, facts: string[], language: string): VerdictRecord {
  const statuses = row.keyFactStatuses ?? facts.map(() => (row.outcome === "pass" ? "present" as const : "missing" as const));
  return {
    engine: "human-review",
    verdict: row.verdict,
    failure_category: row.failureCategory,
    reference_issue: null,
    capture_issue: null,
    key_facts: facts.slice(0, statuses.length).map((fact, index) => ({ fact, status: statuses[index] })),
    contradictions: row.contradictions,
    unsupported_claims: [],
    explanation: row.rationale,
    confidence: "high",
    method: "judge",
    language,
  };
}

/**
 * Records a complete results sheet for an evaluation's approved test set: one
 * collected-answers run, each answer, an automatic baseline grade and the
 * person's verdict as a reviewed override of it (the same trail as reviewing
 * in the app). A reviewed report is created and published from it.
 */
export async function importGradedResults(scope: EvidenceScope, evaluationId: string, rows: GradedRow[], key: string) {
  const imported = await withTenant(scope, (db) => idempotent(db, scope, `graded-results/${evaluationId}`, key, { rows }, async () => {
    const evaluation = (await db.query(
      `SELECT e.id,e.title,e.project_id,e.selected_suite_version_id,e.selected_target_revision_id,p.description
       FROM evals.evaluation e JOIN evals.project p ON (p.org_id,p.id)=(e.org_id,e.project_id)
       WHERE e.org_id=$1 AND e.id=$2 FOR UPDATE OF e`,
      [scope.orgId, evaluationId],
    )).rows[0];
    if (!evaluation) throw new EvalError("SCOPE_DENIED", 404, "Evaluation not found.");
    if (!evaluation.selected_suite_version_id) throw new EvalError("INPUT_INVALID", 422, "Approve the test set before uploading results.");
    const targetRevisionId = evaluation.selected_target_revision_id ?? (await db.query(
      `SELECT tr.id FROM evals.target_revision tr JOIN evals.target t ON (t.org_id,t.id)=(tr.org_id,tr.target_id)
       WHERE tr.org_id=$1 AND t.project_id=$2 ORDER BY tr.created_at DESC,tr.id DESC LIMIT 1`,
      [scope.orgId, evaluation.project_id],
    )).rows[0]?.id;
    if (!targetRevisionId) throw new EvalError("INPUT_INVALID", 422, "The evaluation has no system to attribute the answers to.");
    const cases = (await db.query(
      `SELECT sc.case_revision_id::text AS id,cr.document,rr.document AS rubric
       FROM evals.suite_case sc
       JOIN evals.case_revision cr ON (cr.org_id,cr.id)=(sc.org_id,sc.case_revision_id)
       JOIN evals.rubric_revision rr ON (rr.org_id,rr.id)=(cr.org_id,cr.rubric_revision_id)
       WHERE sc.org_id=$1 AND sc.suite_version_id=$2 ORDER BY sc.ordinal`,
      [scope.orgId, evaluation.selected_suite_version_id],
    )).rows;
    const matched = matchGradedRows(rows, cases.map((item) => item.id));
    if (matched.errors.length || matched.missing.length) {
      throw new EvalError("INPUT_INVALID", 422, `The sheet does not match the approved test set: ${[
        ...matched.errors.slice(0, 5).map((item) => `row ${item.rowNumber}: ${item.errors.join(", ")}`),
        ...(matched.missing.length ? [`${matched.missing.length} question(s) missing`] : []),
      ].join("; ")}.`);
    }
    const byId = new Map(rows.map((row) => [row.caseRevisionId, row]));

    const runId = randomUUID();
    const plan = withContentHash({
      run_id: runId,
      target_revision_id: targetRevisionId,
      suite_version_id: evaluation.selected_suite_version_id,
      case_revisions: cases.map((item) => ({ revision_id: item.id, content_hash: item.document.content_hash })),
      execution_mode: "imported_responses",
      collection_policy: "person_collected_and_graded_case_revision_matched",
      purpose: evaluation.description || "Evaluation of the agreed system behavior.",
    });
    await db.query(
      `INSERT INTO evals.run(id,org_id,evaluation_id,target_revision_id,suite_version_id,execution_mode,status,phase)
       VALUES($1,$2,$3,$4,$5,'imported_responses','completed','reporting')`,
      [runId, scope.orgId, evaluationId, targetRevisionId, evaluation.selected_suite_version_id],
    );
    await db.query("INSERT INTO evals.run_plan(org_id,run_id,content_hash,document) VALUES($1,$2,$3,$4)", [scope.orgId, runId, plan.content_hash, plan]);

    for (const item of cases) {
      const row = byId.get(item.id)!;
      const unitId = randomUUID(), observationId = randomUUID(), now = new Date().toISOString();
      await db.query("INSERT INTO evals.case_unit(id,org_id,run_id,case_revision_id,repetition,status) VALUES($1,$2,$3,$4,0,'succeeded')", [unitId, scope.orgId, runId, item.id]);
      const question = item.document.scenario.messages.filter((message: { role: string }) => message.role === "user").at(-1)?.content ?? "";
      const observation = observationSchema.parse(withContentHash({
        schema_version: "1.0", observation_id: observationId, run_id: runId, case_revision_id: item.id, repetition: 0, attempt_id: randomUUID(),
        target_revision_id: targetRevisionId, started_at: now, finished_at: now,
        messages: [{ role: "user", content: question }, { role: "assistant", content: row.answer }],
        tool_events: [], artifacts: [], provider_request_id: null, status: "succeeded", error: null,
        metadata: {
          latency_ms: { value: null, provenance: "unavailable" }, input_tokens: { value: null, provenance: "unavailable" },
          output_tokens: { value: null, provenance: "unavailable" }, cost: { value: null, provenance: "unavailable" },
          model_identity: { value: null, provenance: "unavailable" },
        },
        extensions: { "caudals.evals/import": { execution_metadata: "person_collected", suite_version_id: evaluation.selected_suite_version_id, row_number: row.rowNumber } },
      }));
      await db.query("INSERT INTO evals.observation(id,org_id,run_id,case_unit_id,content_hash,document,execution_status) VALUES($1,$2,$3,$4,$5,$6,'succeeded')",
        [observationId, scope.orgId, runId, unitId, observation.content_hash, observation]);

      const baseline = gradeV2({ caseRevision: item.document, observation, rubric: item.rubric, mode: "lexical" });
      const facts: string[] = item.document.reference.required_claims ?? [];
      const overridden = humanOverride(baseline, {
        reviewerId: scope.actorId, outcome: row.outcome, reason: row.rationale,
        criteria: baseline.criteria.map((criterion) => ({ criterion_id: criterion.criterion_id, score: SCORE[row.outcome], rationale: row.rationale })),
      });
      const { content_hash: _stale, ...rest } = overridden;
      const final: Assessment = assessmentSchema.parse(withContentHash({
        ...rest,
        grader_revision_id: GRADER_V2,
        extensions: { ...overridden.extensions, [VERDICT_EXTENSION]: personVerdict(row, facts, item.document.language ?? "es") },
      }));
      for (const assessment of [baseline, final]) {
        await db.query(
          // clock_timestamp keeps the override strictly newer than its baseline inside this transaction.
          "INSERT INTO evals.assessment(id,org_id,observation_id,content_hash,document,outcome,review_status,supersedes_assessment_id,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,clock_timestamp())",
          [assessment.assessment_id, scope.orgId, observationId, assessment.content_hash, assessment, assessment.outcome, assessment.review_status, assessment.supersedes_assessment_id],
        );
        for (const criterion of assessment.criteria) {
          await db.query("INSERT INTO evals.criterion_score(org_id,assessment_id,criterion_id,score,rationale) VALUES($1,$2,$3,$4,$5)",
            [scope.orgId, assessment.assessment_id, criterion.criterion_id, criterion.score, criterion.rationale]);
        }
      }
      await db.query("INSERT INTO evals.review_decision(org_id,assessment_id,decision,reason,reviewer_id,replacement_assessment_id) VALUES($1,$2,'override',$3,$4,$5)",
        [scope.orgId, baseline.assessment_id, row.rationale, scope.actorId, final.assessment_id]);
    }
    await db.query("INSERT INTO evals.audit_event(org_id,actor_id,action,subject_id) VALUES($1,$2,'run.graded_results_imported',$3)", [scope.orgId, scope.actorId, runId]);
    return { runId, title: evaluation.title as string, cases: cases.length };
  }));

  const report = await createReportForRun(scope, { runId: imported.runId, title: imported.title, reviewStatus: "reviewed", scorerVersion: "human-reviewed-sheet-v1" }, `graded-results-report-${imported.runId}`);
  await publishReport(scope, report.reportId, report.revisionId);
  await withTenant(scope, (db) => db.query("UPDATE evals.run SET phase='done',updated_at=now() WHERE org_id=$1 AND id=$2", [scope.orgId, imported.runId]));
  return { runId: imported.runId, reportId: report.reportId, revisionId: report.revisionId, cases: imported.cases };
}

const BEHAVIOUR: Record<string, string> = { answerable: "responder", must_abstain: "abstenerse", missing_information: "pedir información", unanswerable: "decir que no lo sabe" };
export const GRADED_SHEET_HEADERS = [
  "n", "suite_version_id", "case_id", "case_revision_id", "input", "respuesta_esperada", "datos_clave", "comportamiento_esperado", "extracto_fuente",
  "system_answer", "veredicto", "motivo", "datos_clave_estado", "categoria_fallo", "contradicciones",
] as const;

/** The team's grading sheet for an approved test set: everything needed to collect and grade each answer. */
export function gradedSheet(scope: EvidenceScope, evaluationId: string) {
  return withTenant(scope, async (db) => {
    const evaluation = (await db.query("SELECT selected_suite_version_id FROM evals.evaluation WHERE org_id=$1 AND id=$2", [scope.orgId, evaluationId])).rows[0];
    if (!evaluation?.selected_suite_version_id) throw new EvalError("INPUT_INVALID", 422, "Approve the test set before downloading the grading sheet.");
    const cases = (await db.query(
      `SELECT cr.id::text AS id,cr.document FROM evals.suite_case sc JOIN evals.case_revision cr ON (cr.org_id,cr.id)=(sc.org_id,sc.case_revision_id)
       WHERE sc.org_id=$1 AND sc.suite_version_id=$2 ORDER BY sc.ordinal`,
      [scope.orgId, evaluation.selected_suite_version_id],
    )).rows;
    const refs = cases.flatMap((item) => item.document.reference.source_refs ?? []) as Array<{ source_revision_id: string; anchor: string }>;
    const sources = refs.length ? (await db.query("SELECT id::text AS id,document FROM evals.source_revision WHERE org_id=$1 AND id=ANY($2::uuid[])", [scope.orgId, [...new Set(refs.map((ref) => ref.source_revision_id))]])).rows : [];
    const anchors = new Map(sources.flatMap((source) => (source.document.anchors ?? []).map((anchor: { id: string; excerpt: string }) => [`${source.id}:${anchor.id}`, anchor.excerpt] as const)));
    return cases.map((item, index) => {
      const reference = item.document.reference;
      const excerpt = (reference.source_refs ?? []).map((ref: { source_revision_id: string; anchor: string }) => anchors.get(`${ref.source_revision_id}:${ref.anchor}`) ?? "").filter(Boolean).join("\n---\n");
      return {
        n: String(index + 1), suite_version_id: evaluation.selected_suite_version_id as string, case_id: item.document.case_id as string, case_revision_id: item.id,
        input: item.document.scenario.messages.filter((message: { role: string }) => message.role === "user").at(-1)?.content ?? "",
        respuesta_esperada: typeof reference.expected === "string" ? reference.expected : JSON.stringify(reference.expected),
        datos_clave: (reference.required_claims ?? []).join(" | "), comportamiento_esperado: BEHAVIOUR[reference.answerability] ?? reference.answerability ?? "",
        extracto_fuente: excerpt.slice(0, 4000), system_answer: "", veredicto: "", motivo: "", datos_clave_estado: "", categoria_fallo: "", contradicciones: "",
      };
    });
  });
}
