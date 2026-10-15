"use client";

import { useCallback, useEffect, useState } from "react";
import { BookCheck, CalendarClock } from "lucide-react";
import { evalRequest } from "./api";
import { Action, Badge, Check, SectionHeading, SelectField, Status, codeText } from "./primitives";
import { notify } from "./overlays";
import { getLocale, t, tv } from "@/lib/evals/messages/en";
import { SECTOR_LABELS, isSector, type Sector } from "@/lib/evals/sector-packs/sectors";

/**
 * Customer side of the sector packs and monthly new questions (launch L-25).
 * Both read their state from the API, which answers 404 while
 * SECTOR_PACKS_ENABLED is off; then they render nothing. Only published
 * packs ever reach this screen.
 */

type Suggestion = {
  sector: Sector | null;
  sectors: Sector[];
  packs: Array<{ packId: string; versionId: string; version: number; title: { en: string; es: string }; items: number; missing: number; added: number }>;
};
const packTitle = (value: { en: string; es: string }) => (getLocale() === "es" ? value.es : value.en);

/** "Add N sector questions" for a test set, when a published pack exists for the workspace's sector. */
export function SectorQuestionsCard({ orgId, suiteId, onAdded }: { orgId: string; suiteId: string; onAdded: () => void | Promise<void> }) {
  const [data, setData] = useState<Suggestion | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [choice, setChoice] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(() => evalRequest<Suggestion>(`/suites/${suiteId}/sector-questions?orgId=${encodeURIComponent(orgId)}`).then(setData).catch(() => setData(null)), [orgId, suiteId]);
  useEffect(() => { void load(); }, [load]);
  if (!data || !Array.isArray(data.sectors) || !data.sectors.length) return null;

  async function saveSector(sector: string) {
    setPending(true);
    setError("");
    try {
      await evalRequest("/workspace/library-settings", "PUT", { orgId, sector: isSector(sector) ? sector : "other" });
      setChoosing(false);
      await load();
    } catch (value) {
      setError(value instanceof Error ? value.message : t("error"));
    } finally {
      setPending(false);
    }
  }
  async function add(versionId: string) {
    setPending(true);
    setError("");
    try {
      const result = await evalRequest<{ added: number; status: "draft" | "frozen" }>(`/suites/${suiteId}/sector-questions`, "POST", { orgId, packVersionId: versionId }, crypto.randomUUID());
      notify(`${tv("sectorQuestionsAdded", { n: result.added })} ${result.status === "frozen" ? t("sectorQuestionsFrozenNote") : t("sectorQuestionsDraftNote")}`);
      await load();
      await onAdded();
    } catch (value) {
      setError(value instanceof Error ? value.message : t("error"));
    } finally {
      setPending(false);
    }
  }

  const askSector = choosing || !data.sector;
  return (
    <section className="p-sector-card" aria-labelledby="sector-questions-title">
      <BookCheck aria-hidden="true" className="p-sector-card-icon" />
      <div className="p-sector-card-body">
        <h2 id="sector-questions-title" className="p-subhead">{t("sectorQuestionsTitle")}</h2>
        {error && <Status error>{error}</Status>}
        {askSector ? (
          <form className="p-sector-choose" onSubmit={(event) => { event.preventDefault(); if (choice) void saveSector(choice); }}>
            <p>{t("sectorQuestionsChoose")}</p>
            <span className="p-row">
              <SelectField id="sector-choice" label={t("sectorQuestionsSector")} value={choice} onChange={(event) => setChoice(event.target.value)} required>
                <option value="">{t("sectorQuestionsChooseOption")}</option>
                {data.sectors.map((sector) => <option key={sector} value={sector}>{t(SECTOR_LABELS[sector])}</option>)}
                <option value="other">{t("sectorQuestionsNoneOfThese")}</option>
              </SelectField>
              <Action type="submit" variant="secondary" disabled={!choice || pending}>{t("sectorQuestionsSaveSector")}</Action>
            </span>
          </form>
        ) : data.packs.length ? (
          data.packs.map((pack) => (
            <div key={pack.versionId} className="p-sector-offer">
              {pack.missing > 0 ? (
                <>
                  <p>{tv("sectorQuestionsOffer", { title: packTitle(pack.title), version: pack.version })}</p>
                  <span className="p-row">
                    <Action onClick={() => void add(pack.versionId)} disabled={pending}>{tv("sectorQuestionsAdd", { n: pack.missing })}</Action>
                    <Badge>{t(SECTOR_LABELS[data.sector!])}</Badge>
                  </span>
                </>
              ) : (
                <p className="p-cell-meta">{tv("sectorQuestionsAll", { title: packTitle(pack.title), n: pack.items })}</p>
              )}
            </div>
          ))
        ) : (
          <p className="p-cell-meta">{t("sectorQuestionsNoPack")}</p>
        )}
        {!askSector && (
          <button type="button" className="p-link-button" onClick={() => { setChoice(data.sector ?? ""); setChoosing(true); }}>
            {t("sectorQuestionsChangeSector")}
          </button>
        )}
      </div>
    </section>
  );
}

type Proposal = { id: string; question: string; expected: string; keyFacts: string[]; quote: string; pageUrl: string | null; changeKind: "new_page" | "changed_page"; severity: string; period: string };
type Refresh = { id: string; period: string; status: string; pages: { new: number; changed: number }; proposalCount: number; reasonCode: string | null; sourceTitle: string };
type ProposalView = { monthlyQuestions: boolean; eligible: boolean; proposals: Proposal[]; refreshes: Refresh[] };

