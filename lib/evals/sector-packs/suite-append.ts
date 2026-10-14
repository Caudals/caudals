import "server-only";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { caseSchema, type CefCase } from "../contracts/cases";
import { manifestSchema, type Manifest } from "../contracts/manifest";
import { verifyContentHash, withContentHash } from "../contracts/hashing";
import { EvalError } from "../domain/errors";
import { saveDraftCases, type EvidenceScope } from "../repositories/evidence";

/**
 * Adding questions to a test set (launch L-25: sector questions and approved
 * monthly proposals). Questions go into the editable draft when there is one;
 * when the newest version is frozen, the frozen manifest plus the new
 * questions becomes the next draft, and the caller freezes it as a new
 * version. Either way the draft gets a new identity and a higher version, as
 * every other edit does.
 */
export type WorkingSet = { suite: { id: string; project_id: string; title: string; version: number }; manifest: Manifest; editable: boolean; template: CefCase };

export async function workingSet(db: PoolClient, scope: EvidenceScope, suiteId: string): Promise<WorkingSet> {
  const suite = (await db.query("SELECT id,project_id,title,draft,version FROM evals.suite WHERE org_id=$1 AND id=$2 AND archived_at IS NULL FOR UPDATE", [scope.orgId, suiteId])).rows[0];
  if (!suite) throw new EvalError("SCOPE_DENIED", 404);
  const parsed = manifestSchema.safeParse(suite.draft);
  if (!parsed.success) throw new EvalError("INPUT_INVALID", 422, "Prepare the test set first, then add more questions.");
  const manifest = parsed.data;
  try { verifyContentHash(manifest); } catch { throw new EvalError("VERSION_CONFLICT", 409, "The test set changed. Reload it and try again."); }
  const frozen = (await db.query("SELECT 1 FROM evals.suite_version WHERE org_id=$1 AND id=$2", [scope.orgId, manifest.suite_version_id])).rowCount;
  const templateRef = manifest.case_revisions.find((item) => item.split !== "holdout");
  if (!templateRef) throw new EvalError("INPUT_INVALID", 422, "Prepare the test set first, then add more questions.");
  const row = (await db.query("SELECT document FROM evals.case_revision WHERE org_id=$1 AND id=$2", [scope.orgId, templateRef.revision_id])).rows[0];
  if (!row) throw new EvalError("SCOPE_DENIED", 404);
  const template = caseSchema.parse(row.document);
  if (template.task_type !== "grounded_qa" || template.scenario.messages.length !== 1 || template.scenario.messages[0].role !== "user") {
    throw new EvalError("INPUT_INVALID", 422, "Questions can only be added to single-question test sets.");
  }
  return { suite: { id: suite.id, project_id: suite.project_id, title: suite.title, version: suite.version }, manifest, editable: !frozen, template };
}

/** Question texts already in the set (for deduplication). */
export async function setQuestions(db: PoolClient, orgId: string, manifest: Manifest) {
  const ids = manifest.case_revisions.filter((item) => item.split !== "holdout").map((item) => item.revision_id);
  if (!ids.length) return [] as string[];
  const rows = (await db.query("SELECT document->'scenario'->'messages'->0->>'content' AS question FROM evals.case_revision WHERE org_id=$1 AND id=ANY($2::uuid[])", [orgId, ids])).rows;
  return rows.map((item) => String(item.question ?? ""));
}

/**
 * A grounded question modelled on the set's own first question (same rubric,
 * graders, limits and split), citing one anchor of a frozen source revision.
 */
export function groundedCase(template: CefCase, input: {
  question: string; expected: string; keyFacts: string[]; severity: CefCase["severity"]; difficulty: CefCase["difficulty"];
  answerability?: CefCase["reference"]["answerability"]; language: string; domain?: string; jurisdiction?: string | null; asOf?: string | null; tags: string[];
  sourceRevisionId: string; anchorId: string; provenance: CefCase["provenance"]; extensions: CefCase["extensions"];
}): CefCase {
  const facts = [...new Set(input.keyFacts.map((fact) => fact.trim()).filter(Boolean))];
  const required = facts.length ? facts : [input.expected];
  const caseId = randomUUID();
  return caseSchema.parse(withContentHash({
    ...template,
    case_id: caseId, revision_id: randomUUID(), family_id: randomUUID(),
    title: input.question.replace(/\s+/g, " ").trim().slice(0, 200),
    task_type: "grounded_qa" as const,
    domain: input.domain ?? template.domain,
    tags: [...new Set(input.tags.filter(Boolean))],
    language: input.language,
    jurisdiction: input.jurisdiction === undefined ? template.jurisdiction : input.jurisdiction,
    as_of: input.asOf === undefined ? template.as_of : input.asOf,
    difficulty: input.difficulty, severity: input.severity, split: template.split,
    scenario: { ...template.scenario, messages: [{ ...template.scenario.messages[0], content: input.question }] },
    reference: {
      answerability: input.answerability ?? "answerable", expected: input.expected, acceptable_alternatives: [], required_claims: required,
      prohibited_claims: [], prohibited_actions: [], source_refs: [{ source_revision_id: input.sourceRevisionId, anchor: input.anchorId }],
      rubric_revision_id: template.reference.rubric_revision_id,
      graders: template.reference.graders.map((grader) => (grader.kind === "claims" ? { ...grader, required, prohibited: [] } : grader)),
    },
    provenance: input.provenance,
    weight: 1,
    extensions: input.extensions,
  }));
}

/** Insert new case revisions and write them into the next draft of the set. */
export type AppendSource = { revisionId: string; contentHash: string; file: { path: string; sha256: string; size_bytes: number } };
export async function appendCases(db: PoolClient, scope: EvidenceScope, set: WorkingSet, cases: CefCase[], sources: AppendSource[] = []) {
  for (const item of cases) {
    await db.query('INSERT INTO evals."case"(id,org_id,project_id) VALUES($1,$2,$3)', [item.case_id, scope.orgId, set.suite.project_id]);
    await db.query("INSERT INTO evals.case_revision(id,org_id,case_id,family_id,split,content_hash,document,rubric_revision_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
      [item.revision_id, scope.orgId, item.case_id, item.family_id, item.split, item.content_hash, item, item.reference.rubric_revision_id]);
  }
  let manifest = set.manifest;
  for (const source of sources) {
    if (!manifest.source_revisions.some((ref) => ref.revision_id === source.revisionId)) {
      manifest = { ...manifest, source_revisions: [...manifest.source_revisions, { revision_id: source.revisionId, content_hash: source.contentHash }] };
    }
    if (!manifest.files.some((file) => file.path === source.file.path)) manifest = { ...manifest, files: [...manifest.files, source.file] };
  }
  const languages = [...new Set([...manifest.scope.languages, ...cases.map((item) => item.language)])];
  manifest = { ...manifest, scope: { ...manifest.scope, languages } };
  const version = await saveDraftCases(db, set.suite.id, scope.orgId, manifest, [
    ...manifest.case_revisions,
    ...cases.map((item) => ({ case_id: item.case_id, revision_id: item.revision_id, content_hash: item.content_hash, family_id: item.family_id, split: item.split, weight: item.weight })),
  ]);
  return { version, freeze: !set.editable };
}
