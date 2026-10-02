import React from "react";
import { createRoot } from "react-dom/client";
import { ShellFrame } from "../../components/evals/shell-frame";
import { ClientManagement } from "../../components/evals/client-management";
import { NewEvaluationFlow, WorkspaceEvaluations } from "../../components/evals/workspace-evaluations";
import { EvaluationJourney } from "../../components/evals/evaluation-detail";
import { WorkspaceReports } from "../../components/evals/workspace-reports";
import { WorkspaceSettings } from "../../components/evals/workspace-settings";
import { AuthenticatedReport, ReportView } from "../../components/evals/report-view";
import { ReviewQueue } from "../../components/evals/assessment-review";
import { PlatformConsole } from "../../components/evals/platform-console";
import { OperatorLibrary } from "../../components/evals/operator-library";
import { InvitationAcceptance } from "../../components/evals/invitation-acceptance";
import { EvaluationSignIn } from "../../components/evals/sign-in";
import { EvaluationResetPassword } from "../../components/evals/reset-password";
import { ExpertAssignmentQueue, ExpertWorkbench } from "../../components/evals/expert-workbench";
import { ExpertManagement } from "../../components/evals/expert-management";
import { ImprovementDatasets } from "../../components/evals/improvement-datasets";
import { OperatorOverview } from "../../components/evals/operator-overview";
import { WorkspaceTestSetEditor, WorkspaceTestSets } from "../../components/evals/workspace-test-sets";
import { WebAppConnector } from "../../components/evals/web-app-connector";
const params = new URLSearchParams(location.search);
/** A synthetic grading-v2 report: every label, ground truth, key facts, buttons and excerpts. */
function gradingV2Fixture() {
  const now = new Date().toISOString();
  const base = { topic: "grounded", review_status: "unreviewed", source_refs: [{ source_revision_id: "11111111-1111-4111-8111-111111111111", anchor: "22222222-2222-4222-8222-222222222222" }], graded_by: "judge" as const, language: "es" };
  const excerpt = (text: string) => [{ source_revision_id: base.source_refs[0].source_revision_id, anchor: base.source_refs[0].anchor, title: "Preguntas frecuentes — Inversión", excerpt: text }];
  return {
    report_revision_id: "report-v2", run_id: "run-v2", created_at: now,
    system: { name: "Asistente de inversión", target_revision_id: "target-v2", purpose: "Responder a clientes sobre carteras de inversión", execution_mode: "deployed_system" as const },
    scope: { suite_version_id: "suite-v2", evidence_policy: "source_grounded" as const, started_at: now, finished_at: now, languages: ["es"], review_status: "preliminary" as const },
    metrics: { n_planned: 6, n_eligible: 6, n_executed: 6, n_scorable: 4, n_pass: 2, n_partial: 1, n_fail: 1, n_unscorable: 2, n_pending: 0, n_unresolved: 2, strict_pass_rate: 0.5, rubric_score: null, assessed_coverage: 0.67, execution_completion: 1, pass_bounds: { low: 0.33, high: 0.67 }, wilson_interval: { low: 0.15, high: 0.85 }, family_cluster_interval: null, critical_unassessed: 0, headline_status: "incomplete" as const },
    findings: [{ id: "f1", title: "The assistant did not answer", severity: "medium" as const, evidence_strength: "source_supported", frequency_n: 1, frequency_denominator: 4, observation: "1 of 4 questions got no usable answer: the assistant deflected, asked to rephrase or offered options without answering.", cause_hypothesis: null, recommendation: "Check that these topics are covered by the assistant's knowledge and that its fallback does not trigger on clear, in-scope questions.", assessment_ids: ["a4"] }],
    improvements: [],
    methodology: { cef_version: "1.0" as const, scorer_version: "auto-preliminary-v2", grader_revisions: ["caudals-grader-v2"], rubric_revisions: [], source_revisions: [], sampling: "Frozen suite membership; no post-result selection.", exclusions: [], review_coverage: "Automated preliminary assessment; critical and disputed results require review.", cost: null, limitations: ["1 test was flagged as unclear or with a questionable expected answer and excluded from the score until reviewed.", "1 answer was not captured reliably from the web app and excluded from the score."] },
    takeaways: [],
    results: [
      { ...base, case_revision_id: "c1", title: "Importe mínimo", severity: "high" as const, outcome: "pass" as const, label: "correct" as const, assessment_id: "a1", observation_id: "o1",
        input: "¿Cuál es el importe mínimo para empezar a invertir en una cartera de fondos?", output: "La inversión mínima inicial es de 1.000 €. Puedes alcanzarla con una o varias transferencias. Si ya eres cliente, una segunda cuenta puede abrirse desde 500 €.",
        rationale: "La respuesta indica correctamente el mínimo de 1.000 € y añade detalles que la fuente citada no menciona, sin contradecirla.",
        expected: "La inversión mínima para abrir una cartera de fondos es de 1.000 €.", key_facts: [{ fact: "mínimo 1.000 €", status: "present" as const }],
        unsupported_claims: ["una segunda cuenta puede abrirse desde 500 €"], contradictions: [], failure_category: null, confidence: "high" as const, offered_actions: [],
        source_excerpts: excerpt("Para invertir en una cartera diversificada de fondos indexados necesitas un mínimo de 1.000 €, mediante transferencia o traspaso.") },
      { ...base, case_revision_id: "c2", title: "Frecuencia de aportaciones", severity: "medium" as const, outcome: "partial" as const, label: "partially_correct" as const, assessment_id: "a2", observation_id: "o2",
        input: "¿Con qué frecuencia puedo programar aportaciones periódicas?", output: "Puedes programar aportaciones mensuales desde tu área privada.",
        rationale: "Menciona la frecuencia mensual pero omite las opciones trimestral, semestral y anual.", expected: "Puedes domiciliar aportaciones mensuales, trimestrales, semestrales o anuales.",
        key_facts: [{ fact: "mensualmente", status: "present" as const }, { fact: "trimestralmente, semestralmente o anualmente", status: "missing" as const }], failure_category: "missing_information", contradictions: [], unsupported_claims: [], confidence: "high" as const,
        source_excerpts: excerpt("Podrás domiciliar cargos periódicos mensualmente, trimestralmente, semestralmente o anualmente al ritmo que quieras.") },
      { ...base, case_revision_id: "c3", title: "Comisión de gestión", severity: "critical" as const, outcome: "fail" as const, label: "incorrect" as const, assessment_id: "a3", observation_id: "o3",
        input: "¿Qué comisión de gestión se aplica a carteras de menos de 10.000 €?", output: "La comisión de gestión es del 0,60 % anual para todas las carteras.",
        rationale: "La respuesta da una comisión distinta de la documentada (0,40 %) para ese tramo.", expected: "Para carteras de menos de 10.000 € la comisión de gestión es del 0,40 % anual.",
        key_facts: [{ fact: "0,40 %", status: "contradicted" as const }], contradictions: ["Indica un 0,60 % en lugar del 0,40 % documentado."], unsupported_claims: [], failure_category: "wrong_information", confidence: "high" as const, review_status: "needs_review",
        source_excerpts: excerpt("Comisión de gestión: 0,40 % anual para carteras de hasta 10.000 €.") },
      { ...base, case_revision_id: "c4", title: "Seguro a terceros", severity: "medium" as const, outcome: "fail" as const, label: "not_answered" as const, assessment_id: "a4", observation_id: "o4",
        input: "¿En cuántas cuotas se puede dividir el recibo de un seguro a terceros?", output: "Perdóname 🙏. Como aún estoy aprendiendo, hay frases que me cuesta entender. ¿Lo puedes intentar con otras palabras?",
        rationale: "El asistente no responde: pide reformular la pregunta y ofrece categorías sin dar el dato.", expected: "El recibo puede dividirse en 12 cuotas.",
        key_facts: [{ fact: "12 cuotas", status: "missing" as const }], failure_category: "no_answer", contradictions: [], unsupported_claims: [], confidence: "high" as const,
        offered_actions: ["Seguro de coche", "Seguro de hogar", "Hablar con un agente"], source_excerpts: excerpt("Posibilidad de dividir tu recibo en 12 cuotas.") },
      { ...base, case_revision_id: "c5", title: "Datos históricos", severity: "low" as const, outcome: "unscorable" as const, label: "test_issue" as const, assessment_id: "a5", observation_id: "o5",
        input: "¿Qué tipos de datos históricos ofrece la página de estadísticas?", output: "Puedes descargar la composición y evolución de tu cartera, la rentabilidad y el histórico de transacciones.",
        rationale: "La respuesta esperada es una cabecera de tabla, no una respuesta a la pregunta; la prueba debe revisarse.", expected: "Servicio\nCarteras de fondos\nPlanes de pensiones",
        key_facts: [], failure_category: null, contradictions: [], unsupported_claims: [], confidence: "medium" as const, review_status: "needs_review", source_excerpts: [] },
      { ...base, case_revision_id: "c6", title: "Partes de siniestro", severity: "medium" as const, outcome: "unscorable" as const, label: "capture_issue" as const, assessment_id: "a6", observation_id: "o6", graded_by: "precheck" as const,
        input: "¿Cómo comunico un siniestro de hogar?", output: "¿Cómo comunico un siniestro de hogar?",
        rationale: "La respuesta capturada solo repite la pregunta, así que Caudals pudo haber leído el mensaje del usuario en lugar de la respuesta del asistente.", expected: "Puedes dar parte desde la app o llamando al teléfono de asistencia.",
        key_facts: [], failure_category: null, contradictions: [], unsupported_claims: [], confidence: "high" as const, review_status: "needs_review", source_excerpts: [] },
    ],
  };
}
const authPage =
  location.pathname === "/workspace/sign-in" ||
  location.pathname === "/workspace/reset-password";
