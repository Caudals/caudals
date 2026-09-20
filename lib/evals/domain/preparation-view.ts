type Question = { id: string; field: string; question: string; critical: boolean; status: string };
type CasePreview = { caseRevisionId: string; question: string; approvedAnswer: string; sourceExcerpt: string | null };

/** Customer projection: generation diagnostics and model/prompt IDs stay operator-side. */
export function customerPreparationView(state: {
  evaluation: { preparation_status: string; reason_code?: string | null };
  questions: Array<Question & Record<string, unknown>>;
  batches: Array<{ status: string; output?: { suiteId?: string; suiteVersionId?: string } | null } & Record<string, unknown>>;
  casePreviews: CasePreview[];
  [key: string]: unknown;
}) {
  const completed = state.batches.find((batch) => batch.status === "completed" && batch.output?.suiteId && batch.output.suiteVersionId);
  return {
    status: state.evaluation.preparation_status,
    questions: state.questions.map(({ id, field, question, critical, status }) => ({ id, field, question, critical, status })),
    draft: completed?.output ? { suiteId: completed.output.suiteId!, suiteVersionId: completed.output.suiteVersionId!, suiteDraftVersion: 1 } : null,
    casePreviews: completed ? state.casePreviews : [],
  };
}
