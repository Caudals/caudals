/**
 * Report fixtures for the report v2 checks (launch L-17): the snapshot tests,
 * the cross-format consistency test and the PDF render check use the same
 * three reports, chosen to cover what the documents must survive:
 *
 * - `example-en`: the example evaluation (reviewed, complete, 48 results);
 * - `preliminary-es`: a preliminary, incomplete Spanish report with every
 *   result label, a critical failure and no excerpt titles on some results;
 * - `stress-en`: long system and source names, unbroken strings (URLs, IDs)
 *   in answers and sources, and many failed answers spread over many causes.
 *
 * Synthetic content only. Deterministic: ids and dates are fixed.
 */
import { exampleBundle } from "../../lib/evals/example";
import { buildReportSnapshot, type ReportSnapshot } from "../../lib/evals/reports/contracts";
import type { ReportLocale } from "../../lib/evals/reports/i18n";
import { aggregateRun } from "../../lib/evals/scoring/aggregate";

type Result = ReportSnapshot["results"][number];
export type ReportFixture = { name: string; locale: ReportLocale; sample: boolean; report: ReportSnapshot };

const DAY = "2026-10-08T10:00:00.000Z";
const uuid = (prefix: string, n: number) => `${prefix}-0000-4000-8000-${String(n).padStart(12, "0")}`;

function snapshot(input: {
  id: number;
  name: string;
  purpose: string;
  language: string;
  review: "preliminary" | "reviewed";
  results: Result[];
  findings?: ReportSnapshot["findings"];
  limitations?: string[];
}): ReportSnapshot {
  const metrics = aggregateRun(
    input.results.map((result, index) => ({
      id: result.case_revision_id,
      familyId: `family-${index}`,
      eligible: true,
      executionStatus: result.label === "not_run" ? ("operational_error" as const) : ("succeeded" as const),
      outcome: result.label === "pending" ? undefined : result.outcome,
      severity: result.severity,
    })),
  );
  return buildReportSnapshot({
    schema_version: "1.0",
    report_revision_id: uuid("11111111-1111", input.id),
    run_id: uuid("22222222-2222", input.id),
    created_at: DAY,
    system: { name: input.name, target_revision_id: uuid("33333333-3333", input.id), purpose: input.purpose, execution_mode: "deployed_system" },
    scope: { suite_version_id: uuid("44444444-4444", input.id), evidence_policy: "source_grounded", started_at: DAY, finished_at: DAY, languages: [input.language], review_status: input.review },
    metrics,
    findings: input.findings ?? [],
    results: input.results,
    improvements: [],
    methodology: {
      cef_version: "1.0", scorer_version: "grading-v2", grader_revisions: ["answer-judge-v2"], rubric_revisions: [], source_revisions: ["source-1", "source-2"],
      sampling: "Frozen suite membership; no post-result selection.", exclusions: [], review_coverage: "Automated preliminary assessment; critical and disputed results require review.", cost: null,
      limitations: metrics.headline_status === "incomplete" ? input.limitations ?? ["Coverage is incomplete; the headline score does not describe unassessed eligible tests."] : input.limitations ?? [],
    },
  });
}

function result(n: number, fields: Partial<Result> & Pick<Result, "outcome" | "severity" | "input" | "output">): Result {
  return {
    case_revision_id: uuid("55555555-5555", n),
    title: fields.input.slice(0, 80),
    topic: "grounded",
    assessment_id: uuid("66666666-6666", n),
    observation_id: uuid("77777777-7777", n),
    rationale: "",
    source_refs: [{ source_revision_id: "source-1", anchor: `anchor-${n}` }],
    review_status: "unreviewed",
    graded_by: "judge",
    ...fields,
  } as Result;
}
const excerpt = (title: string | null, text: string, n: number) => [{ source_revision_id: "source-1", anchor: `anchor-${n}`, title, excerpt: text }];

