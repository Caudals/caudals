"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Code2, FileSpreadsheet, FlaskConical, Globe, Inbox, Pencil, Plus, Terminal, Trash2 } from "lucide-react";
import { evalRequest, EvalRequestError } from "./api";
import {
  Action,
  ActionLink,
  Badge,
  DataTable,
  EmptyState,
  Field,
  FilterChips,
  PageHeading,
  RowTitle,
  SearchInput,
  Status,
  TableSkeleton,
  TextArea,
  Time,
  Toolbar,
} from "./primitives";
import { Meter, percent } from "./charts";
import { ActionMenu, CopyField } from "./overlays";
import { useItemActions } from "./item-actions";
import { useWorkspace } from "./workspace-context";
import { connectionLabel, useWorkspaceSummary } from "./workspace-data";
import { evaluationStage } from "./evaluation-stage";
import { t, tv } from "@/lib/evals/messages/en";

/* ------------------------------------------------------------- listing --- */

type Filter = "all" | "action" | "progress" | "done";

export function WorkspaceEvaluations() {
  const { orgId, workspace, canWrite, withOrg } = useWorkspace();
  const { summary, error, retry, loading, reload } = useWorkspaceSummary(orgId);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const items = useItemActions(orgId, reload);

  const rows = useMemo(() => {
    if (!summary) return [];
    return summary.evaluations.map((evaluation) => {
      const report = summary.reports.find((item) => item.evaluation_id === evaluation.id);
      const system = summary.systems.find((item) => item.project_id === evaluation.project_id);
      return { evaluation, report, system, stage: evaluationStage(evaluation, !!report) };
    });
  }, [summary]);

  const counts = {
    all: rows.length,
    action: rows.filter((row) => row.stage.needsAction).length,
    progress: rows.filter((row) => row.stage.live).length,
    done: rows.filter((row) => row.stage.key === "results").length,
  };
  const needle = query.trim().toLowerCase();
  const visible = rows.filter(
    (row) =>
      (filter === "all" ||
        (filter === "action" && row.stage.needsAction) ||
        (filter === "progress" && row.stage.live) ||
        (filter === "done" && row.stage.key === "results")) &&
      (!needle || `${row.evaluation.title} ${row.evaluation.project_title} ${row.system?.title ?? ""}`.toLowerCase().includes(needle)),
  );

  if (!workspace) return <NoWorkspace />;

  const newAction = canWrite && (
    <ActionLink href={withOrg("/workspace/evaluations/new")}>
      <Plus aria-hidden="true" />
      {t("newEvaluationAction")}
    </ActionLink>
  );

  return (
    <>
      <PageHeading title={t("product")} actions={rows.length ? newAction : undefined} />
      {error && (
        <Status error action={<Action variant="secondary" size="sm" onClick={retry}>{t("retry")}</Action>}>
          {error}
        </Status>
      )}
      {!summary ? (
        loading ? <TableSkeleton columns={4} /> : null
      ) : !rows.length ? (
        <EmptyState title={t("firstEvaluationTitle")} icon={<FlaskConical />} action={newAction}>
          <p>{t("firstEvaluationBody")}</p>
          {!canWrite && <p>{t("viewerNoEvaluations")}</p>}
        </EmptyState>
      ) : (
        <>
          <Toolbar>
            <SearchInput value={query} onChange={setQuery} label={t("searchEvaluations")} />
          </Toolbar>
          <div className="p-toolbar">
            <FilterChips
              value={filter}
              onChange={setFilter}
              label={t("filterEvaluations")}
              options={[
                { value: "all", label: t("all"), count: counts.all },
                { value: "action", label: t("needsAction"), count: counts.action },
                { value: "progress", label: t("inProgress"), count: counts.progress },
                { value: "done", label: t("resultsReady"), count: counts.done },
              ]}
            />
          </div>
          {visible.length ? (
            <DataTable
              caption={t("product")}
              headers={[t("evaluation"), t("statusLabel"), t("latestResult"), { label: t("updated"), align: "end" }, ...(canWrite ? [{ label: t("actions"), align: "end" as const, hidden: true }] : [])]}
            >
              {visible.map(({ evaluation, report, system, stage }) => (
                <tr key={evaluation.id}>
                  <RowTitle
                    href={withOrg(`/workspace/evaluations/${evaluation.id}`)}
                    meta={system ? `${system.title} · ${connectionLabel(system.document.kind)}` : evaluation.project_title}
                  >
                    {evaluation.title}
                  </RowTitle>
                  <td>
                    <Badge tone={stage.tone} dot live={stage.live}>
                      {stage.label}
                    </Badge>
                  </td>
                  <td>
                    {report?.strict_pass_rate != null ? (
                      <span className="p-table-primary">
                        <Meter value={report.strict_pass_rate} label={`${t("strictPassRate")} ${percent(report.strict_pass_rate)}`} />
                        {report.n_scorable != null && <span className="p-cell-meta">{tv("answersCorrectOf", { pass: report.n_pass ?? 0, scored: report.n_scorable })}</span>}
                      </span>
                    ) : (
                      <span className="p-cell-meta">—</span>
                    )}
                  </td>
                  <td className="p-table-action p-cell-meta">
                    <Time value={evaluation.updated_at ?? evaluation.created_at ?? null} />
                  </td>
                  {canWrite && (
                    <td className="p-table-action">
                      <ActionMenu
                        label={`${t("moreActions")}: ${evaluation.title}`}
                        items={[
                          { label: t("rename"), icon: <Pencil />, onSelect: () => items.rename("evaluations", evaluation.id, evaluation.title) },
                          { separator: true },
                          { label: t("delete"), icon: <Trash2 />, tone: "danger", onSelect: () => items.remove("evaluations", evaluation.id, evaluation.title) },
                        ]}
                      />
                    </td>
                  )}
                </tr>
              ))}
            </DataTable>
          ) : (
            <EmptyState title={t("noMatchingEvaluations")} icon={<Inbox />}>
              <p>{t("noMatchingEvaluationsHelp")}</p>
            </EmptyState>
          )}
        </>
      )}
      {items.dialog}
    </>
  );
}

