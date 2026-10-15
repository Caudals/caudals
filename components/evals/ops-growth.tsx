"use client";
import { useState } from "react";
import Link from "next/link";
import type { GrowthData } from "@/lib/analytics/growth";
import { Action, Badge, DataTable, InlineSelect, PageHeading, Stat, StatGrid, Time, formatDate, formatMoney, humanize, Section, Toolbar } from "./primitives";
import { demoReason } from "./demo-reasons";
import { percent } from "./ops-labels";
import { evalRequest } from "./api";
import { notify } from "./overlays";
import { t, tv, type MessageKey } from "@/lib/evals/messages/runtime";
import { tr, type Phrase } from "@/lib/evals/messages/phrases";
/** Connection kinds as people say them (launch L-21). */
const CONNECTION: Record<string, Phrase> = { website: "Website chatbot", openai_compatible: "OpenAI-compatible API", https_json: "HTTPS JSON API", provider_native: "Provider API", imported_responses: "Uploaded answers", private_runner: "Private runner" };
const score = (value: number | null | undefined, scored: number | null | undefined) => (value === null || value === undefined ? "—" : `${percent(value)}${scored ? ` · ${scored}` : ""}`);
const credits = (value: number | null | undefined) => (value === null || value === undefined ? "—" : formatMoney(value));
/** Welcome answers (launch L-06) in the operator's language; unknown values degrade to a humanised label. */
const answer = (prefix: "onbSystem_" | "onbGoal_", value: string | null | undefined) => {
  if (!value) return "—";
  const text = t(`${prefix}${value}` as MessageKey);
  return text === `${prefix}${value}` || !text ? humanize(value) : text;
};
/** A week's Monday (YYYY-MM-DD) as "Week of 12 Oct 2026". */
const weekOf = (week: string) => tv("growthWeekOf", { date: formatDate(week) });
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
  const label = (name: string) => ({ page_view: t("growthVisits"), demo_started: t("growthDemos"), demo_finished: t("growthDemoFinished"), account_created: t("growthAccounts"), evaluation_created: t("growthEvaluations"), test_set_ready: t("growthTests"), run_started: t("growthRuns"), report_viewed: t("growthActivated"), run_finished: t("growthRunsFinished") }[name] ?? humanize(name));
  return <>
    <PageHeading title={t("growth")}>{t("growthDescription")}</PageHeading>
    <Toolbar><InlineSelect id="growth-week" label={t("growthWeek")} value={week} onChange={event => setWeek(event.target.value)}>
      {data.weeks.map(row => <option key={row.week} value={row.week}>{weekOf(row.week)}</option>)}
    </InlineSelect></Toolbar>
    <StatGrid>{["page_view", "demo_started", "account_created", "report_viewed"].map(name => <Stat key={name} label={label(name)} value={counts[name] ?? 0} />)}</StatGrid>
    <Section title={t("growthFunnel")}>
      <DataTable caption={t("growthFunnel")} headers={[t("growthStage"), { label: t("growthCount"), align: "end" }]}>{stages.map(name => <tr key={name}><th scope="row">{label(name)}</th><td className="p-num">{counts[name] ?? 0}</td></tr>)}</DataTable>
    </Section>
    <Section title={t("growthOutcomes")}>
      <DataTable caption={t("growthOutcomes")} headers={[t("growthOutcome"), t("growthReason"), { label: t("growthCount"), align: "end" }]}>
        {data.outcomes.map(row => <tr key={`${row.outcome}:${row.reason}`}><th scope="row">{humanize(row.outcome)}</th><td>{demoReason(row.reason)}</td><td className="p-num">{row.count}</td></tr>)}
        {!data.outcomes.length && <tr><td colSpan={3} className="p-cell-meta">{t("growthEmpty")}</td></tr>}
      </DataTable>
    </Section>
    <Section title={t("growthSources")}>
      <DataTable caption={t("growthSources")} headers={[t("growthSource"), { label: t("growthVisits"), align: "end" }, { label: t("growthDemos"), align: "end" }, { label: t("growthAccounts"), align: "end" }, { label: t("growthActivated"), align: "end" }]}>
        {data.sources.map(row => <tr key={row.source}><th scope="row">{humanize(row.source)}</th><td className="p-num">{row.visits}</td><td className="p-num">{row.demos}</td><td className="p-num">{row.accounts}</td><td className="p-num">{row.activated}</td></tr>)}
        {!data.sources.length && <tr><td colSpan={5} className="p-cell-meta">{t("growthEmpty")}</td></tr>}
      </DataTable>
    </Section>
    <Section title={t("growthActivation")} description={t("growthActivationHelp")}>
      <DataTable caption={t("growthActivation")} headers={[t("growthWeek"), { label: t("growthDemoSignups"), align: "end" }, { label: t("growthTestSetIn30"), align: "end" }]}>
        {(data.activation ?? []).map(row => <tr key={row.week}><th scope="row">{weekOf(row.week)}</th><td className="p-num">{row.demoSignups}</td><td className="p-num">{row.testSetIn30}{row.demoSignups ? ` (${percent(row.testSetIn30 / row.demoSignups)})` : ""}</td></tr>)}
        {!data.activation?.length && <tr><td colSpan={3} className="p-cell-meta">{t("growthEmpty")}</td></tr>}
      </DataTable>
    </Section>
    <Section title={t("growthHelp")} description={<span id="help-requests">{t("growthHelpHelp")}</span>}>
      <DataTable caption={t("growthHelp")} headers={[t("workspace"), t("growthCreated"), t("growthHelpReason"), t("statusLabel"), { label: t("actions"), align: "end" as const, hidden: true }]}>
        {(data.help ?? []).map(row => {
          const open = row.status === "open" && !resolved.includes(row.id);
          const href = row.evaluationId ? `/workspace/evaluations/${row.evaluationId}?orgId=${row.orgId}` : `/workspace/evaluations?orgId=${row.orgId}`;
          const company = data.accounts.find(account => account.orgId === row.orgId)?.company;
          return <tr key={row.id}><th scope="row"><Link href={href}>{company ?? t("growthUnnamed")}</Link></th><td><Time value={row.createdAt} /></td><td>{humanize(row.reason)}</td>
            <td><Badge tone={open ? "warn" : "neutral"} dot>{open ? t("growthHelpOpen") : t("growthHelpResolved")}</Badge>{row.notified && <span className="p-cell-meta"> · {t("growthHelpNotified")}</span>}</td>
            <td className="p-table-action">{open && <Action variant="secondary" size="sm" disabled={resolving === row.id} onClick={() => void resolve(row.id)}>{t("growthHelpResolve")}</Action>}</td></tr>;
        })}
        {!data.help?.length && <tr><td colSpan={5} className="p-cell-meta">{t("growthHelpEmpty")}</td></tr>}
      </DataTable>
    </Section>
    <Section title={t("growthNewAccounts")}>
      <DataTable caption={t("growthNewAccounts")} headers={[t("growthCompany"), t("growthCreated"), t("growthSource"), t("growthStage"), t("growthSystemType"), t("growthGoal"), t("lastActivity"), { label: t("growthLatestScore"), align: "end" }, { label: t("growthCreditsBought"), align: "end" }, { label: t("actions"), align: "end", hidden: true }]}>
        {data.accounts.map(row => <tr key={row.orgId}>
          <th scope="row"><span className="p-table-primary"><Link href={`/workspace/evaluations?orgId=${row.orgId}`}>{row.company ?? row.emailDomain ?? t("growthUnnamed")}</Link>{row.emailDomain && row.company && <span className="p-cell-meta">{row.emailDomain}</span>}</span></th>
          <td><Time value={row.createdAt} /></td><td>{humanize(row.source)}</td><td>{label(row.stage)}</td>
          {/* System type is what the account said in the welcome (P-04); the connected kind sits under it (launch G1). */}
          <td><span className="p-table-primary"><span>{answer("onbSystem_", row.systemType)}</span>
            {row.connection && <span className="p-cell-meta">{tv("growthConnected", { kind: tr(CONNECTION[row.connection] ?? humanize(row.connection)) })}</span>}</span></td>
          <td>{answer("onbGoal_", row.goal)}</td>
          <td><Time value={row.lastActivity ?? null} /></td>
          <td className="p-num">{score(row.latestScore, row.latestScored)}</td>
          <td className="p-num">{credits(row.creditsBought)}</td>
          <td className="p-table-action">{row.hasReport && (drafted.includes(row.orgId)
            ? <span className="p-cell-meta">{t("growthCrmDraftDone")}</span>
            : <Action variant="secondary" size="sm" disabled={drafting === row.orgId} onClick={() => void crmDraft(row.orgId)}>{t("growthCrmDraft")}</Action>)}</td>
        </tr>)}
        {!data.accounts.length && <tr><td colSpan={10} className="p-cell-meta">{t("growthEmpty")}</td></tr>}
      </DataTable>
    </Section>
    <Section title={t("growthCohorts")} description={t("growthCohortHelp")}>
      <DataTable caption={t("growthCohorts")} headers={[t("growthWeek"), { label: t("growthAccounts"), align: "end" }, ...Array.from({length:8},(_,i)=>({ label: `${t("growthWeek")} ${i}`, align: "end" as const }))]}>
        {data.cohorts.map((row, index) => <tr key={row.week}><th scope="row">{weekOf(row.week)}</th><td className="p-num">{row.accounts}</td>{row.active.map((value, offset) => <td key={offset} className="p-num">{offset + index > 7 ? "—" : `${value}/${row.accounts}`}</td>)}</tr>)}
      </DataTable>
    </Section>
  </>;
}
