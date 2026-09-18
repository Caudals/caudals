"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { EvalIdentity } from "@/lib/evals/domain/identity";
import { evalRequest, EvalRequestError } from "./api";
import { DataTable, EmptyState, Field, PageHeading, Status } from "./primitives";
import { Button } from "@/components/ui/button";
import { t } from "@/lib/evals/messages/en";

export type WorkspaceSummary = {
  evaluations: Array<{
    id: string;
    title: string;
    project_title: string;
    preparation_status: string;
    reason_code: string | null;
    selected_suite_version_id: string | null;
    latest_run_id: string | null;
    latest_run_status: string | null;
    latest_run_phase: string | null;
  }>;
  systems: Array<{
    id: string;
    title: string;
    target_revision_id: string;
    document: { kind: string };
    connection_status: string | null;
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
    return () => window.clearTimeout(timer);
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
        <EmptyState title={t("noWorkspace")}>
          <p>{t("noWorkspaceHelp")}</p>
          <Link href="/workspace/invitations">{t("invitations")}</Link>
        </EmptyState>
      </>
    );
  }
  const canWrite = ["owner", "editor", "operator"].includes(workspace.role);
  return (
    <>
      <PageHeading title={t("product")}>{t("evaluationHelp")}</PageHeading>
      <div className="eval-toolbar">
        <label htmlFor="workspace">{t("workspace")}</label>
        <select id="workspace" value={orgId} onChange={(event) => setOrgId(event.target.value)}>
          {workspaces.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        <span className="eval-chip">{t(workspace.role)}</span>
        {canWrite && (
          <Button asChild>
            <Link href={`/workspace/evaluations/new?orgId=${orgId}`}>
              {t("newEvaluationAction")}
            </Link>
          </Button>
        )}
      </div>
      {error && <Status error>{error}</Status>}
      {!summary ? (
        <Status>{t("loading")}</Status>
      ) : summary.evaluations.length ? (
        <DataTable
          caption={t("recentEvaluations")}
          headers={[t("evaluation"), t("preparation"), t("lastRun"), t("access")]}
        >
          {summary.evaluations.map((evaluation) => (
            <tr key={evaluation.id}>
              <th scope="row">
                <span>{evaluation.title}</span>
                <small className="eval-cell-meta">{evaluation.project_title}</small>
              </th>
              <td>{evaluation.preparation_status}</td>
              <td>{evaluation.latest_run_status ?? t("notAvailable")}</td>
              <td>
                <Link href={`/workspace/evaluations/${evaluation.id}?orgId=${orgId}`}>
                  {t("open")}
                </Link>
              </td>
            </tr>
          ))}
        </DataTable>
      ) : (
        <EmptyState title={t("noEvaluations")}>
          <p>{t("evaluationIntro")}</p>
          {canWrite && (
            <Button asChild>
              <Link href={`/workspace/evaluations/new?orgId=${orgId}`}>
                {t("newEvaluationAction")}
              </Link>
            </Button>
          )}
        </EmptyState>
      )}
    </>
  );
}

