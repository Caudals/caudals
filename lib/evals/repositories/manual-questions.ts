import "server-only";
import { sourceSchema } from "../contracts/cases";
import { locateQuote, type QuotableSource } from "../contracts/quote-anchors";
import { EvalError } from "../domain/errors";
import { withTenant } from "./db";
import type { EvidenceScope } from "./evidence";

type Question = { quote?: string; url?: string; anchor?: string; sourceRevisionId?: string };

/**
 * Ties each hand-written question to the source passage it cites: the newest
 * revision of every live source of the evaluation's project is searched for the
 * quote (on the given page, when a URL is given). All or nothing.
 */
export function locateManualQuestions<T extends Question>(scope: EvidenceScope, evaluationId: string, questions: T[]) {
  return withTenant(scope, async (db) => {
    const rows = (await db.query(
      `SELECT DISTINCT ON (sr.source_id) sr.document FROM evals.source_revision sr
       JOIN evals."source" so ON (so.org_id,so.id)=(sr.org_id,sr.source_id)
       JOIN evals.evaluation e ON (e.org_id,e.project_id)=(so.org_id,so.project_id)
       WHERE sr.org_id=$1 AND e.id=$2 AND so.archived_at IS NULL ORDER BY sr.source_id, sr.created_at DESC`,
      [scope.orgId, evaluationId],
    )).rows;
    const sources: QuotableSource[] = rows.map((row) => sourceSchema.parse(row.document));
    const located = questions.map((question) => (question.anchor ? null : locateQuote(sources, question.quote ?? "", question.url)));
    const missing = questions.flatMap((question, index) => (!question.anchor && !located[index] ? [index + 1] : []));
    if (missing.length) {
      throw new EvalError("INPUT_INVALID", 422, `Quote not found in this evaluation's sources for questions ${missing.join(", ")}. Copy it verbatim, or add that page as a source first.`);
    }
    const questionsWithAnchors = questions.map((question, index) => {
      const place = located[index];
      return place ? { ...question, anchor: place.anchors[0], sourceRevisionId: place.source_revision_id } : question;
    });
    const sourceRevisionIds = [...new Set(questionsWithAnchors.map((question) => question.sourceRevisionId).filter((id): id is string => !!id))];
    return { questions: questionsWithAnchors, sourceRevisionIds };
  });
}
