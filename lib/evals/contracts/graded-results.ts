import { FAILURE_CATEGORIES, type FailureCategory } from "../scoring/answer-judge";

/**
 * A complete results sheet: for every question of an approved test set, the
 * answer a person collected from the system and a person's verdict on it.
 * Spanish or English values are accepted; ids come from the question sheet.
 */
export type GradedRow = {
  rowNumber: number;
  caseRevisionId: string;
  answer: string;
  outcome: "pass" | "partial" | "fail";
  verdict: "correct" | "partially_correct" | "incorrect" | "not_answered";
  rationale: string;
  keyFactStatuses: Array<"present" | "missing" | "contradicted"> | null;
  failureCategory: FailureCategory | null;
  contradictions: string[];
};

const VERDICT: Record<string, GradedRow["verdict"]> = {
  correcta: "correct", correcto: "correct", correct: "correct", pass: "correct",
  parcial: "partially_correct", partial: "partially_correct", partially_correct: "partially_correct",
  incorrecta: "incorrect", incorrecto: "incorrect", incorrect: "incorrect", fail: "incorrect",
  no_responde: "not_answered", "no responde": "not_answered", not_answered: "not_answered", sin_respuesta: "not_answered",
};
const OUTCOME: Record<GradedRow["verdict"], GradedRow["outcome"]> = { correct: "pass", partially_correct: "partial", incorrect: "fail", not_answered: "fail" };
const FACT: Record<string, "present" | "missing" | "contradicted"> = {
  presente: "present", cumple: "present", present: "present", si: "present", "sí": "present",
  falta: "missing", ausente: "missing", missing: "missing", no: "missing",
  contradice: "contradicted", contradicho: "contradicted", contradicted: "contradicted", erroneo: "contradicted", "erróneo": "contradicted",
};
const CATEGORY: Record<string, FailureCategory> = {
  sin_respuesta: "no_answer", no_responde: "no_answer", informacion_erronea: "wrong_information", "información_errónea": "wrong_information",
  falta_informacion: "missing_information", "falta_información": "missing_information", contradice_fuente: "contradicts_source",
  fuera_de_tema: "off_topic", ...Object.fromEntries(FAILURE_CATEGORIES.map((value) => [value, value])),
};

const key = (value: string) => value.trim().toLowerCase().replace(/\s+/g, "_");
const list = (value: string | undefined) => (value ?? "").split("|").map((item) => item.trim()).filter(Boolean);
// The question sheet escapes cells that start like formulas; undo it on the way back.
const cell = (value: string | undefined) => (value ?? "").replace(/^'(?=[=+\-@])/, "").trim();

export const GRADED_COLUMNS = ["case_revision_id", "system_answer", "veredicto", "motivo"] as const;

export function parseGradedRows(records: Record<string, string>[]) {
  const rows: GradedRow[] = [];
  const errors: Array<{ rowNumber: number; errors: string[] }> = [];
  records.forEach((record, index) => {
    const rowNumber = index + 2;
    const problems: string[] = [];
    const caseRevisionId = cell(record.case_revision_id);
    const verdict = VERDICT[key(cell(record.veredicto ?? record.verdict))];
    const answer = cell(record.system_answer);
    const rationale = cell(record.motivo ?? record.rationale);
    if (!/^[0-9a-f-]{36}$/i.test(caseRevisionId)) problems.push("case_revision_id_invalid");
    if (!verdict) problems.push("veredicto_invalid");
    if (!answer && verdict !== "not_answered") problems.push("system_answer_required");
    if (!rationale) problems.push("motivo_required");
    const factValues = list(record.datos_clave_estado ?? record.key_fact_statuses);
    const statuses = factValues.map((value) => FACT[key(value)]);
    if (statuses.some((value) => !value)) problems.push("datos_clave_estado_invalid");
    const categoryValue = cell(record.categoria_fallo ?? record.failure_category);
    const failureCategory = categoryValue ? CATEGORY[key(categoryValue)] ?? null : null;
    if (categoryValue && !failureCategory) problems.push("categoria_fallo_invalid");
    if (problems.length) { errors.push({ rowNumber, errors: problems }); return; }
    rows.push({
      rowNumber, caseRevisionId: caseRevisionId.toLowerCase(), answer, verdict: verdict!, outcome: OUTCOME[verdict!], rationale,
      keyFactStatuses: statuses.length ? statuses as GradedRow["keyFactStatuses"] : null,
      failureCategory: verdict === "not_answered" ? failureCategory ?? "no_answer" : verdict === "correct" ? null : failureCategory,
      contradictions: list(record.contradicciones ?? record.contradictions),
    });
  });
  return { rows, errors };
}

/** Every question of the test set exactly once, nothing else. */
export function matchGradedRows(rows: GradedRow[], caseRevisionIds: string[]) {
  const expected = new Set(caseRevisionIds.map((id) => id.toLowerCase()));
  const seen = new Map<string, number>();
  const errors: Array<{ rowNumber: number; errors: string[] }> = [];
  for (const row of rows) {
    if (!expected.has(row.caseRevisionId)) errors.push({ rowNumber: row.rowNumber, errors: ["case_revision_mismatch"] });
    else if (seen.has(row.caseRevisionId)) errors.push({ rowNumber: row.rowNumber, errors: ["duplicate_case_revision_id"] });
    else seen.set(row.caseRevisionId, row.rowNumber);
  }
  return { errors, missing: [...expected].filter((id) => !seen.has(id)) };
}