function refreshLine(refresh: Refresh) {
  const values = { source: refresh.sourceTitle, period: refresh.period };
  switch (refresh.status) {
    case "reading": return tv("monthlyRefreshReading", values);
    case "drafting": return tv("monthlyRefreshDrafting", values);
    case "unchanged": return tv("monthlyRefreshUnchanged", values);
    case "skipped": return tv("monthlyRefreshSkipped", values);
    case "failed": return tv("monthlyRefreshFailed", { ...values, reason: codeText(refresh.reasonCode ?? "error") });
    default: return tv("monthlyRefreshSummary", { ...values, newPages: refresh.pages.new, changed: refresh.pages.changed, proposals: refresh.proposalCount });
  }
}

/** Monthly new questions for a test set: the opt-in, the latest readings and the proposals to approve or reject. */
export function MonthlyQuestionsPanel({ orgId, suiteId, canManage, onDecided }: { orgId: string; suiteId: string; canManage: boolean; onDecided: () => void | Promise<void> }) {
  const [data, setData] = useState<ProposalView | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(() => evalRequest<ProposalView>(`/suites/${suiteId}/proposals?orgId=${encodeURIComponent(orgId)}`).then(setData).catch(() => setData(null)), [orgId, suiteId]);
  useEffect(() => { void load(); }, [load]);
  if (!data || typeof data.monthlyQuestions !== "boolean") return null;

  async function toggle(on: boolean) {
    setPending(true);
    setError("");
    try {
      await evalRequest("/workspace/library-settings", "PUT", { orgId, monthlyQuestions: on });
      await load();
    } catch (value) {
      setError(value instanceof Error ? value.message : t("error"));
    } finally {
      setPending(false);
    }
  }
  async function decide(approve: boolean) {
    const ids = [...selected];
    if (!ids.length) return;
    setPending(true);
    setError("");
    try {
      const result = await evalRequest<{ added: number; rejected: number; status: "draft" | "frozen" }>(`/suites/${suiteId}/proposals`, "POST",
        { orgId, approve: approve ? ids : [], reject: approve ? [] : ids }, crypto.randomUUID());
      notify(`${tv("monthlyDecided", { added: result.added, rejected: result.rejected })}${result.added ? ` ${result.status === "frozen" ? t("sectorQuestionsFrozenNote") : t("sectorQuestionsDraftNote")}` : ""}`);
      setSelected(new Set());
      await load();
      if (result.added) await onDecided();
    } catch (value) {
      setError(value instanceof Error ? value.message : t("error"));
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="p-section p-monthly" aria-labelledby="monthly-questions-title">
      <SectionHeading
        id="monthly-questions-title"
        title={t("monthlyTitle")}
        actions={data.monthlyQuestions && canManage ? <Action variant="ghost" size="sm" onClick={() => void toggle(false)} disabled={pending}>{t("monthlyTurnOff")}</Action> : undefined}
      >
        {t("monthlyHelp")}
      </SectionHeading>
      {error && <Status error>{error}</Status>}
      {!data.monthlyQuestions ? (
        !data.eligible ? <p className="p-cell-meta">{t("monthlyPlanNeeded")}</p>
          : canManage ? (
            <Action variant="secondary" onClick={() => void toggle(true)} disabled={pending}>
              <CalendarClock aria-hidden="true" />
              {t("monthlyTurnOn")}
            </Action>
          ) : <p className="p-cell-meta">{t("monthlyOwnerOnly")}</p>
      ) : (
        <p className="p-cell-meta">{t("monthlyOn")}</p>
      )}
      {data.refreshes.length > 0 && (
        <ul className="p-bullets p-monthly-refreshes">
          {data.refreshes.slice(0, 5).map((refresh) => <li key={refresh.id}>{refreshLine(refresh)}</li>)}
        </ul>
      )}
      {data.proposals.length ? (
        <>
          <ul className="p-proposals">
            {data.proposals.map((proposal) => (
              <li key={proposal.id} className="p-proposal">
                <Check
                  label={proposal.question}
                  aria-label={`${t("monthlySelectQuestion")}: ${proposal.question}`}
                  checked={selected.has(proposal.id)}
                  onChange={(event) => setSelected((current) => { const next = new Set(current); if (event.target.checked) next.add(proposal.id); else next.delete(proposal.id); return next; })}
                  description={proposal.expected}
                />
                <div className="p-proposal-meta">
                  <Badge tone={proposal.changeKind === "new_page" ? "info" : "warn"}>{proposal.changeKind === "new_page" ? t("monthlyNewPage") : t("monthlyChangedPage")}</Badge>
                  {proposal.pageUrl && <span className="p-cell-meta p-break">{proposal.pageUrl}</span>}
                </div>
                <blockquote className="p-quote"><span className="sr-only">{t("monthlyFromPage")}: </span>{proposal.quote}</blockquote>
              </li>
            ))}
          </ul>
          <span className="p-row">
            <Action onClick={() => void decide(true)} disabled={pending || !selected.size}>{t("monthlyApproveSelected")}</Action>
            <Action variant="secondary" onClick={() => void decide(false)} disabled={pending || !selected.size}>{t("monthlyRejectSelected")}</Action>
            <span className="p-cell-meta">{tv("monthlyProposed", { n: data.proposals.length })}</span>
          </span>
        </>
      ) : (
        data.monthlyQuestions && <p className="p-cell-meta">{t("monthlyNone")}</p>
      )}
    </section>
  );
}
