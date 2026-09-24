import React from "react";
import { createRoot } from "react-dom/client";
import { EvalShell } from "../../components/evals/shell";
import { ClientManagement } from "../../components/evals/client-management";
import { EvaluationJourney, NewEvaluationFlow, WorkspaceEvaluations, WorkspaceReports, WorkspaceSettings } from "../../components/evals/workspace-evaluations";
import { ReportView } from "../../components/evals/report-view";
import { InvitationAcceptance } from "../../components/evals/invitation-acceptance";
import { EvaluationSignIn } from "../../components/evals/sign-in";
import { EvaluationResetPassword } from "../../components/evals/reset-password";
import { ExpertAssignmentQueue, ExpertWorkbench } from "../../components/evals/expert-workbench";
import { ExpertManagement } from "../../components/evals/expert-management";
import { ImprovementDatasets } from "../../components/evals/improvement-datasets";
import { QueueView } from "../../components/evals/operator-overview";
import { WorkspaceTestSetEditor, WorkspaceTestSets } from "../../components/evals/workspace-test-sets";
const params = new URLSearchParams(location.search);
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
  location.pathname === "/workspace/sign-in" ? (
    <EvaluationSignIn next={params.get("next") ?? undefined} />
  ) : location.pathname === "/workspace/reset-password" ? (
    <EvaluationResetPassword
      next={params.get("next") ?? undefined}
      token={params.get("token") ?? undefined}
      invalid={params.has("error")}
    />
  ) : location.pathname === "/ops" ? (
    <ClientManagement />
  ) : location.pathname === "/ops/reports" ? (
    <QueueView kind="reports" />
  ) : location.pathname === "/ops/experts" ? (
    <ExpertManagement workspaces={identity.workspaces} />
  ) : location.pathname === "/ops/improvements" ? (
    <ImprovementDatasets workspaces={identity.workspaces} />
  ) : location.pathname.startsWith("/review/assignments/") ? (
    <ExpertWorkbench assignmentId={location.pathname.split("/").at(-1)!} />
  ) : location.pathname === "/review" ? (
    <ExpertAssignmentQueue />
  ) : location.pathname === "/workspace/evaluations/new" ? (
    <NewEvaluationFlow workspaces={identity.workspaces} />
  ) : location.pathname === "/workspace/settings" ? (
    <WorkspaceSettings workspaces={identity.workspaces} />
  ) : location.pathname === "/workspace/reports" ? (
    <WorkspaceReports workspaces={identity.workspaces} />
  ) : location.pathname === "/workspace/test-sets" ? (
    <WorkspaceTestSets workspaces={identity.workspaces} />
  ) : location.pathname.startsWith("/workspace/test-sets/") ? (
    <WorkspaceTestSetEditor suiteId={location.pathname.split("/").at(-1)!} workspaces={identity.workspaces} />
  ) : location.pathname.startsWith("/workspace/evaluations/") ? (
    <EvaluationJourney evaluationId={location.pathname.split("/").at(-1)!} workspaces={identity.workspaces} />
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
    <WorkspaceEvaluations workspaces={identity.workspaces} />
  );
createRoot(document.getElementById("root")!).render(
  authPage ? (
    content
  ) : anonymous ? (
    <div className="p-root">
      <main className="p-page">{content}</main>
    </div>
  ) : (
    <EvalShell identity={identity} expert={location.pathname.startsWith("/review")}>{content}</EvalShell>
  ),
);
