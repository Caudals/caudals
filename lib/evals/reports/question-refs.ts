/**
 * Short references for "Ask your report" (launch L-36): results are T1, T2…
 * in the report's own result order (failures first, then by severity, as in
 * the PDF, Word and readout), findings F1, F2… in the Findings tab's order
 * (most severe first). The model cites these; the validator maps them back to
 * the snapshot's result and finding ids, and the panel shows them as links.
 *
 * Browser-safe: the report panel imports it.
 */
import type { ReportSnapshot } from "./contracts";
import { resultNumbers } from "./readout";

const SEVERITY = ["critical", "high", "medium", "low"] as const;

/** Finding numbers as the Findings tab shows them: by severity, then in report order. */
export function findingNumbers(findings: ReadonlyArray<Pick<ReportSnapshot["findings"][number], "id" | "severity">>): Map<string, number> {
  const ordered = [...findings].sort((a, b) => SEVERITY.indexOf(a.severity) - SEVERITY.indexOf(b.severity));
  return new Map(ordered.map((item, index) => [item.id, index + 1]));
}

export interface QuestionRefs {
  /** "T3" → assessment id */
  results: Map<string, string>;
  /** "F1" → finding id */
  findings: Map<string, string>;
  /** assessment id → "T3" */
  resultRef: Map<string, string>;
  /** finding id → "F1" */
  findingRef: Map<string, string>;
}

export function questionRefs(snapshot: Pick<ReportSnapshot, "results" | "findings">): QuestionRefs {
  const results = new Map<string, string>(), resultRef = new Map<string, string>();
  for (const [id, n] of resultNumbers(snapshot.results)) { results.set(`T${n}`, id); resultRef.set(id, `T${n}`); }
  const findings = new Map<string, string>(), findingRef = new Map<string, string>();
  for (const [id, n] of findingNumbers(snapshot.findings)) { findings.set(`F${n}`, id); findingRef.set(id, `F${n}`); }
  return { results, findings, resultRef, findingRef };
}

export interface StoredRefs { results: Record<string, string>; findings: Record<string, string> }

/** The references as stored on the question (the worker validates against them, never the snapshot). */
export function refsToJson(refs: QuestionRefs): StoredRefs {
  return { results: Object.fromEntries(refs.results), findings: Object.fromEntries(refs.findings) };
}

export function refsFromJson(value: unknown): QuestionRefs {
  const stored = (value && typeof value === "object" ? value : {}) as Partial<StoredRefs>;
  const entries = (record: unknown) => Object.entries(record && typeof record === "object" ? record as Record<string, unknown> : {})
    .filter((entry): entry is [string, string] => typeof entry[1] === "string");
  const results = new Map(entries(stored.results)), findings = new Map(entries(stored.findings));
  return {
    results, findings,
    resultRef: new Map([...results].map(([ref, id]) => [id, ref])),
    findingRef: new Map([...findings].map(([ref, id]) => [id, ref])),
  };
}