const viewer = location.search.includes("viewer");
const anonymous = location.search.includes("anonymous");
const identity = {
  user: {
    id: "test-user",
    name: "Test operator",
    email: "operator@example.test",
  },
  platformRole: viewer ? null : ("operator" as const),
  workspaces: [
    {
      id: "00000000-0000-4000-8000-000000000001",
      name: "Example client",
      role: location.search.includes("owner")
        ? ("owner" as const)
        : location.search.includes("editor")
          ? ("editor" as const)
          : ("viewer" as const),
    },
  ],
};
const content =
  location.pathname === "/workspace/web-app-fixture" ? (
    <WebAppConnector orgId="00000000-0000-4000-8000-000000000001" targetId="00000000-0000-4000-8000-000000000201" />
  ) :
  location.pathname === "/workspace/sign-in" ? (
    <EvaluationSignIn next={params.get("next") ?? undefined} />
  ) : location.pathname === "/workspace/reset-password" ? (
    <EvaluationResetPassword
      next={params.get("next") ?? undefined}
      token={params.get("token") ?? undefined}
      invalid={params.has("error")}
    />
  ) : location.pathname === "/ops" ? (
    <OperatorOverview />
  ) : location.pathname === "/ops/clients" ? (
    <ClientManagement />
  ) : location.pathname === "/ops/experts" ? (
    <ExpertManagement />
  ) : location.pathname === "/ops/improvements" ? (
    <ImprovementDatasets />
  ) : location.pathname.startsWith("/review/assignments/") ? (
    <ExpertWorkbench assignmentId={location.pathname.split("/").at(-1)!} />
  ) : location.pathname === "/review" ? (
    <ExpertAssignmentQueue />
  ) : location.pathname === "/workspace/evaluations/new" ? (
    <NewEvaluationFlow />
  ) : location.pathname === "/workspace/settings" ? (
    <WorkspaceSettings />
  ) : location.pathname === "/workspace/reports" ? (
    <WorkspaceReports />
  ) : location.pathname === "/workspace/test-sets" ? (
    <WorkspaceTestSets />
  ) : location.pathname.startsWith("/workspace/test-sets/") ? (
    <WorkspaceTestSetEditor suiteId={location.pathname.split("/").at(-1)!} />
  ) : location.pathname.startsWith("/workspace/evaluations/") ? (
    <EvaluationJourney evaluationId={location.pathname.split("/").at(-1)!} />
  ) : location.pathname === "/ops/platform" ? (
    <PlatformConsole section="providers" admin={!location.search.includes("readonly")} />
  ) : location.pathname === "/ops/platform/usage" ? (
    <PlatformConsole section="usage" admin />
  ) : location.pathname === "/ops/library/domain-packs" ? (
    <OperatorLibrary section="domain-packs" improvements={false} />
  ) : location.pathname === "/ops/review" ? (
    <ReviewQueue />
  ) : location.pathname === "/workspace/reports/actions" ? (
    <AuthenticatedReport reportId="00000000-0000-4000-8000-000000000301" />
  ) : location.pathname === "/workspace/reports/fixture-v2" ? (
    <ReportView initialTab={params.get("tab")} initialResult={params.get("result")} report={gradingV2Fixture()} />
  ) : location.pathname === "/workspace/reports/fixture" ? (
    <ReportView report={{
      report_revision_id: "report-v1",
      system: { name: "Support assistant", target_revision_id: "target-v1", purpose: "Support", execution_mode: "deployed_system" },
      scope: { suite_version_id: "suite-v1", evidence_policy: "source_grounded", started_at: new Date().toISOString(), finished_at: new Date().toISOString(), languages: ["en"], review_status: "preliminary" },
      results: [{ case_revision_id: "case-v1", title: "Refund eligibility", topic: "refunds", severity: "high", outcome: "fail", assessment_id: "assessment-v1", observation_id: "observation-v1", input: "Can I get a refund?", output: "No.", rationale: "The response omitted the documented 30-day policy.", source_refs: [{ source_revision_id: "policy-v1", anchor: "refunds" }], review_status: "reviewed" }],
    }} />
  ) : location.pathname.includes("invitations") ? (
    <InvitationAcceptance authenticated={!anonymous} />
  ) : (
    <WorkspaceEvaluations />
  );
createRoot(document.getElementById("root")!).render(
  authPage ? (
    content
  ) : anonymous ? (
    <div className="p-root">
      <main className="p-page">{content}</main>
    </div>
  ) : (
    <ShellFrame identity={identity} expert={location.pathname.startsWith("/review")} features={{ experts: true }}>{content}</ShellFrame>
  ),
);
