"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { EvalIdentity } from "@/lib/evals/domain/identity";
import { evalRequest, EvalRequestError } from "./api";
import {
  Action,
  ActionLink,
  Badge,
  DataTable,
  DefinitionList,
  EmptyState,
  Field,
  Loading,
  PageHeading,
  RowTitle,
  Status,
  StatusBadge,
  humanize,
} from "./primitives";
import { Button } from "@/components/ui/button";
import { FileText, FlaskConical, Inbox, Plug } from "lucide-react";
import { t } from "@/lib/evals/messages/en";
import { PrepareEvaluation } from "./workspace-preparation";
import { ManualAnswers, publishPreliminaryManualReport } from "./workspace-manual-answers";
import { WorkspaceMonitoringPanel } from "./workspace-monitoring";

export type WorkspaceSummary = {
  evaluations: Array<{
    id: string;
    title: string;
    project_id: string;
    project_title: string;
    project_description: string;
    latest_source_id: string | null;
    latest_source_revision_id: string | null;
    preparation_status: string;
    reason_code: string | null;
    selected_suite_version_id: string | null;
    commercial_cap: string;
    currency: string;
    latest_run_id: string | null;
    latest_run_status: string | null;
    latest_run_phase: string | null;
  }>;
  systems: Array<{
    id: string;
    project_id: string;
    title: string;
    target_revision_id: string;
    document: { kind: string };
    connection_status: string | null;
    runner_status: string | null;
    runner_id: string | null;
    error_code: string | null;
  }>;
  reports: Array<{
    id: string;
    title: string;
    current_revision_id: string;
    evaluation_id: string;
  }>;
  entitlement: {
    max_active_runs: number;
    monthly_spend_limit: string;
    currency: string;
    allowed_connection_types: string[];
    can_export: boolean;
    can_schedule: boolean;
  };
  usage: { settled: string; outstanding: string };
  preferences: {
    completion: boolean;
    required_input: boolean;
    failure: boolean;
    email: boolean;
  };
};

export function useWorkspaceSummary(orgId: string) {
  const [summary, setSummary] = useState<WorkspaceSummary | null>(null);
  const [error, setError] = useState("");
  const reload = useCallback(async () => {
    if (!orgId) return;
    try {
      setSummary(
        await evalRequest<WorkspaceSummary>(
          `/workspace/summary?orgId=${encodeURIComponent(orgId)}`,
        ),
      );
      setError("");
    } catch (value) {
      setError(value instanceof Error ? value.message : t("error"));
    }
  }, [orgId]);
  useEffect(() => {
    const timer = window.setTimeout(() => void reload(), 0);
    const interval = window.setInterval(() => void reload(), 5_000);
    return () => { window.clearTimeout(timer); window.clearInterval(interval); };
  }, [reload]);
  return { summary, error, reload };
}