type ConnectionKind = "website" | "api" | "upload";

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
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [selectedFile, setSelectedFile] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const submitKey = useRef(crypto.randomUUID());
  const canSubmit =
    !!orgId && !!projectName.trim() && !!systemName.trim() && !!purpose.trim() &&
    (kind === "upload" ? !!selectedFile : endpoint.startsWith("https://")) &&
    (kind !== "api" || !!model.trim());

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
      let targetRevisionId = crypto.randomUUID();
      if (kind === "upload") {
        const file = fileRef.current?.files?.[0];
        if (!file) throw new Error(t("error"));
        const form = new FormData();
        form.set("orgId", orgId);
        form.set("projectId", project.id);
        form.set("intent", "recorded_answers");
        form.set(
          "format",
          file.name.endsWith(".xlsx") ? "xlsx" : file.name.endsWith(".jsonl") ? "jsonl" : "csv",
        );
        form.set(
          "mapping",
          JSON.stringify({
            case_id: "case_id",
            case_revision_id: "case_revision_id",
            suite_version_id: "suite_version_id",
            input: "input",
            system_answer: "system_answer",
          }),
        );
        form.set("file", file);
        const response = await fetch("/api/evals/v1/imports", {
          method: "POST",
          headers: { "Idempotency-Key": `${submitKey.current}-import` },
          body: form,
        });
        const result = await response.json();
        if (!response.ok) throw new Error(t("error"));
        const importId = result.data.id as string;
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
              source_path: `imports/${importId}.jsonl`,
              mapping_revision_id: importId,
            },
          },
          `${submitKey.current}-target`,
        );
      } else {
        const normalized = new URL(endpoint);
        normalized.search = "";
        normalized.hash = "";
        const target = await evalRequest<{ id: string }>(
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
          {([["website", t("websiteChatbot")], ["api", t("apiSystem")], ["upload", t("uploadAnswers")]] as const).map(([value, label]) => (
            <label key={value} className={kind === value ? "eval-choice eval-choice-active" : "eval-choice"}>
              <input type="radio" name="connection-kind" value={value} checked={kind === value} onChange={() => setKind(value)} />
              <span>{label}</span>
            </label>
          ))}
        </div>
        <Field id="evaluation-project" label={t("projectName")} value={projectName} onChange={(event) => setProjectName(event.target.value)} required />
        <Field id="evaluation-system" label={t("systemName")} value={systemName} onChange={(event) => setSystemName(event.target.value)} required />
        <Field id="evaluation-purpose" label={t("purpose")} placeholder={t("purposePlaceholder")} value={purpose} onChange={(event) => setPurpose(event.target.value)} required />
        {kind !== "upload" && <Field id="evaluation-endpoint" type="url" label={kind === "website" ? t("websiteUrl") : t("apiEndpoint")} value={endpoint} onChange={(event) => setEndpoint(event.target.value)} required />}
        {kind === "api" && <Field id="evaluation-model" label={t("modelName")} value={model} onChange={(event) => setModel(event.target.value)} required />}
        {kind === "upload" && (
          <label className="eval-field">
            <span>{t("importFile")}</span>
            <input ref={fileRef} type="file" accept=".csv,.xlsx,.jsonl" required onChange={(event) => setSelectedFile(event.target.files?.[0]?.name ?? "")} />
            <small>{t("uploadFormatHelp")}</small>
          </label>
        )}
        <Button disabled={!canSubmit || pending}>{pending ? t("connecting") : t("continueSetup")}</Button>
      </form>
    </div>
  );
}