export function NoWorkspace() {
  return (
    <>
      <PageHeading title={t("product")} />
      <EmptyState
        title={t("noWorkspace")}
        icon={<Inbox />}
        action={
          <ActionLink variant="secondary" href="/workspace/invitations">
            {t("invitations")}
          </ActionLink>
        }
      >
        <p>{t("noWorkspaceHelp")}</p>
      </EmptyState>
    </>
  );
}

/* ------------------------------------------------------ new evaluation --- */

type ConnectionKind = "website" | "api" | "upload" | "private";
const KIND_ENTITLEMENT: Record<ConnectionKind, string> = {
  website: "website",
  api: "openai_compatible",
  upload: "imported_responses",
  private: "private_runner",
};

export function NewEvaluationFlow() {
  const router = useRouter();
  const { orgId, workspace, canWrite, withOrg } = useWorkspace();
  const { summary } = useWorkspaceSummary(orgId);
  const allowed = summary?.entitlement.allowed_connection_types ?? null;
  const isAllowed = (kind: ConnectionKind) => !allowed || allowed.includes(KIND_ENTITLEMENT[kind]);
  const [kind, setKind] = useState<ConnectionKind>("website");
  const [name, setName] = useState("");
  const [purpose, setPurpose] = useState("");
  const [endpoint, setEndpoint] = useState("https://");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [pairing, setPairing] = useState<{ code: string; evaluationId: string; expiresAt: string } | null>(null);
  const submitKey = useRef(crypto.randomUUID());
  const targetRevisionKey = useRef(crypto.randomUUID());
  const mappingRevisionKey = useRef(crypto.randomUUID());

  const needsUrl = kind === "website" || kind === "api";
  const validUrl = (() => {
    try {
      return new URL(endpoint).protocol === "https:";
    } catch {
      return false;
    }
  })();
  const canSubmit =
    !!orgId &&
    canWrite &&
    isAllowed(kind) &&
    !!name.trim() &&
    !!purpose.trim() &&
    (!needsUrl || validUrl) &&
    (kind !== "api" || !!model.trim());

  const choices: Array<{ value: ConnectionKind; label: string; description: string; icon: React.ReactNode }> = [
    { value: "website", label: t("websiteChatbot"), description: t("websiteChatbotDesc"), icon: <Globe /> },
    { value: "api", label: t("apiSystem"), description: t("apiSystemDesc"), icon: <Code2 /> },
    { value: "upload", label: t("uploadAnswers"), description: t("uploadAnswersDesc"), icon: <FileSpreadsheet /> },
    { value: "private", label: t("privateSystem"), description: t("privateSystemDesc"), icon: <Terminal /> },
  ];

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit || pending) return;
    setPending(true);
    setError("");
    const title = name.trim();
    try {
      const project = await evalRequest<{ id: string }>(
        "/projects",
        "POST",
        { orgId, title, description: purpose.trim() },
        `${submitKey.current}-project`,
      );
      const evaluation = await evalRequest<{ id: string }>(
        "/evaluations",
        "POST",
        { orgId, projectId: project.id, title, evidencePolicy: "source_grounded", commercialCap: "500", currency: "EUR" },
        `${submitKey.current}-evaluation`,
      );
      let targetRevisionId = targetRevisionKey.current;
      const limits = { max_turns: 10, max_output_tokens: 4_000, max_tool_calls: 10, timeout_ms: 120_000, repetitions: 1 };
      if (kind === "upload") {
        await evalRequest(
          `/projects/${project.id}/targets`,
          "POST",
          {
            orgId,
            title,
            config: {
              schema_version: "1.0",
              target_revision_id: targetRevisionId,
              limits,
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
        const target = await evalRequest<{ id: string; target_id: string }>(
          `/projects/${project.id}/targets`,
          "POST",
          {
            orgId,
            title,
            config: {
              schema_version: "1.0",
              target_revision_id: targetRevisionId,
              limits: { max_turns: 1, max_output_tokens: 500, max_tool_calls: 0, timeout_ms: 60000, repetitions: 1 },
              requests_per_minute: 6,
              concurrent_sessions: 1,
              reset: "fresh_session",
              kind: "private_runner",
              runner_id: crypto.randomUUID(),
              connector_version: "caudals-evals-cli:0.1.0",
            },
          },
          `${submitKey.current}-target`,
        );
        const created = await evalRequest<{ code: string; expiresAt: string }>("/runner/pairings", "POST", { orgId, targetId: target.target_id });
        setPairing({ code: created.code, evaluationId: evaluation.id, expiresAt: created.expiresAt });
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
            title,
            config: {
              schema_version: "1.0",
              target_revision_id: targetRevisionId,
              limits,
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
        if (kind === "api" && apiKey) {
          // Stored write-only; the returned system version binds the credential.
          const stored = await evalRequest<{ targetRevisionId: string }>(
            `/targets/${target.target_id}/credentials`,
            "POST",
            { orgId, label: "API key", kind: "bearer", headerName: "Authorization", value: apiKey },
            `${submitKey.current}-credential`,
          );
          setApiKey("");
          targetRevisionId = stored.targetRevisionId;
        }
        if (kind === "website") {
          await evalRequest(
            `/projects/${project.id}/authorizations`,
            "POST",
            { orgId, targetId: target.target_id, confirmed: true },
            `${submitKey.current}-authorization`,
          );
        }
        await evalRequest(`/targets/${targetRevisionId}/checks`, "POST", { orgId }, `${submitKey.current}-check`);
      }
      router.push(withOrg(`/workspace/evaluations/${evaluation.id}`));
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

  if (!workspace) return <NoWorkspace />;

  if (pairing)
    return (
      <div className="p-flow">
        <PageHeading title={t("connectRunnerTitle")}>
          {t("connectRunnerHelp")}
        </PageHeading>
        <section className="p-flow-card" aria-live="polite">
          <CopyField label={t("pairingCode")} value={pairing.code} hint={`${t("expires")} ${new Date(pairing.expiresAt).toLocaleTimeString()}. ${t("pairingShownOnce")}`} />
          <ol className="p-list-steps">
            <li>
              {t("runnerStepPair")}
              <pre className="p-pre">{`caudals-evals pair --base ${typeof window !== "undefined" ? window.location.origin : "https://app.caudals.com"} --org ${orgId} --code <CODE>`}</pre>
            </li>
            <li>
              {t("runnerStepDoctor")} <code className="p-code">caudals-evals doctor</code>
            </li>
            <li>{t("runnerStepContinue")}</li>
          </ol>
          <div className="p-flow-actions">
            <ActionLink href={withOrg(`/workspace/evaluations/${pairing.evaluationId}`)}>{t("continueToPreparation")}</ActionLink>
          </div>
        </section>
      </div>
    );

  return (
    <div className="p-flow">
      <PageHeading title={t("newEvaluationAction")}>
        {t("newEvaluationHelp")}
      </PageHeading>
      {!canWrite && <Status tone="warn">{t("viewerCannotCreate")}</Status>}
      {error && <Status error>{error}</Status>}
      <form className="p-flow-card" onSubmit={submit}>
        <fieldset className="p-fieldset">
          <legend>{t("whatAreYouEvaluating")}</legend>
          <Field id="evaluation-name" label={t("evaluationNameLabel")} placeholder={t("evaluationNamePlaceholder")} value={name} onChange={(event) => setName(event.target.value)} maxLength={160} required />
          <TextArea id="evaluation-purpose" label={t("purpose")} placeholder={t("purposePlaceholder")} value={purpose} onChange={(event) => setPurpose(event.target.value)} rows={2} maxLength={2000} required hint={t("purposeHint")} />
        </fieldset>

        <fieldset className="p-fieldset">
          <legend>{t("howToReachIt")}</legend>
          <div className="p-choice-grid" role="radiogroup" aria-label={t("connectionType")}>
            {choices.map((choice) => {
              const enabled = isAllowed(choice.value);
              return (
                <label key={choice.value} className="p-choice" data-disabled={enabled ? undefined : "true"}>
                  <input type="radio" name="connection-kind" aria-label={choice.label} value={choice.value} checked={kind === choice.value} disabled={!enabled} onChange={() => setKind(choice.value)} />
                  {choice.icon}
                  <span className="p-choice-title">{choice.label}</span>
                  <span className="p-choice-desc">{enabled ? choice.description : t("connectionNotEnabled")}</span>
                </label>
              );
            })}
          </div>
          {kind === "website" && (
            <>
              <Field id="evaluation-endpoint" type="url" inputMode="url" label={t("websiteUrl")} placeholder="https://example.com/help" value={endpoint} onChange={(event) => setEndpoint(event.target.value)} required hint={t("websiteAuthorizationHelp")} />
            </>
          )}
          {kind === "api" && (
            <>
              <Field id="evaluation-endpoint" type="url" inputMode="url" label={t("apiEndpoint")} placeholder="https://api.example.com/v1" value={endpoint} onChange={(event) => setEndpoint(event.target.value)} required hint={t("apiEndpointHint")} />
              <Field id="evaluation-model" label={t("modelName")} placeholder="gpt-4.1-mini" value={model} onChange={(event) => setModel(event.target.value)} required />
              <Field id="evaluation-api-key" type="password" autoComplete="new-password" label={t("apiKeyOptional")} hint={t("apiKeyHint")} value={apiKey} onChange={(event) => setApiKey(event.target.value)} />
            </>
          )}
          {kind === "upload" && <p className="p-flow-note">{t("uploadAnswersFlowHelp")}</p>}
          {kind === "private" && <p className="p-flow-note">{t("privateSystemFlowHelp")}</p>}
        </fieldset>

        <div className="p-flow-actions">
          <span className="p-cell-meta">
            {t("workspace")}: {workspace.name}
          </span>
          <Action type="submit" disabled={!canSubmit || pending}>
            {pending ? t("creatingEvaluation") : t("createEvaluation")}
          </Action>
        </div>
      </form>
    </div>
  );
}