function preliminaryEs(): ReportSnapshot {
  const faq = "Preguntas frecuentes — Inversión";
  const fees = "Tarifas y comisiones 2026";
  const results: Result[] = [
    result(1, { outcome: "pass", label: "correct", severity: "high", input: "¿Cuál es el importe mínimo para empezar a invertir?", output: "La inversión mínima inicial es de 1.000 €.", expected: "1.000 €.", rationale: "Indica el mínimo documentado.", source_excerpts: excerpt(faq, "Necesitas un mínimo de 1.000 €.", 1) }),
    result(2, { outcome: "partial", label: "partially_correct", severity: "medium", input: "¿Con qué frecuencia puedo programar aportaciones?", output: "Puedes programar aportaciones mensuales.", expected: "Mensual, trimestral, semestral o anual.", rationale: "Omite las demás frecuencias.", failure_category: "missing_information", likely_cause: "knowledge_gap", source_excerpts: excerpt(faq, "Mensualmente, trimestralmente, semestralmente o anualmente.", 2) }),
    result(3, { outcome: "fail", label: "incorrect", severity: "critical", input: "¿Qué comisión se aplica a carteras de menos de 10.000 €?", output: "Un 0,60 % anual.", expected: "Un 0,40 % anual.", rationale: "Da una comisión distinta de la documentada.", failure_category: "wrong_information", likely_cause: "outdated_document", source_excerpts: excerpt(fees, "Comisión de gestión: 0,40 % anual hasta 10.000 €.", 3) }),
    result(4, { outcome: "fail", label: "not_answered", severity: "medium", input: "¿En cuántas cuotas se puede dividir el recibo?", output: "¿Lo puedes intentar con otras palabras?", expected: "En 12 cuotas.", rationale: "Pide reformular sin responder.", failure_category: "no_answer", offered_actions: ["Seguro de coche", "Hablar con un agente"], source_excerpts: excerpt(null, "Posibilidad de dividir tu recibo en 12 cuotas.", 4) }),
    result(5, { outcome: "fail", label: "incorrect", severity: "high", input: "¿Hay comisión de custodia?", output: "Sí, un 0,15 % anual.", expected: "No hay comisión de custodia.", rationale: "Afirma una comisión inexistente.", failure_category: "wrong_information", likely_cause: "outdated_document", source_excerpts: excerpt(fees, "Sin comisión de custodia.", 5) }),
    result(6, { outcome: "pass", label: "correct", severity: "low", input: "¿Puedo retirar dinero cuando quiera?", output: "Sí, sin penalización.", expected: "Sí, sin penalización.", rationale: "Correcta.", source_excerpts: excerpt(faq, "Puedes retirar tu dinero cuando quieras.", 6) }),
    result(7, { outcome: "unscorable", label: "test_issue", severity: "low", input: "¿Qué datos históricos ofrece la página de estadísticas?", output: "La composición y la rentabilidad.", expected: "Servicio\nCarteras", rationale: "La respuesta esperada es una cabecera de tabla.", review_status: "needs_review" }),
    result(8, { outcome: "unscorable", label: "capture_issue", severity: "critical", input: "¿Cómo comunico un siniestro?", output: "¿Cómo comunico un siniestro?", expected: "Desde la app o por teléfono.", rationale: "La respuesta capturada repite la pregunta.", graded_by: "precheck" }),
  ];
  return snapshot({
    id: 2, name: "Asistente de inversión", purpose: "Responder a clientes sobre carteras de inversión", language: "es", review: "preliminary", results,
    limitations: ["1 test was flagged as unclear or with a questionable expected answer and excluded from the score until reviewed.", "1 answer was not captured reliably from the web app and excluded from the score."],
  });
}

function stressEn(): ReportSnapshot {
  const long = "https://help.example-assistant-provider.test/knowledge-base/articles/2026/refunds-and-cancellations-for-annual-subscriptions-purchased-through-resellers?ref=assistant";
  const sources = [
    "Terms and conditions for annual and monthly subscriptions purchased directly or through authorised resellers (2026 edition, section 14)",
    "Refunds FAQ",
    "Pricing table",
    null,
    "Data processing addendum — schedule 3: sub-processors and international transfers",
    "Release notes",
  ];
  const causes = ["outdated_document", "wrong_source", "knowledge_gap", "invented_answer", "out_of_scope", null] as const;
  const categories = ["wrong_information", "contradicts_source", "missing_information", "no_answer", "off_topic", null] as const;
  const severities = ["critical", "high", "medium", "low"] as const;
  const results: Result[] = Array.from({ length: 36 }, (_, index) => {
    const n = index + 1;
    const failing = index % 3 !== 0;
    const outcome = !failing ? ("pass" as const) : index % 3 === 1 ? ("fail" as const) : ("partial" as const);
    return result(n, {
      outcome,
      label: outcome === "pass" ? "correct" : outcome === "partial" ? "partially_correct" : categories[index % 6] === "no_answer" ? "not_answered" : "incorrect",
      severity: severities[index % 4],
      topic: ["refunds", "billing", "privacy_and_data_processing_obligations"][index % 3],
      input: `Question ${n}: can a customer who bought an annual plan through a reseller in another country get a pro-rata refund after ${n} days, and where is that written? ${n % 5 === 0 ? long : ""}`.trim(),
      output: n % 4 === 0 ? `See ${long} or the identifier ${"0123456789abcdef".repeat(6)} for details.` : "A refund is possible within 14 days of purchase for direct purchases only.",
      expected: "Pro-rata refunds apply within 30 days for every purchase channel, including resellers.",
      rationale: failing ? "The answer limits refunds to direct purchases and gives 14 days instead of 30." : "Matches the documented policy.",
      failure_category: failing ? categories[index % 6] : null,
      likely_cause: failing ? causes[index % 6] : null,
      source_excerpts: excerpt(sources[index % 6], `Section ${n}. Pro-rata refunds apply within 30 days for every purchase channel. ${n % 6 === 0 ? long : ""}`.trim(), n),
    });
  });
  return snapshot({
    id: 3,
    name: "Customer support assistant for annual and monthly subscriptions sold directly and through resellers (production, EU region)",
    purpose: "Answer customers' billing, refund and data-processing questions in English for the EU storefront.",
    language: "en",
    review: "preliminary",
    results,
  });
}

/** The three fixtures, in a fixed order. */
export function reportFixtures(): ReportFixture[] {
  return [
    { name: "example-en", locale: "en", sample: true, report: exampleBundle("en").runs[2] as ReportSnapshot },
    { name: "preliminary-es", locale: "es", sample: false, report: preliminaryEs() },
    { name: "stress-en", locale: "en", sample: false, report: stressEn() },
  ];
}
