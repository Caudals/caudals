"use client";

/**
 * Prospect snapshots (launch L-21, spec v2 P-35): paste a public chat URL and
 * a help-centre URL, get a sandbox evaluation that asks ordinary questions
 * within traffic limits, then a private 30-day "external snapshot" link, an
 * EN/ES outreach draft to edit and, on an explicit click, a CRM draft for
 * Warmbly. Nothing on these pages sends anything to anyone.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Camera, Copy, ExternalLink, Plus } from "lucide-react";
import { evalRequest } from "./api";
import {
  Action, ActionLink, Badge, Check, DataTable, DefinitionList, EmptyState, Field, Loading, PageHeading, RowTitle, Section, SelectField,
  Status, StatusBadge, Steps, Tabs, TextArea, Time, formatDate,
} from "./primitives";
import { notify } from "./overlays";
import { getLocale, t, tv } from "@/lib/evals/messages/runtime";

type Basis = "public_information" | "owner_permission";
type Limits = { dailyCap: number; maxQuestions: number; requestsPerMinute: number; concurrentSessions: number; runsPerMonth: number; helpPages: number };
type ListRow = {
  id: string; orgId: string; company: string; targetHost: string; helpHost: string; testingBasis: Basis; locale: "en" | "es";
  evaluationId: string | null; shared: boolean; shareActive: boolean; shareRevoked?: boolean; shareExpiresAt: string | null; crmDraft: boolean; createdAt: string; mine: boolean;
};
type ListData = { snapshots: ListRow[]; today: { created: number; cap: number }; limits: Limits };
type Draft = { linkedin: string; emailSubject: string; emailBody: string };
type Detail = {
  id: string; orgId: string; company: string; targetUrl: string; targetHost: string; helpUrl: string; helpHost: string; locale: "en" | "es";
  testingBasis: Basis; basisNote: string | null; trafficLimit: { requests_per_minute: number; concurrent_sessions: number; max_questions: number; runs_per_month: number };
  createdAt: string; projectId: string | null; evaluationId: string | null; setupComplete: boolean;
  evaluation: { id: string; title: string; preparationStatus: string; updatedAt: string } | null;
  connection: { status: string; checkedAt: string } | null;
  source: { status: string; pageLimit: number } | null;
  run: { id: string; status: string; phase: string; updatedAt: string } | null;
  report: { id: string; revisionId: string; reviewStatus: string; publishedAt: string; metrics: { scored: number; pass: number; partial: number; fail: number } | null; finding: string | null } | null;
  share: { id: string; expiresAt: string; revokedAt: string | null; label: string | null; views: number; active: boolean; current: boolean } | null;
  crmDraft: { id: string; createdAt: string; summary: Record<string, unknown> } | null;
  weak: boolean | null;
  outreach: Record<"en" | "es", Draft> | null;
};

const basisLabel = (basis: Basis) => t(basis === "owner_permission" ? "psBasisOwner" : "psBasisPublic");
const workspaceLink = (detail: Pick<Detail, "orgId" | "evaluationId">) => `/workspace/evaluations/${detail.evaluationId}?orgId=${detail.orgId}`;

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    notify(t("copied"));
  } catch {
    notify(t("error"));
  }
}

/* ------------------------------------------------------------------ list --- */

