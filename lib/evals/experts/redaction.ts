/**
 * Redacted excerpts for expert review orders (launch L-26).
 *
 * Experts see only the material their task needs (AGENTS.md): each
 * assignment carries an immutable Stage E evidence snapshot
 * (`redactedEvidenceSchema`, migration 043) built here from the report's
 * results in the order's scope. Every field is redacted before it leaves the
 * report: email addresses, links and website names, phone, card and account
 * numbers, IBANs, Spanish identity numbers (DNI, NIE, CIF) and the names of
 * the workspace, the system and the report. Excerpts carry no source, result
 * or customer identifiers. Operators preview the excerpts before an order
 * creates assignments, because person names in free text cannot be found
 * reliably by patterns.
 */
import type { ReportSnapshot } from "../reports/contracts";
import { redactedEvidenceSchema } from "./contracts";

export type ExpertExcerpt = { anchor: string; text: string };
type Result = ReportSnapshot["results"][number];

const FIELD_LIMIT = 3_000;
const EXCERPT_LIMIT = 12_000;
export const MAX_ORDER_EXCERPTS = 100;

const MARK = { email: "[email]", link: "[link]", website: "[website]", phone: "[phone]", number: "[number]", iban: "[iban]", id: "[id]" } as const;

const TLDS = "com|es|net|org|eu|io|ai|co|info|app|dev|cat|gal|eus|biz|uk|de|fr|it|pt|us|mx|ar|cl|online|shop|site|tech";
const PATTERNS: Array<[RegExp, string | ((match: string) => string)]> = [
  [/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, MARK.email],
  [/\bhttps?:\/\/[^\s<>"'()[\]]+/gi, MARK.link],
  [/\bwww\.[^\s<>"'()[\]]+/gi, MARK.link],
  [new RegExp(`\\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.)+(?:${TLDS})\\b(?:/[^\\s<>"'()]*)?`, "gi"), MARK.website],
  [/\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){3,7}(?: ?[A-Z0-9]{1,3})?\b/g, MARK.iban],
  [/\b[XYZ][ -]?\d{7}[ -]?[A-Z]\b/g, MARK.id],
  [/\b\d{8}[ -]?[A-Z]\b/g, MARK.id],
  [/\b[ABCDEFGHJNPQRSUVW][ -]?\d{7}[ -]?[0-9A-J]\b/g, MARK.id],
  // Long digit runs with separators: phone, card and account numbers (nine digits or more).
  [/(?<![\w])\+?\(?\d[\d ().-]{7,}\d(?![\w])/g, (match) => {
    const digits = match.replace(/\D/g, "").length;
    // Dates with times ("2026-10-13 12:00") are not numbers to hide.
    if (digits < 9 || /(?:19|20)\d{2}-\d{2}-\d{2}/.test(match)) return match;
    return digits >= 13 ? MARK.number : MARK.phone;
  }],
];

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The names to remove: each name in full, and its first word when it is distinctive (four letters or more). */
function nameTerms(names: readonly string[]) {
  const terms = new Set<string>();
  for (const raw of names) {
    const name = raw.trim().replace(/\s+/g, " ");
    if (name.length >= 3) terms.add(name);
    const first = name.split(" ")[0]?.replace(/[^\p{L}\p{N}&-]/gu, "") ?? "";
    if (first.length >= 4) terms.add(first);
  }
  return [...terms].sort((a, b) => b.length - a.length);
}

/** Redacts one piece of text for an expert. `names` are the workspace, system and report names. */
export function redactForExpert(text: string, names: readonly string[] = []): string {
  let out = text.replace(/\r\n?/g, "\n");
  for (const [pattern, replacement] of PATTERNS) {
    out = typeof replacement === "string" ? out.replace(pattern, replacement) : out.replace(pattern, replacement);
  }
  for (const term of nameTerms(names)) {
    out = out.replace(new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(term)}(?![\\p{L}\\p{N}])`, "giu"), "[company]");
  }
  return out;
}

const LABELS = {
  en: {
    question: "Question", answer: "Answer given", grade: "Automatic grade", reasoning: "Grader's reasoning",
    expected: "Expected answer", reference: "Reference excerpt", severity: "severity",
    outcome: { pass: "correct", partial: "partly correct", fail: "incorrect", unscorable: "not scored" },
  },
  es: {
    question: "Pregunta", answer: "Respuesta dada", grade: "Calificación automática", reasoning: "Razonamiento del calificador",
    expected: "Respuesta esperada", reference: "Extracto de referencia", severity: "gravedad",
    outcome: { pass: "correcta", partial: "parcialmente correcta", fail: "incorrecta", unscorable: "sin puntuar" },
  },
} as const;

const SEVERITY_RANK = { low: 0, medium: 1, high: 2, critical: 3 } as const;

function clip(text: string, limit: number) {
  const trimmed = text.trim();
  return trimmed.length > limit ? `${trimmed.slice(0, limit - 1).trimEnd()}…` : trimmed;
}

/**
 * One excerpt per selected result, in report order: question, answer, the
 * automatic grade with its reasoning, the expected answer and up to two
 * reference excerpts, every field redacted. Anchors are "Q1 · topic", unique
 * within the assignment and free of identifiers.
 */
export function buildExpertExcerpts(
  report: Pick<ReportSnapshot, "results">,
  resultIds: readonly string[],
  options: { locale: "en" | "es"; names: readonly string[] },
): ExpertExcerpt[] {
  const wanted = new Set(resultIds);
  const labels = LABELS[options.locale];
  const r = (value: string | null | undefined, limit = FIELD_LIMIT) => clip(redactForExpert(value ?? "", options.names), limit);
  return report.results.filter((item) => wanted.has(item.assessment_id)).slice(0, MAX_ORDER_EXCERPTS).map((item: Result, index) => {
    const lines = [
      `${labels.question}: ${r(item.input)}`,
      `${labels.answer}: ${r(item.output) || "—"}`,
      `${labels.grade}: ${labels.outcome[item.outcome]} (${labels.severity}: ${item.severity})`,
      ...(item.rationale?.trim() ? [`${labels.reasoning}: ${r(item.rationale)}`] : []),
      ...(item.expected?.trim() ? [`${labels.expected}: ${r(item.expected)}`] : []),
      ...(item.source_excerpts ?? []).slice(0, 2).map((excerpt) => `${labels.reference}${excerpt.title ? ` (${r(excerpt.title, 200)})` : ""}: ${r(excerpt.excerpt, 2_000)}`),
    ];
    const topic = r(item.topic || item.title, 120);
    return { anchor: `Q${index + 1}${topic ? ` · ${topic}` : ""}`, text: clip(lines.join("\n\n"), EXCERPT_LIMIT) };
  });
}

/** The Stage E evidence snapshot for an order's assignments, validated against the assignment contract. */
export function orderEvidence(excerpts: ExpertExcerpt[]) {
  return redactedEvidenceSchema.parse({ excerpts, transcript: [] });
}

/** The highest severity among the selected results: the assignments' severity. */
export function orderSeverity(report: Pick<ReportSnapshot, "results">, resultIds: readonly string[]): "low" | "medium" | "high" | "critical" {
  const wanted = new Set(resultIds);
  return report.results.filter((item) => wanted.has(item.assessment_id))
    .reduce<"low" | "medium" | "high" | "critical">((top, item) => (SEVERITY_RANK[item.severity] > SEVERITY_RANK[top] ? item.severity : top), "low");
}
