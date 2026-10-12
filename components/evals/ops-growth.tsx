"use client";
import { useState } from "react";
import Link from "next/link";
import type { GrowthData } from "@/lib/analytics/growth";
import { DataTable, PageHeading, Stat, StatGrid, Time, humanize, Section } from "./primitives";
import { t } from "@/lib/evals/messages/en";
const stages = ["page_view", "demo_started", "demo_finished", "account_created", "evaluation_created", "test_set_ready", "run_started", "report_viewed"];
export function OpsGrowth({ data }: { data: GrowthData }) {
  const [week, setWeek] = useState(data.weeks.at(-1)?.week ?? "");
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
    <Section title={t("growthNewAccounts")}>
      <DataTable caption={t("growthNewAccounts")} headers={[t("workspace"), t("growthCreated"), t("growthSource"), t("growthStage")]}>
        {data.accounts.map(row => <tr key={row.orgId}><th scope="row"><Link href={`/workspace/evaluations?orgId=${row.orgId}`}>{row.orgId.slice(0, 8)}</Link></th><td><Time value={row.createdAt} /></td><td>{row.source}</td><td>{label(row.stage)}</td></tr>)}
        {!data.accounts.length && <tr><td colSpan={4}>{t("growthEmpty")}</td></tr>}
      </DataTable>
    </Section>
    <Section title={t("growthCohorts")}><p>{t("growthCohortHelp")}</p>
      <DataTable caption={t("growthCohorts")} headers={[t("growthWeek"), t("growthAccounts"), ...Array.from({length:8},(_,i)=>`${t("growthWeek")} ${i}`)]}>
        {data.cohorts.map((row, index) => <tr key={row.week}><th scope="row">{row.week}</th><td>{row.accounts}</td>{row.active.map((value, offset) => <td key={offset}>{offset + index > 7 ? "—" : `${value}/${row.accounts}`}</td>)}</tr>)}
      </DataTable>
    </Section>
  </>;
}
