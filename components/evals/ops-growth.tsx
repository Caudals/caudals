"use client";
import { useState } from "react";
import Link from "next/link";
import type { GrowthData } from "@/lib/analytics/growth";
import { Action, Badge, DataTable, PageHeading, Stat, StatGrid, Time, humanize, Section } from "./primitives";
import { evalRequest } from "./api";
import { notify } from "./overlays";
import { t, type MessageKey } from "@/lib/evals/messages/runtime";
import { tr, type Phrase } from "@/lib/evals/messages/phrases";
/** Connection kinds as people say them (launch L-21). */
const CONNECTION: Record<string, Phrase> = { website: "Website chatbot", openai_compatible: "OpenAI-compatible API", https_json: "HTTPS JSON API", provider_native: "Provider API", imported_responses: "Uploaded answers", private_runner: "Private runner" };
const score = (value: number | null | undefined, scored: number | null | undefined) => (value === null || value === undefined ? "—" : `${Math.round(value * 100)} %${scored ? ` · ${scored}` : ""}`);
const credits = (value: number | null | undefined) => (value === null || value === undefined ? "—" : value.toLocaleString("en-GB", { maximumFractionDigits: 2 }));
/** Welcome answers (launch L-06) in the operator's language; unknown values degrade to a humanised label. */
const answer = (prefix: "onbSystem_" | "onbGoal_", value: string | null | undefined) => {
  if (!value) return "—";
  const text = t(`${prefix}${value}` as MessageKey);
  return text === `${prefix}${value}` || !text ? humanize(value) : text;
};
const stages = ["page_view", "demo_started", "demo_finished", "account_created", "evaluation_created", "test_set_ready", "run_started", "report_viewed"];
export function OpsGrowth({ data }: { data: GrowthData }) {
  const [week, setWeek] = useState(data.weeks.at(-1)?.week ?? "");
  const [drafted, setDrafted] = useState<string[]>([]);
  const [drafting, setDrafting] = useState("");
  // "Create CRM draft" (P-34): an explicit click writes a Warmbly handoff draft; nothing is sent.
  async function crmDraft(orgId: string) {
    setDrafting(orgId);
    try {
      await evalRequest("/crm-handoff-drafts", "POST", { orgId, source: "growth" });
      setDrafted((current) => [...current, orgId]);
      notify(t("growthCrmDrafted"));
    } catch (error) {
      notify(error instanceof Error ? error.message : t("error"));
    } finally {
      setDrafting("");
    }
  }
  const [resolved, setResolved] = useState<string[]>([]);
  const [resolving, setResolving] = useState("");
  // "Get help" requests (launch L-06): an operator closes one once the customer is unblocked.
  async function resolve(id: string) {
    setResolving(id);
    try {
      await evalRequest(`/onboarding/help/${id}`, "POST", { action: "resolve" });
      setResolved((current) => [...current, id]);
      notify(t("growthHelpResolved"));
    } catch (error) {
      notify(error instanceof Error ? error.message : t("error"));
    } finally {
      setResolving("");
    }
  }
  const counts = data.weeks.find(row => row.week === week)?.events ?? {};
  const label = (name: string) => ({ page_view: t("growthVisits"), demo_started: t("growthDemos"), demo_finished: t("growthDemoFinished"), account_created: t("growthAccounts"), evaluation_created: t("growthEvaluations"), test_set_ready: t("growthTests"), run_started: t("growthRuns"), report_viewed: t("growthActivated") }[name] ?? humanize(name));
  return <>
    <PageHeading title={t("growth")}>{t("growthDescription")}</PageHeading>
    <div className="p-toolbar"><label className="p-field">{t("growthWeek")} <select value={week} onChange={event => setWeek(event.target.value)} aria-label={t("growthWeek")}>
      {data.weeks.map(row => <option key={row.week} value={row.week}>{row.week}</option>)}
    </select></label></div>
    <StatGrid>{["page_view", "demo_started", "account_created", "report_viewed"].map(name => <Stat key={name} label={label(name)} value={counts[name] ?? 0} />)}</StatGrid>
    <Section title={t("growthFunnel")}>
      <DataTable caption={t("growthFunnel")} headers={[t("growthStage"), t("growthCount")]}>{stages.map(name => <tr key={name}><th scope="row">{label(name)}</th><td>{counts[name] ?? 0}</td></tr>)}</DataTable>
    </Section>
    <Section title={t("growthOutcomes")}>
      <DataTable caption={t("growthOutcomes")} headers={[t("growthOutcome"), t("growthReason"), t("growthCount")]}>
        {data.outcomes.map(row => <tr key={`${row.outcome}:${row.reason}`}><th scope="row">{humanize(row.outcome)}</th><td>{humanize(row.reason)}</td><td>{row.count}</td></tr>)}
        {!data.outcomes.length && <tr><td colSpan={3}>{t("growthEmpty")}</td></tr>}
      </DataTable>
    </Section>
    <Section title={t("growthSources")}>
      <DataTable caption={t("growthSources")} headers={[t("growthSource"), t("growthVisits"), t("growthDemos"), t("growthAccounts"), t("growthActivated")]}>
        {data.sources.map(row => <tr key={row.source}><th scope="row">{row.source}</th><td>{row.visits}</td><td>{row.demos}</td><td>{row.accounts}</td><td>{row.activated}</td></tr>)}
        {!data.sources.length && <tr><td colSpan={5}>{t("growthEmpty")}</td></tr>}
      </DataTable>
    </Section>
    <Section title={t("growthActivation")}><p>{t("growthActivationHelp")}</p>
      <DataTable caption={t("growthActivation")} headers={[t("growthWeek"), t("growthDemoSignups"), t("growthTestSetIn30")]}>
        {(data.activation ?? []).map(row => <tr key={row.week}><th scope="row">{row.week}</th><td>{row.demoSignups}</td><td>{row.testSetIn30}{row.demoSignups ? ` (${Math.round((row.testSetIn30 / row.demoSignups) * 100)} %)` : ""}</td></tr>)}
        {!data.activation?.length && <tr><td colSpan={3}>{t("growthEmpty")}</td></tr>}
      </DataTable>
    </Section>
    <Section title={t("growthHelp")}><p id="help-requests">{t("growthHelpHelp")}</p>
      <DataTable caption={t("growthHelp")} headers={[t("workspace"), t("growthCreated"), t("growthHelpReason"), t("statusLabel"), { label: t("actions"), align: "end" as const, hidden: true }]}>
        {(data.help ?? []).map(row => {
          const open = row.status === "open" && !resolved.includes(row.id);
          const href = row.evaluationId ? `/workspace/evaluations/${row.evaluationId}?orgId=${row.orgId}` : `/workspace/evaluations?orgId=${row.orgId}`;
          const company = data.accounts.find(account => account.orgId === row.orgId)?.company;
          return <tr key={row.id}><th scope="row"><Link href={href}>{company ?? row.orgId.slice(0, 8)}</Link></th><td><Time value={row.createdAt} /></td><td>{humanize(row.reason)}</td>
            <td><Badge tone={open ? "warn" : "neutral"} dot>{open ? t("growthHelpOpen") : t("growthHelpResolved")}</Badge>{row.notified && <span className="p-cell-meta"> · {t("growthHelpNotified")}</span>}</td>
            <td className="p-table-action">{open && <Action variant="secondary" size="sm" disabled={resolving === row.id} onClick={() => void resolve(row.id)}>{t("growthHelpResolve")}</Action>}</td></tr>;
        })}
        {!data.help?.length && <tr><td colSpan={5}>{t("growthHelpEmpty")}</td></tr>}
      </DataTable>
    </Section>
    <Section title={t("growthNewAccounts")}>
      <DataTable caption={t("growthNewAccounts")} headers={[t("growthCompany"), t("growthCreated"), t("growthSource"), t("growthStage"), t("growthSystem"), t("lastActivity"), t("growthLatestScore"), t("growthCreditsBought"), t("growthSystemType"), t("growthGoal"), { label: t("actions"), align: "end", hidden: true }]}>
        {data.accounts.map(row => <tr key={row.orgId}>
          <th scope="row"><span className="p-table-primary"><Link href={`/workspace/evaluations?orgId=${row.orgId}`}>{row.company ?? row.orgId.slice(0, 8)}</Link>{row.emailDomain && <span className="p-cell-meta">{row.emailDomain}</span>}</span></th>
          <td><Time value={row.createdAt} /></td><td>{row.source}</td><td>{label(row.stage)}</td>
          <td>{row.connection ? tr(CONNECTION[row.connection] ?? humanize(row.connection)) : "—"}</td>
          <td><Time value={row.lastActivity ?? null} /></td>
          <td className="p-num">{score(row.latestScore, row.latestScored)}</td>
          <td className="p-num">{credits(row.creditsBought)}</td>
          <td>{answer("onbSystem_", row.systemType)}</td><td>{answer("onbGoal_", row.goal)}</td>
          <td className="p-table-action">{row.hasReport && (drafted.includes(row.orgId)
            ? <span className="p-cell-meta">{t("growthCrmDraftDone")}</span>
            : <Action variant="secondary" size="sm" disabled={drafting === row.orgId} onClick={() => void crmDraft(row.orgId)}>{t("growthCrmDraft")}</Action>)}</td>
        </tr>)}
        {!data.accounts.length && <tr><td colSpan={11}>{t("growthEmpty")}</td></tr>}
      </DataTable>
    </Section>
    <Section title={t("growthCohorts")}><p>{t("growthCohortHelp")}</p>
      <DataTable caption={t("growthCohorts")} headers={[t("growthWeek"), t("growthAccounts"), ...Array.from({length:8},(_,i)=>`${t("growthWeek")} ${i}`)]}>
        {data.cohorts.map((row, index) => <tr key={row.week}><th scope="row">{row.week}</th><td>{row.accounts}</td>{row.active.map((value, offset) => <td key={offset}>{offset + index > 7 ? "—" : `${value}/${row.accounts}`}</td>)}</tr>)}
      </DataTable>
    </Section>
  </>;
}