export function ProspectSnapshots() {
  const [data, setData] = useState<ListData | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    evalRequest<ListData>("/prospects").then(setData).catch((reason) => setError(reason instanceof Error ? reason.message : t("error")));
  }, []);
  return (
    <>
      <PageHeading
        title={t("psTitle")}
        actions={<ActionLink href="/ops/prospects/new"><Plus aria-hidden="true" />{t("psNew")}</ActionLink>}
      >
        {t("psIntro")}
      </PageHeading>
      {error && <Status error>{error}</Status>}
      {!data && !error ? <Loading /> : data && (
        <>
          <p className="p-cell-meta" data-testid="snapshot-cap">{tv("psToday", { created: data.today.created, cap: data.today.cap })}</p>
          {data.snapshots.length ? (
            <DataTable caption={t("psTitle")} headers={[t("psCompany"), t("psBasis"), t("psLink"), t("psCrmDraft"), { label: t("psCreated"), align: "end" }]}>
              {data.snapshots.map((row) => (
                <tr key={row.id}>
                  <RowTitle href={`/ops/prospects/${row.id}`} meta={row.targetHost}>{row.company}</RowTitle>
                  <td>{basisLabel(row.testingBasis)}</td>
                  <td>{row.shared && row.shareExpiresAt
                    ? row.shareActive
                      ? <Badge tone="pass" dot>{tv("psSharedUntil", { date: formatDate(row.shareExpiresAt) })}</Badge>
                      : <Badge tone="neutral" dot>{row.shareRevoked ? t("psLinkRevoked") : t("psLinkExpired")}</Badge>
                    : <span className="p-cell-meta">{t("psNotShared")}</span>}</td>
                  <td>{row.crmDraft ? <Badge tone="info" dot>{t("psDraftCreated")}</Badge> : <span className="p-cell-meta">—</span>}</td>
                  <td className="p-table-action p-cell-meta"><Time value={row.createdAt} /></td>
                </tr>
              ))}
            </DataTable>
          ) : (
            <EmptyState title={t("psEmpty")} icon={<Camera />} action={<ActionLink href="/ops/prospects/new"><Plus aria-hidden="true" />{t("psNew")}</ActionLink>}>
              <p>{t("psEmptyHelp")}</p>
            </EmptyState>
          )}
        </>
      )}
    </>
  );
}

/* ------------------------------------------------------------------- new --- */