export function EvaluationJourney({ evaluationId, workspaces }: { evaluationId: string; workspaces: EvalIdentity["workspaces"] }) {
  const requestedOrgId = useSearchParams().get("orgId");
  const orgId = workspaces.some((item) => item.id === requestedOrgId)
    ? requestedOrgId!
    : workspaces[0]?.id ?? "";
  const { summary, error, reload } = useWorkspaceSummary(orgId);
  const [run, setRun] = useState<{
    run: { id: string; status: string; phase: string; created_at: string; reason_code: string | null };
    units: Array<{ id: string; status: string }>;
  } | null>(null);
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const evaluation = summary?.evaluations.find((item) => item.id === evaluationId);
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
    setPending(true); setActionError("");
    try {
      await evalRequest(`/evaluations/${evaluationId}/start`, "POST", { orgId }, crypto.randomUUID());
      setNotice(t("preparationStarted")); await reload();
    } catch (value) {
      if (value instanceof EvalRequestError && value.code === "BUDGET_PAUSED") setActionError(t("budgetPaused"));
      else if (value instanceof EvalRequestError && value.code === "CONNECTION_UNSUPPORTED") setActionError(t("unsupportedConnection"));
      else setActionError(t("sourceRequired"));
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

  if (error || actionError) {
    return <><PageHeading title={evaluation?.title ?? t("selectedEvaluation")} /><Status error>{error || actionError}</Status><section className="eval-panel eval-recovery"><h2>{t("requestAssistance")}</h2><p>{t("unsupportedConnectionHelp")}</p><Button asChild variant="outline"><Link href="/workspace/settings">{t("settings")}</Link></Button></section></>;
  }
  if (!summary || !evaluation) return <Status>{t("loading")}</Status>;
  const running = run && ["queued", "running", "pause_requested", "cancel_requested"].includes(run.run.status);
  const terminal = run && ["completed", "partial", "failed", "canceled"].includes(run.run.status);
  return (
    <>
      <PageHeading title={evaluation.title}>{evaluation.project_title}</PageHeading>
      {notice && <Status>{notice}</Status>}
      {!run ? (
        <section className="eval-progress-panel" aria-live="polite"><div className="eval-progress-mark" aria-hidden="true" /><div><p className="eval-eyebrow">{t("preparingEvaluation")}</p><h2>{evaluation.preparation_status === "checking_connection" ? t("connectionChecking") : evaluation.preparation_status === "needs_input" ? t("missingSources") : t("checkingTestSet")}</h2><p>{t("closePageHelp")}</p>{evaluation.preparation_status === "ready" || evaluation.selected_suite_version_id ? <Button onClick={start} disabled={pending}>{t("runEvaluation")}</Button> : <p>{t("sourceRequired")}</p>}</div></section>
      ) : running ? (
        <section className="eval-progress-panel" aria-live="polite"><div className="eval-progress-mark" aria-hidden="true" /><div className="eval-progress-copy"><p className="eval-eyebrow">{t("running")}</p><h2>{run.run.phase.replaceAll("_", " ")}</h2><p><strong>{counts.completed}</strong> {t("testsCompleted")} · <strong>{counts.total}</strong> {t("tests")}</p><progress max={Math.max(counts.total, 1)} value={counts.completed} /><p>{t("closePageHelp")}</p><Button variant="outline" onClick={cancel} disabled={pending}>{t("cancelRun")}</Button></div></section>
      ) : terminal ? (
        <section className="eval-result-hero"><p className="eval-eyebrow">{run.run.status}</p><h2>{report ? t("resultsReady") : t("reviewingResults")}</h2><p>{report ? t("preliminaryResults") : t("closePageHelp")}</p><div className="eval-actions">{report && <Button asChild><Link href={`/workspace/reports/${report.id}?orgId=${orgId}`}>{t("reviewFindings")}</Link></Button>}<Button variant="outline" onClick={start} disabled={pending}>{t("runAgain")}</Button></div></section>
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
  return <><PageHeading title={t("systems")}>{t("connectSystem")}</PageHeading><WorkspacePicker workspaces={workspaces} value={orgId} onChange={setOrgId} />{error && <Status error>{error}</Status>}{!summary ? <Status>{t("loading")}</Status> : summary.systems.length ? <DataTable caption={t("systems")} headers={[t("system"), t("connectionType"), t("connection")]}>{summary.systems.map((system) => <tr key={system.id}><th scope="row">{system.title}</th><td>{system.document.kind}</td><td>{system.connection_status ?? t("connectionChecking")}{system.error_code ? ` · ${system.error_code}` : ""}</td></tr>)}</DataTable> : <EmptyState title={t("noSystems")}><p>{t("evaluationIntro")}</p></EmptyState>}</>;
}

export function WorkspaceReports({ workspaces }: { workspaces: EvalIdentity["workspaces"] }) {
  const [orgId, setOrgId] = useState(workspaces[0]?.id ?? "");
  const { summary, error } = useWorkspaceSummary(orgId);
  return <><PageHeading title={t("reports")}>{t("privateReport")}</PageHeading><WorkspacePicker workspaces={workspaces} value={orgId} onChange={setOrgId} />{error && <Status error>{error}</Status>}{!summary ? <Status>{t("loading")}</Status> : summary.reports.length ? <DataTable caption={t("reports")} headers={[t("report"), t("statusLabel"), t("access")]}>{summary.reports.map((report) => <tr key={report.id}><th scope="row">{report.title}</th><td>{t("reportAvailable")}</td><td><Link href={`/workspace/reports/${report.id}?orgId=${orgId}`}>{t("open")}</Link></td></tr>)}</DataTable> : <EmptyState title={t("noReports")}><p>{t("evaluationHelp")}</p></EmptyState>}</>;
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
  return <><PageHeading title={t("settings")}>{t("workspaceUsageHelp")}</PageHeading><WorkspacePicker workspaces={workspaces} value={orgId} onChange={setOrgId} />{error && <Status error>{error}</Status>}{saved && <Status>{t("preferencesSaved")}</Status>}{!summary ? <Status>{t("loading")}</Status> : <div className="eval-settings-grid"><section className="eval-panel"><h2>{t("usage")}</h2><dl className="eval-metrics-list"><div><dt>{t("monthlyLimit")}</dt><dd>{summary.entitlement.monthly_spend_limit} {summary.entitlement.currency}</dd></div><div><dt>{t("settledSpend")}</dt><dd>{summary.usage.settled} {summary.entitlement.currency}</dd></div><div><dt>{t("outstandingSpend")}</dt><dd>{summary.usage.outstanding} {summary.entitlement.currency}</dd></div><div><dt>{t("activeRunAllowance")}</dt><dd>{summary.entitlement.max_active_runs}</dd></div></dl></section><section className="eval-panel"><h2>{t("notificationPreferences")}</h2><form className="eval-check-list" onSubmit={save} key={JSON.stringify(summary.preferences)}><label><input name="completion" type="checkbox" defaultChecked={summary.preferences.completion} /> {t("notifyCompletion")}</label><label><input name="requiredInput" type="checkbox" defaultChecked={summary.preferences.required_input} /> {t("notifyRequiredInput")}</label><label><input name="failure" type="checkbox" defaultChecked={summary.preferences.failure} /> {t("notifyFailure")}</label><label><input name="email" type="checkbox" defaultChecked={summary.preferences.email} /> {t("emailNotifications")}</label><Button>{t("savePreferences")}</Button></form></section></div>}</>;
}