export function WorkspaceEvaluations({
  workspaces,
}: {
  workspaces: EvalIdentity["workspaces"];
}) {
  const [orgId, setOrgId] = useState(workspaces[0]?.id ?? "");
  const workspace = workspaces.find((item) => item.id === orgId);
  const { summary, error } = useWorkspaceSummary(orgId);
  if (!workspace) {
    return (
      <>
        <PageHeading title={t("product")} />
        <EmptyState title={t("noWorkspace")} icon={<Inbox />}>
          <p>{t("noWorkspaceHelp")}</p>
          <ActionLink variant="secondary" href="/workspace/invitations">
            {t("invitations")}
          </ActionLink>
        </EmptyState>
      </>
    );
  }
  const canWrite = ["owner", "editor", "operator"].includes(workspace.role);
  return (
    <>
      <PageHeading
        title={t("product")}
        actions={
          canWrite && (
            <ActionLink href={`/workspace/evaluations/new?orgId=${orgId}`}>
              {t("newEvaluationAction")}
            </ActionLink>
          )
        }
      >
        {t("evaluationHelp")}
      </PageHeading>
      <div className="eval-toolbar">
        <label htmlFor="workspace">{t("workspace")}</label>
        <select id="workspace" value={orgId} onChange={(event) => setOrgId(event.target.value)}>
          {workspaces.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        <Badge>{t(workspace.role)}</Badge>
      </div>
      {error && <Status error>{error}</Status>}
      {!summary ? (
        <Loading />
      ) : summary.evaluations.length ? (
        <DataTable
          caption={t("recentEvaluations")}
          headers={[
            t("evaluation"),
            t("preparation"),
            t("lastRun"),
            { label: t("access"), align: "end" },
          ]}
        >
          {summary.evaluations.map((evaluation) => (
            <tr key={evaluation.id}>
              <RowTitle meta={evaluation.project_title}>{evaluation.title}</RowTitle>
              <td>
                <StatusBadge value={evaluation.preparation_status} />
              </td>
              <td>
                <StatusBadge value={evaluation.latest_run_status} />
              </td>
              <td className="p-table-action">
                <Link
                  className="p-link"
                  href={`/workspace/evaluations/${evaluation.id}?orgId=${orgId}`}
                >
                  {t("open")}
                </Link>
              </td>
            </tr>
          ))}
        </DataTable>
      ) : (
        <EmptyState title={t("noEvaluations")} icon={<FlaskConical />}>
          <p>{t("evaluationIntro")}</p>
          {canWrite && (
            <ActionLink href={`/workspace/evaluations/new?orgId=${orgId}`}>
              {t("newEvaluationAction")}
            </ActionLink>
          )}
        </EmptyState>
      )}
    </>
  );
}

type ConnectionKind = "website" | "api" | "upload" | "private";

export function NewEvaluationFlow({ workspaces }: { workspaces: EvalIdentity["workspaces"] }) {
  const router = useRouter();
  const requestedOrgId = useSearchParams().get("orgId");
  const initialOrgId = workspaces.some((item) => item.id === requestedOrgId)
    ? requestedOrgId!
    : workspaces[0]?.id ?? "";
  const [orgId, setOrgId] = useState(initialOrgId);
  const [kind, setKind] = useState<ConnectionKind>("website");
  const [projectName, setProjectName] = useState("");
  const [systemName, setSystemName] = useState("");
  const [purpose, setPurpose] = useState("");
  const [endpoint, setEndpoint] = useState("https://");
  const [model, setModel] = useState("");
  const [authorized, setAuthorized] = useState(false);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [pairing, setPairing] = useState<{code:string;orgId:string;evaluationId:string;expiresAt:string}|null>(null);
  const submitKey = useRef(crypto.randomUUID());
  const targetRevisionKey = useRef(crypto.randomUUID());
  const mappingRevisionKey = useRef(crypto.randomUUID());
  const canSubmit =
    !!orgId && !!projectName.trim() && !!systemName.trim() && !!purpose.trim() &&
    (kind === "upload" || kind === "private" || endpoint.startsWith("https://")) &&
    (kind !== "api" || !!model.trim()) && (kind !== "website" || authorized);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit || pending) return;
    setPending(true);
    setError("");
    setNotice("");
    try {
      const project = await evalRequest<{ id: string }>(
        "/projects",
        "POST",
        { orgId, title: projectName.trim(), description: purpose.trim() },
        `${submitKey.current}-project`,
      );
      const evaluation = await evalRequest<{ id: string }>(
        "/evaluations",
        "POST",
        {
          orgId,
          projectId: project.id,
          title: projectName.trim(),
          evidencePolicy: "source_grounded",
          commercialCap: "500",
          currency: "EUR",
        },
        `${submitKey.current}-evaluation`,
      );
      let targetRevisionId = targetRevisionKey.current;
      if (kind === "upload") {
        await evalRequest(
          `/projects/${project.id}/targets`,
          "POST",
          {
            orgId,
            title: systemName.trim(),
            config: {
              schema_version: "1.0",
              target_revision_id: targetRevisionId,
              limits: { max_turns: 10, max_output_tokens: 4_000, max_tool_calls: 10, timeout_ms: 120_000, repetitions: 1 },
              requests_per_minute: 6,
              concurrent_sessions: 1,
              reset: "fresh_session",
              kind: "imported_responses",
              source_path: "imports/manual-answers",
              mapping_revision_id: mappingRevisionKey.current,
            },
          },
          `${submitKey.current}-target`,
        );
      } else if (kind === "private") {
        const target=await evalRequest<{id:string;target_id:string}>(`/projects/${project.id}/targets`,"POST",{
          orgId,title:systemName.trim(),config:{schema_version:"1.0",target_revision_id:targetRevisionId,
            limits:{max_turns:1,max_output_tokens:500,max_tool_calls:0,timeout_ms:60000,repetitions:1},
            requests_per_minute:6,concurrent_sessions:1,reset:"fresh_session",kind:"private_runner",
            runner_id:crypto.randomUUID(),connector_version:"caudals-evals-cli:0.1.0"}},`${submitKey.current}-target`);
        const created=await evalRequest<{code:string;expiresAt:string}>("/runner/pairings","POST",{orgId,targetId:target.target_id});
        setPairing({code:created.code,orgId,evaluationId:evaluation.id,expiresAt:created.expiresAt});
        setNotice("Private runner pairing is ready.");
        return;
      } else {
        const normalized = new URL(endpoint);
        normalized.search = "";
        normalized.hash = "";
        const target = await evalRequest<{ id: string; target_id: string }>(
          `/projects/${project.id}/targets`,
          "POST",
          {
            orgId,
            title: systemName.trim(),
            config: {
              schema_version: "1.0",
              target_revision_id: targetRevisionId,
              limits: { max_turns: 10, max_output_tokens: 4_000, max_tool_calls: 10, timeout_ms: 120_000, repetitions: 1 },
              requests_per_minute: 6,
              concurrent_sessions: 1,
              reset: "fresh_session",
              ...(kind === "website"
                ? { kind: "website", endpoint: normalized.toString(), recipe_revision_id: null, login_session_id: null }
                : { kind: "openai_compatible", endpoint: normalized.toString(), model: model.trim(), credential: { kind: "none" } }),
            },
          },
          `${submitKey.current}-target`,
        );
        targetRevisionId = target.id;
        if (kind === "website") {
          await evalRequest(
            `/projects/${project.id}/authorizations`, "POST",
            { orgId, targetId: target.target_id, confirmed: true },
            `${submitKey.current}-authorization`,
          );
        }
        await evalRequest(
          `/targets/${target.id}/checks`,
          "POST",
          { orgId },
          `${submitKey.current}-check`,
        );
      }
      setNotice(t("preparationStarted"));
      router.push(`/workspace/evaluations/${evaluation.id}?orgId=${orgId}`);
    } catch (value) {
      setError(
        value instanceof EvalRequestError && value.code === "CONNECTION_UNSUPPORTED"
          ? t("unsupportedConnection")
          : value instanceof Error
            ? value.message
            : t("error"),
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="eval-flow">
      <PageHeading title={t("newEvaluationAction")}>{t("managedEvaluationsHelp")}</PageHeading>
      {notice && <Status>{notice}</Status>}
      {error && <Status error>{error}</Status>}
      {pairing && <section className="eval-flow-card" aria-live="polite">
        <h2>Connect your private runner</h2>
        <p>Run the CLI inside the environment that can reach your system. It makes outbound requests to Caudals; your system credentials stay there.</p>
        <p>Pairing code (expires {new Date(pairing.expiresAt).toLocaleTimeString()}): <code>{pairing.code}</code></p>
        <p>Use <code>caudals-evals pair --base {typeof window!=="undefined"?window.location.origin:"https://app.caudals.com"} --org {pairing.orgId} --code CODE</code>, replacing CODE with the value above.</p>
        <p>Then run <code>caudals-evals doctor</code>. The code is shown only here; you can create a replacement pairing from Systems.</p>
        <Button asChild><Link href={`/workspace/evaluations/${pairing.evaluationId}?orgId=${pairing.orgId}`}>Continue to preparation</Link></Button>
      </section>}
      {!pairing &&
      <form className="eval-flow-card" onSubmit={submit}>
        <div className="eval-step-heading">
          <span>1</span>
          <div><h2>{t("connectSystem")}</h2><p>{t("evaluationIntro")}</p></div>
        </div>
        <label className="eval-field">
          <span>{t("workspace")}</span>
          <select value={orgId} onChange={(event) => setOrgId(event.target.value)}>
            {workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}
          </select>
        </label>
        <div className="eval-choice-grid" role="radiogroup" aria-label={t("connectionType")}>
          {([["website", t("websiteChatbot")], ["api", t("apiSystem")], ["upload", t("uploadAnswers")], ["private", "Private system / CLI"]] as const).map(([value, label]) => (
            <label key={value} className={kind === value ? "eval-choice eval-choice-active" : "eval-choice"}>
              <input type="radio" name="connection-kind" value={value} checked={kind === value} onChange={() => setKind(value)} />
              <span>{label}</span>
            </label>
          ))}
        </div>
        <Field id="evaluation-project" label={t("projectName")} value={projectName} onChange={(event) => setProjectName(event.target.value)} required />
        <Field id="evaluation-system" label={t("systemName")} value={systemName} onChange={(event) => setSystemName(event.target.value)} required />
        <Field id="evaluation-purpose" label={t("purpose")} placeholder={t("purposePlaceholder")} value={purpose} onChange={(event) => setPurpose(event.target.value)} required />
        {kind !== "upload" && kind !== "private" && <Field id="evaluation-endpoint" type="url" label={kind === "website" ? t("websiteUrl") : t("apiEndpoint")} value={endpoint} onChange={(event) => setEndpoint(event.target.value)} required />}
        {kind === "api" && <Field id="evaluation-model" label={t("modelName")} value={model} onChange={(event) => setModel(event.target.value)} required />}
        {kind === "website" && <label className="eval-check"><input type="checkbox" checked={authorized} onChange={(event) => setAuthorized(event.target.checked)} required /> I own or am authorized to test this system using bounded, non-adversarial questions.</label>}
        {kind === "upload" && <p>Prepare and approve your questions first. Then download a question sheet, collect your system’s answers, and upload them here. Nothing will be sent to your system automatically.</p>}
        {kind === "private" && <p>Prepare and approve questions here, then use a signed bundle in your own network. The runner sends only recorded answers back to Caudals.</p>}
        <Button disabled={!canSubmit || pending}>{pending ? t("connecting") : t("continueSetup")}</Button>
      </form>}
    </div>
  );
}

export function EvaluationJourney({ evaluationId, workspaces }: { evaluationId: string; workspaces: EvalIdentity["workspaces"] }) {
  const requestedOrgId = useSearchParams().get("orgId");
  const orgId = workspaces.some((item) => item.id === requestedOrgId)
    ? requestedOrgId!
    : workspaces[0]?.id ?? "";
  const { summary, error, reload } = useWorkspaceSummary(orgId);
  const canWrite = ["owner", "editor", "operator"].includes(workspaces.find((item) => item.id === orgId)?.role ?? "");
  const [run, setRun] = useState<{
    run: { id: string; status: string; phase: string; execution_mode: string; suite_version_id: string; created_at: string; reason_code: string | null };
    units: Array<{ id: string; status: string }>;
  } | null>(null);
  const [pending, setPending] = useState(false);
  const startKey = useRef(crypto.randomUUID());
  const [actionError, setActionError] = useState("");
  const [actionErrorCode, setActionErrorCode] = useState<"budget" | "connection" | "source" | null>(null);
  const [notice, setNotice] = useState("");
  const evaluation = summary?.evaluations.find((item) => item.id === evaluationId);
  const system = summary?.systems.find((item) => item.project_id === evaluation?.project_id);
  const report = summary?.reports.find((item) => item.evaluation_id === evaluationId);
  const latestRunId = evaluation?.latest_run_id;

  useEffect(() => {
    if (!latestRunId) return;
    let stopped = false;
    const poll = async () => {
      try {
        const value = await evalRequest<NonNullable<typeof run>>(`/runs/${latestRunId}?orgId=${encodeURIComponent(orgId)}`);
        if (!stopped) setRun(value);
      } catch {
        if (!stopped) setActionError(t("error"));
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 5_000);
    return () => { stopped = true; window.clearInterval(timer); };
  }, [latestRunId, orgId]);

  const counts = useMemo(() => {
    const units = run?.units ?? [];
    return {
      total: units.length,
      completed: units.filter((unit) => ["succeeded", "target_error", "transport_error", "timeout", "capture_incomplete", "unsupported", "canceled", "unknown_external_outcome"].includes(unit.status)).length,
    };
  }, [run]);

  async function start() {
    setPending(true); setActionError(""); setActionErrorCode(null);
    try {
      await evalRequest(`/evaluations/${evaluationId}/start`, "POST", { orgId, ...(system ? { targetRevisionId: system.target_revision_id } : {}) }, startKey.current);
      startKey.current = crypto.randomUUID();
      setNotice(t("preparationStarted")); await reload();
    } catch (value) {
      if (value instanceof EvalRequestError && value.code === "BUDGET_PAUSED") { setActionError(t("budgetPaused")); setActionErrorCode("budget"); }
      else if (value instanceof EvalRequestError && value.code === "CONNECTION_UNSUPPORTED") { setActionError(t("unsupportedConnection")); setActionErrorCode("connection"); }
      else { setActionError(t("sourceRequired")); setActionErrorCode("source"); }
    } finally { setPending(false); }
  }
  async function cancel() {
    if (!latestRunId) return;
    setPending(true);
    try {
      await evalRequest(`/runs/${latestRunId}/control`, "POST", { orgId, action: "cancel" });
      setNotice(t("cancelRequested"));
    } catch { setActionError(t("error")); } finally { setPending(false); }
  }
  async function finishManualReport() {
    if (!latestRunId) return;
    setPending(true); setActionError("");
    try {
      await publishPreliminaryManualReport(orgId, latestRunId);
      setNotice("Your preliminary private report is ready.");
      await reload();
    } catch (value) {
      setActionError(value instanceof Error ? value.message : t("error"));
    } finally { setPending(false); }
  }

  if (error || actionError) {
    return <><PageHeading title={evaluation?.title ?? t("selectedEvaluation")} /><Status error>{error || actionError}</Status><section className="eval-panel eval-recovery"><h2>{t("requestAssistance")}</h2><p>{actionErrorCode === "budget" ? t("budgetPausedHelp") : actionErrorCode === "source" ? t("missingSources") : t("unsupportedConnectionHelp")}</p><div className="eval-actions"><Button variant="outline" onClick={() => { setActionError(""); setActionErrorCode(null); void reload(); }}>{t("retry")}</Button><Button asChild variant="outline"><a href="mailto:hello@caudals.com?subject=Evaluation%20assistance">Email Caudals</a></Button><Button asChild variant="outline"><Link href="/workspace/settings">{t("settings")}</Link></Button></div></section></>;
  }
  if (!summary || !evaluation) return <Loading />;
  const awaitingManualAnswers = run?.run.execution_mode === "imported_responses" && run.units.some((unit) => unit.status === "pending");
  const awaitingPrivateRunner = system?.document.kind === "private_runner" && run?.run.status === "paused" && run.run.reason_code === "runner_wait";
  const running = run && ["queued", "running", "pause_requested", "cancel_requested"].includes(run.run.status);
  const terminal = run && ["completed", "partial", "failed", "canceled"].includes(run.run.status);
  return (
    <>
      <PageHeading title={evaluation.title}>{evaluation.project_title}</PageHeading>
      {notice && <Status>{notice}</Status>}
      {!run && !evaluation.selected_suite_version_id && canWrite ? (
        <PrepareEvaluation orgId={orgId} evaluation={evaluation} executionMode={system?.document.kind === "imported_responses" ? "imported_responses" : "deployed_system"} onReady={reload} />
      ) : !run ? (
        <section className="eval-progress-panel" aria-live="polite"><div className="eval-progress-mark" aria-hidden="true" /><div><p className="eval-eyebrow">{t("preparingEvaluation")}</p><h2>{evaluation.preparation_status === "checking_connection" ? t("connectionChecking") : evaluation.preparation_status === "needs_input" ? t("missingSources") : t("checkingTestSet")}</h2><p>{t("closePageHelp")}</p>{evaluation.preparation_status === "ready" || evaluation.selected_suite_version_id ? canWrite && <Button onClick={start} disabled={pending}>{t("runEvaluation")}</Button> : <p>{t("sourceRequired")}</p>}</div></section>
      ) : awaitingManualAnswers ? (
        canWrite
          ? <ManualAnswers orgId={orgId} projectId={evaluation.project_id} runId={run!.run.id} suiteVersionId={run!.run.suite_version_id} pendingCount={run!.units.filter((unit) => unit.status === "pending").length} onSaved={reload} />
          : <Status>Waiting for an owner or editor to upload the remaining answers.</Status>
      ) : awaitingPrivateRunner ? (
        <section className="eval-progress-panel" aria-live="polite"><div className="eval-progress-mark" aria-hidden="true" /><div className="eval-progress-copy"><p className="eval-eyebrow">Waiting for your private runner</p><h2>{counts.completed} of {counts.total} tests received</h2><p>Run <code>caudals-evals fetch</code> inside your network, execute the signed bundle with your local adapter, then upload the signed results. You can close this page.</p><p>Your system credentials stay in your environment. Submitted identity and measurements are reported by your runner.</p><div className="eval-actions">{canWrite && <Button asChild variant="outline"><a href={`/api/evals/v1/runs/${run!.run.id}/runner-bundle?orgId=${encodeURIComponent(orgId)}`}>Download signed bundle</a></Button>}{canWrite && <Button variant="outline" onClick={cancel} disabled={pending}>{t("cancelRun")}</Button>}</div></div></section>
      ) : running ? (
        <section className="eval-progress-panel" aria-live="polite"><div className="eval-progress-mark" aria-hidden="true" /><div className="eval-progress-copy"><p className="eval-eyebrow">{t("running")}</p><h2>{run.run.phase.replaceAll("_", " ")}</h2><p><strong>{counts.completed}</strong> {t("testsCompleted")} · <strong>{counts.total}</strong> {t("tests")}</p><progress max={Math.max(counts.total, 1)} value={counts.completed} /><p>{t("closePageHelp")}</p><Button variant="outline" onClick={cancel} disabled={pending}>{t("cancelRun")}</Button></div></section>
      ) : terminal ? (
        <section className="eval-result-hero"><p><StatusBadge value={run.run.status} /></p><h2>{report ? t("resultsReady") : t("reviewingResults")}</h2><p>{report ? t("preliminaryResults") : t("closePageHelp")}</p><div className="eval-actions">{report && <Button asChild><Link href={`/workspace/reports/${report.id}?orgId=${orgId}`}>{t("reviewFindings")}</Link></Button>}{!report && canWrite && (run.run.execution_mode === "imported_responses" || system?.document.kind === "private_runner") && ["completed", "partial"].includes(run.run.status) && <Button onClick={finishManualReport} disabled={pending}>Prepare preliminary report</Button>}{report && canWrite && <Button variant="outline" onClick={start} disabled={pending}>{t("runAgain")}</Button>}</div></section>
      ) : null}
    </>
  );
}

function WorkspacePicker({ workspaces, value, onChange }: { workspaces: EvalIdentity["workspaces"]; value: string; onChange: (value: string) => void }) {
  return <div className="eval-toolbar"><label htmlFor="workspace-picker">{t("workspace")}</label><select id="workspace-picker" value={value} onChange={(event) => onChange(event.target.value)}>{workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}</select></div>;
}

export function WorkspaceSystems({ workspaces }: { workspaces: EvalIdentity["workspaces"] }) {
  const [orgId, setOrgId] = useState(workspaces[0]?.id ?? "");
  const { summary, error } = useWorkspaceSummary(orgId);
  const [pairing,setPairing]=useState<{code:string;expiresAt:string}|null>(null);
  const [pairError,setPairError]=useState("");
  const role=workspaces.find(item=>item.id===orgId)?.role??"";
  const canPair=["owner","editor","operator"].includes(role),canRevoke=["owner","operator"].includes(role);
  async function pair(targetId:string){
    setPairError("");setPairing(null);
    try{setPairing(await evalRequest<{code:string;expiresAt:string}>("/runner/pairings","POST",{orgId,targetId}));}
    catch(value){setPairError(value instanceof Error?value.message:t("error"));}
  }
  async function revoke(runnerId:string){
    setPairError("");setPairing(null);
    try{await evalRequest(`/runner/${runnerId}?orgId=${encodeURIComponent(orgId)}`,"DELETE");}
    catch(value){setPairError(value instanceof Error?value.message:t("error"));}
  }
  return <><PageHeading title={t("systems")}>{t("connectSystem")}</PageHeading><WorkspacePicker workspaces={workspaces} value={orgId} onChange={value=>{setOrgId(value);setPairing(null);}} />{error && <Status error>{error}</Status>}{pairError && <Status error>{pairError}</Status>}
    {pairing && <section className="eval-flow-card" aria-live="polite"><h2>Private runner pairing</h2><p>This code expires {new Date(pairing.expiresAt).toLocaleTimeString()}. Run <code>caudals-evals pair --base {typeof window!=="undefined"?window.location.origin:"https://app.caudals.com"} --org {orgId} --code CODE</code> inside your network, replacing CODE with:</p><p><code>{pairing.code}</code></p></section>}
    {!summary ? <Loading /> : summary.systems.length ? <DataTable caption={t("systems")} headers={[t("system"), t("connectionType"), t("connection"), { label: "Action", align: "end" }]}>{summary.systems.map((system) => <tr key={system.id}><RowTitle>{system.title}</RowTitle><td><Badge>{humanize(system.document.kind)}</Badge></td><td><span className="p-row" style={{ gap: 6 }}><StatusBadge value={system.document.kind === "private_runner" ? (system.runner_status ?? "pairing_required") : (system.connection_status ?? "checking_connection")} />{system.error_code ? <span className="p-cell-meta">{system.error_code}</span> : null}</span></td><td className="p-table-action">{system.document.kind==="private_runner"&&canPair?<Action variant="secondary" size="sm" onClick={()=>void pair(system.id)}>{system.runner_id?"Replace pairing":"Create pairing code"}</Action>:null}{system.document.kind==="private_runner"&&system.runner_id&&system.runner_status!=="revoked"&&canRevoke?<Action variant="secondary" size="sm" onClick={()=>void revoke(system.runner_id!)}>Revoke runner</Action>:null}</td></tr>)}</DataTable> : <EmptyState title={t("noSystems")} icon={<Plug />}><p>{t("evaluationIntro")}</p></EmptyState>}</>;
}

export function WorkspaceReports({ workspaces }: { workspaces: EvalIdentity["workspaces"] }) {
  const [orgId, setOrgId] = useState(workspaces[0]?.id ?? "");
  const { summary, error } = useWorkspaceSummary(orgId);
  return <><PageHeading title={t("reports")}>{t("privateReport")}</PageHeading><WorkspacePicker workspaces={workspaces} value={orgId} onChange={setOrgId} />{error && <Status error>{error}</Status>}{!summary ? <Loading /> : summary.reports.length ? <DataTable caption={t("reports")} headers={[t("report"), t("statusLabel"), { label: t("access"), align: "end" }]}>{summary.reports.map((report) => <tr key={report.id}><RowTitle>{report.title}</RowTitle><td><Badge tone="pass" dot>{t("reportAvailable")}</Badge></td><td className="p-table-action"><Link className="p-link" href={`/workspace/reports/${report.id}?orgId=${orgId}`}>{t("open")}</Link></td></tr>)}</DataTable> : <EmptyState title={t("noReports")} icon={<FileText />}><p>{t("evaluationHelp")}</p></EmptyState>}</>;
}

export function WorkspaceSettings({ workspaces }: { workspaces: EvalIdentity["workspaces"] }) {
  const [orgId, setOrgId] = useState(workspaces[0]?.id ?? "");
  const { summary, error, reload } = useWorkspaceSummary(orgId);
  const [saved, setSaved] = useState(false);
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    await evalRequest("/workspace/preferences", "PATCH", { orgId, completion: form.has("completion"), requiredInput: form.has("requiredInput"), failure: form.has("failure"), email: form.has("email") });
    setSaved(true); await reload();
  }
  return <><PageHeading title={t("settings")}>{t("workspaceUsageHelp")}</PageHeading><WorkspacePicker workspaces={workspaces} value={orgId} onChange={setOrgId} />{error && <Status error>{error}</Status>}{saved && <Status>{t("preferencesSaved")}</Status>}{!summary ? <Loading /> : <><div className="eval-settings-grid"><section className="eval-panel"><h2>{t("usage")}</h2><DefinitionList items={[{ term: t("monthlyLimit"), value: `${summary.entitlement.monthly_spend_limit} ${summary.entitlement.currency}` }, { term: t("settledSpend"), value: `${summary.usage.settled} ${summary.entitlement.currency}` }, { term: t("outstandingSpend"), value: `${summary.usage.outstanding} ${summary.entitlement.currency}` }, { term: t("activeRunAllowance"), value: summary.entitlement.max_active_runs }]} /></section><section className="eval-panel"><h2>{t("notificationPreferences")}</h2><form className="eval-check-list" onSubmit={save} key={JSON.stringify(summary.preferences)}><label><input name="completion" type="checkbox" defaultChecked={summary.preferences.completion} /> {t("notifyCompletion")}</label><label><input name="requiredInput" type="checkbox" defaultChecked={summary.preferences.required_input} /> {t("notifyRequiredInput")}</label><label><input name="failure" type="checkbox" defaultChecked={summary.preferences.failure} /> {t("notifyFailure")}</label><label><input name="email" type="checkbox" defaultChecked={summary.preferences.email} /> {t("emailNotifications")}</label><Button>{t("savePreferences")}</Button></form></section></div><WorkspaceMonitoringPanel orgId={orgId} canManage={["owner","operator"].includes(workspaces.find(item=>item.id===orgId)?.role??"")} summary={summary} /></>}</>;
}