export function NewProspectSnapshot({ limits }: { limits: Limits }) {
  const router = useRouter();
  const [company, setCompany] = useState("");
  const [chatUrl, setChatUrl] = useState("");
  const [helpUrl, setHelpUrl] = useState("");
  const [locale, setLocale] = useState<"en" | "es">(getLocale());
  const [basis, setBasis] = useState<Basis>("public_information");
  const [basisNote, setBasisNote] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const key = useRef<string>("");
  const ready = company.trim() && chatUrl.trim() && helpUrl.trim() && confirmed && (basis === "public_information" || basisNote.trim());

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!ready || pending) return;
    setPending(true);
    setError("");
    key.current ||= crypto.randomUUID();
    try {
      const created = await evalRequest<{ id: string }>("/prospects", "POST", {
        company: company.trim(), chatUrl: chatUrl.trim(), helpUrl: helpUrl.trim(), locale, basis,
        ...(basisNote.trim() ? { basisNote: basisNote.trim() } : {}), confirmPolicy: true,
      }, key.current);
      notify(t("psCreatedToast"));
      router.push(`/ops/prospects/${created.id}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("error"));
      setPending(false);
    }
  }

  return (
    <>
      <PageHeading title={t("psNew")}>{t("psNewIntro")}</PageHeading>
      <form className="p-stack" style={{ maxWidth: 640 }} onSubmit={submit} aria-label={t("psNew")}>
        {error && <Status error>{error}</Status>}
        <Field id="ps-company" label={t("psCompany")} value={company} onChange={(event) => setCompany(event.target.value)} maxLength={120} required autoFocus />
        <Field id="ps-chat" label={t("psChatUrl")} hint={t("psChatUrlHint")} type="url" inputMode="url" placeholder="https://" value={chatUrl} onChange={(event) => setChatUrl(event.target.value)} maxLength={2048} required />
        <Field id="ps-help" label={t("psHelpUrl")} hint={tv("psHelpUrlHint", { pages: limits.helpPages })} type="url" inputMode="url" placeholder="https://" value={helpUrl} onChange={(event) => setHelpUrl(event.target.value)} maxLength={2048} required />
        <SelectField id="ps-locale" label={t("psLanguage")} hint={t("psLanguageHint")} value={locale} onChange={(event) => setLocale(event.target.value as "en" | "es")}>
          <option value="en">English</option>
          <option value="es">Español</option>
        </SelectField>
        <SelectField id="ps-basis" label={t("psBasis")} value={basis} onChange={(event) => setBasis(event.target.value as Basis)}>
          <option value="public_information">{t("psBasisPublic")}</option>
          <option value="owner_permission">{t("psBasisOwner")}</option>
        </SelectField>
        <TextArea id="ps-basis-note" label={basis === "owner_permission" ? t("psBasisNoteRequired") : t("psBasisNote")} value={basisNote}
          onChange={(event) => setBasisNote(event.target.value)} maxLength={500} rows={2} required={basis === "owner_permission"} />
        <Section title={t("psPolicyTitle")}>
          <ul className="p-bullets" data-testid="snapshot-policy">
            <li>{t("psPolicyOrdinary")}</li>
            <li>{t("psPolicyPublic")}</li>
            <li>{tv("psPolicyLimits", { questions: limits.maxQuestions, rpm: limits.requestsPerMinute, runs: limits.runsPerMonth })}</li>
            <li>{t("psPolicyNoBypass")}</li>
            <li>{t("psPolicySharing")}</li>
            <li>{t("psPolicyNothingSent")}</li>
          </ul>
          <Check label={t("psConfirm")} checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
        </Section>
        <div className="p-row">
          <ActionLink variant="secondary" href="/ops/prospects">{t("cancel")}</ActionLink>
          <Action type="submit" disabled={!ready || pending}>{pending ? t("psCreating") : t("psCreate")}</Action>
        </div>
      </form>
    </>
  );
}

/* ---------------------------------------------------------------- detail --- */

type StepState = "done" | "current" | "upcoming" | "blocked";
const FAILED = new Set(["failed", "canceled", "needs_operator", "needs_assistance", "unsupported", "unhealthy"]);

function progress(detail: Detail) {
  const connectionOk = ["ready", "succeeded", "healthy", "completed"].includes(detail.connection?.status ?? "");
  const sourceOk = detail.source?.status === "completed" || detail.source?.status === "ready";
  const questionsOk = ["ready", "awaiting_answers"].includes(detail.evaluation?.preparationStatus ?? "") || !!detail.run;
  const runOk = ["completed", "partial"].includes(detail.run?.status ?? "");
  const state = (done: boolean, failed: boolean, started: boolean): StepState => (done ? "done" : failed ? "blocked" : started ? "current" : "upcoming");
  return [
    { label: t("psStepSetup"), state: state(detail.setupComplete, false, true) },
    { label: t("psStepConnection"), state: state(connectionOk, FAILED.has(detail.connection?.status ?? ""), !!detail.connection) },
    { label: t("psStepHelp"), state: state(sourceOk, FAILED.has(detail.source?.status ?? ""), !!detail.source) },
    { label: t("psStepQuestions"), state: state(questionsOk, detail.evaluation?.preparationStatus === "failed", sourceOk) },
    { label: t("psStepRun"), state: state(runOk, FAILED.has(detail.run?.status ?? ""), !!detail.run) },
    { label: t("psStepReport"), state: state(!!detail.report, false, runOk) },
    { label: t("psStepLink"), state: state(!!detail.share?.active, false, !!detail.report) },
    { label: t("psStepCrm"), state: state(!!detail.crmDraft, false, !!detail.share?.active) },
  ] satisfies Array<{ label: string; state: StepState }>;
}

function NextStep({ detail, onSetup, pending }: { detail: Detail; onSetup: () => void; pending: boolean }) {
  if (!detail.setupComplete) return <Status tone="warn" action={<Action size="sm" onClick={onSetup} disabled={pending}>{t("psFinishSetup")}</Action>}>{t("psNextSetup")}</Status>;
  const open = <ActionLink size="sm" variant="secondary" href={workspaceLink(detail)}>{t("psOpenEvaluation")}</ActionLink>;
  if (FAILED.has(detail.connection?.status ?? "")) return <Status tone="warn" action={<ActionLink size="sm" variant="secondary" href={`/workspace/systems?orgId=${detail.orgId}`}>{t("psOpenSystem")}</ActionLink>}>{t("psNextConnection")}</Status>;
  if (!detail.run) return <Status tone="info" action={open}>{t("psNextQuestions")}</Status>;
  if (!["completed", "partial", "failed", "canceled"].includes(detail.run.status)) return <Status tone="info" action={<ActionLink size="sm" variant="secondary" href={`/ops/runs/${detail.run.id}?orgId=${detail.orgId}`}>{t("inspectRun")}</ActionLink>}>{t("psNextRunning")}</Status>;
  if (!detail.report) return <Status tone="info" action={open}>{t("psNextReport")}</Status>;
  if (!detail.share?.active) return <Status tone="info">{t("psNextLink")}</Status>;
  if (!detail.crmDraft) return <Status tone="info">{t("psNextOutreach")}</Status>;
  return <Status tone="success">{t("psNextDone")}</Status>;
}

const fill = (draft: Draft, link: string | null): Draft => (link
  ? { linkedin: draft.linkedin.replaceAll("{link}", link), emailSubject: draft.emailSubject, emailBody: draft.emailBody.replaceAll("{link}", link) }
  : draft);

export function ProspectSnapshotDetail({ id }: { id: string }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState("");
  const [link, setLink] = useState<string | null>(null);
  const [language, setLanguage] = useState<"en" | "es">("en");
  const [drafts, setDrafts] = useState<Record<"en" | "es", Draft> | null>(null);
  const shareKey = useRef<string>("");
  const languageSet = useRef(false);

  const load = useCallback(async () => {
    try {
      const next = await evalRequest<Detail>(`/prospects/${id}`);
      setDetail(next);
      setError("");
      setDrafts((current) => current ?? (next.outreach ? { en: next.outreach.en, es: next.outreach.es } : null));
      if (!languageSet.current) {
        languageSet.current = true;
        setLanguage(next.locale);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("error"));
    }
  }, [id]);
  useEffect(() => {
    const first = window.setTimeout(() => void load(), 0);
    const timer = window.setInterval(() => void load(), 15_000);
    return () => { window.clearTimeout(first); window.clearInterval(timer); };
  }, [load]);

  const steps = useMemo(() => (detail ? progress(detail) : []), [detail]);
  const draft = drafts ? drafts[language] : null;
  const setDraft = (patch: Partial<Draft>) => setDrafts((current) => (current ? { ...current, [language]: { ...current[language], ...patch } } : current));

  async function finishSetup() {
    setPending("setup");
    try {
      await evalRequest(`/prospects/${id}/setup`, "POST", {});
      await load();
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : t("error"));
    } finally {
      setPending("");
    }
  }

  async function makeLink() {
    if (!detail) return;
    if (detail.share?.active && !window.confirm(t("psReplaceConfirm"))) return;
    setPending("share");
    shareKey.current = crypto.randomUUID();
    try {
      const share = await evalRequest<{ token: string | null; expiresAt: string }>(`/prospects/${id}/share`, "POST", {}, shareKey.current);
      if (share.token) {
        const url = `${window.location.origin}/share#token=${share.token}`;
        setLink(url);
        setDrafts((current) => (current ? { en: fill(current.en, url), es: fill(current.es, url) } : current));
      }
      notify(t("psLinkCreated"));
      await load();
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : t("error"));
    } finally {
      setPending("");
    }
  }

  async function createDraft() {
    if (!detail || !draft) return;
    setPending("crm");
    try {
      await evalRequest("/crm-handoff-drafts", "POST", { prospectSnapshotId: detail.id, outreach: { locale: language, ...draft } });
      notify(t("psDraftCreatedToast"));
      await load();
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : t("error"));
    } finally {
      setPending("");
    }
  }

  if (error && !detail) return <Status error>{error}</Status>;
  if (!detail) return <Loading />;
  const m = detail.report?.metrics;
  const crmText = detail.crmDraft ? warmblyText(detail) : "";
  return (
    <>
      <PageHeading
        title={detail.company}
        meta={<><Badge tone="info">{t("psExternalSnapshot")}</Badge><Badge>{basisLabel(detail.testingBasis)}</Badge></>}
        actions={<ActionLink variant="secondary" href="/ops/prospects">{t("psAll")}</ActionLink>}
      >
        {tv("psDetailIntro", { chat: detail.targetHost, help: detail.helpHost })}
      </PageHeading>
      {error && <Status error>{error}</Status>}
      <div className="p-stack">
        <Steps steps={steps} label={t("psProgress")} />
        <NextStep detail={detail} onSetup={() => void finishSetup()} pending={pending === "setup"} />
      </div>

      <Section title={t("psScope")}>
        <DefinitionList items={[
          { term: t("psChatUrl"), value: <a className="p-link p-link-external" href={detail.targetUrl} target="_blank" rel="noreferrer noopener">{detail.targetHost}<ExternalLink aria-hidden="true" size={14} /></a> },
          { term: t("psHelpUrl"), value: <a className="p-link p-link-external" href={detail.helpUrl} target="_blank" rel="noreferrer noopener">{detail.helpHost}<ExternalLink aria-hidden="true" size={14} /></a> },
          { term: t("psBasis"), value: detail.basisNote ? `${basisLabel(detail.testingBasis)} · ${detail.basisNote}` : basisLabel(detail.testingBasis) },
          { term: t("psLimits"), value: tv("psLimitsValue", { questions: detail.trafficLimit.max_questions, rpm: detail.trafficLimit.requests_per_minute, runs: detail.trafficLimit.runs_per_month }) },
          { term: t("psSharing"), value: t("psSharingValue") },
          { term: t("psCreated"), value: <Time value={detail.createdAt} /> },
        ]} />
        {detail.evaluationId && <p style={{ marginTop: 12 }}><Link className="p-link" href={workspaceLink(detail)}>{t("psOpenEvaluation")}</Link></p>}
      </Section>

      <Section title={t("psResults")}>
        {detail.report ? (
          <div className="p-stack">
            <p data-testid="snapshot-counts">
              {m ? tv("psCounts", { pass: m.pass, partial: m.partial, fail: m.fail, scored: m.scored }) : t("psNoScores")}{" "}
              <StatusBadge value={detail.report.reviewStatus} label={detail.report.reviewStatus === "reviewed" ? t("psReviewed") : t("psAutoGraded")} />
            </p>
            {detail.weak && <Status tone="warn">{t("psWeak")}</Status>}
            {detail.report.reviewStatus !== "reviewed" && <p className="p-cell-meta">{t("psReviewHint")}</p>}
            <p><Link className="p-link" href={`/workspace/reports/${detail.report.id}?orgId=${detail.orgId}`}>{t("openReport")}</Link></p>
          </div>
        ) : <p className="p-cell-meta">{t("psNoReport")}</p>}
      </Section>

      <Section title={t("psLinkTitle")} description={t("psLinkHelp")}>
        <div className="p-stack">
        {detail.share && (
          <p className="p-row">
            <span>{t("psExternalSnapshot")}</span>
            <Badge tone={detail.share.active ? "pass" : "neutral"} dot>
              {detail.share.active ? tv("psExpires", { date: formatDate(detail.share.expiresAt) }) : detail.share.revokedAt ? t("psLinkRevoked") : t("psLinkExpired")}
            </Badge>
            <span className="p-cell-meta">{detail.share.views === 1 ? t("psViewsOne") : tv("psViews", { views: detail.share.views })}</span>
            {detail.share.active && !detail.share.current && <span className="p-cell-meta">{t("psLinkOutdated")}</span>}
          </p>
        )}
        {link && (
          <div className="p-stack-tight">
            <label className="p-copy-label" htmlFor="ps-link">{t("psLinkLabel")}</label>
            <div className="p-copy-row">
              <input id="ps-link" className="p-copy-value" value={link} readOnly />
              <Action variant="secondary" size="sm" onClick={() => void copy(link)}><Copy aria-hidden="true" />{t("copy")}</Action>
            </div>
            <span className="p-field-hint">{t("psLinkOnce")}</span>
          </div>
        )}
        <div className="p-row"><Action variant={detail.share?.active ? "secondary" : "primary"} disabled={!detail.report || pending === "share"} onClick={() => void makeLink()}>
          {pending === "share" ? t("working") : detail.share?.active ? t("psReplaceLink") : t("psCreateLink")}
        </Action></div>
        </div>
      </Section>

      <Section title={t("psOutreach")} description={t("psOutreachHelp")}>
        {draft ? (
          <div className="p-stack">
            <Tabs value={language} onChange={setLanguage} label={t("psLanguage")} variant="pill" options={[{ value: "en", label: "English" }, { value: "es", label: "Español" }]} />
            <Status tone="info">{t("psOutreachRule")}</Status>
            <TextArea id="ps-linkedin" label={t("psLinkedin")} value={draft.linkedin} onChange={(event) => setDraft({ linkedin: event.target.value })} rows={6} maxLength={3000} />
            <div className="p-row"><Action variant="secondary" size="sm" onClick={() => void copy(draft.linkedin)}><Copy aria-hidden="true" />{t("copy")}</Action></div>
            <Field id="ps-subject" label={t("psEmailSubject")} value={draft.emailSubject} onChange={(event) => setDraft({ emailSubject: event.target.value })} maxLength={200} />
            <TextArea id="ps-email" label={t("psEmailBody")} hint={t("psEmailRule")} value={draft.emailBody} onChange={(event) => setDraft({ emailBody: event.target.value })} rows={9} maxLength={4000} />
            <div className="p-row"><Action variant="secondary" size="sm" onClick={() => void copy(`${draft.emailSubject}\n\n${draft.emailBody}`)}><Copy aria-hidden="true" />{t("copy")}</Action></div>
          </div>
        ) : <p className="p-cell-meta">{t("psOutreachLater")}</p>}
      </Section>

      <Section title={t("psCrmTitle")} description={t("psCrmHelp")}>
        {detail.crmDraft ? (
          <div className="p-stack">
            <Status tone="success">{tv("psCrmDone", { date: formatDate(detail.crmDraft.createdAt, true) })}</Status>
            <TextArea id="ps-crm" label={t("psCrmCopy")} value={crmText} readOnly rows={8} />
            <div className="p-row"><Action variant="secondary" size="sm" onClick={() => void copy(crmText)}><Copy aria-hidden="true" />{t("copy")}</Action></div>
          </div>
        ) : (
          <Action disabled={!detail.share?.active || !draft || pending === "crm"} onClick={() => void createDraft()}>
            {pending === "crm" ? t("working") : t("psCreateCrm")}
          </Action>
        )}
      </Section>
    </>
  );
}

/** The draft as text to paste into Warmbly (no link token: the operator adds the link). */
function warmblyText(detail: Detail) {
  const summary = detail.crmDraft?.summary ?? {};
  const outreach = (summary.outreach ?? {}) as { linkedin?: string; email_subject?: string; email_body?: string };
  const tags = Array.isArray(summary.tags) ? summary.tags.join(", ") : "";
  const lines = [
    `${t("psCompany")}: ${detail.company}`,
    `${t("psWebsite")}: https://${detail.targetHost}`,
    `${t("psHelpUrl")}: ${detail.helpUrl}`,
    `${t("psTags")}: ${tags}`,
    `${t("psBasis")}: ${basisLabel(detail.testingBasis)}`,
    detail.share ? `${t("psLinkTitle")}: ${t("psExternalSnapshot")} · ${tv("psExpires", { date: formatDate(detail.share.expiresAt) })}` : "",
    "",
    outreach.linkedin ?? "",
    "",
    outreach.email_subject ?? "",
    outreach.email_body ?? "",
  ];
  return lines.filter((line, index) => line || index > 5).join("\n").trim();
}

