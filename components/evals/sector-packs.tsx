"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { ArrowLeft, BookCheck, ExternalLink, Pencil, Plus, Trash2, Upload } from "lucide-react";
import { evalRequest } from "./api";
import { Action, Badge, DataTable, DefinitionList, EmptyState, Field, InlineSelect, PageHeading, Progress, SearchInput, SelectField, Status, TableSkeleton, TextArea, Toolbar, formatDate } from "./primitives";
import { Modal, SidePanel, notify } from "./overlays";
import { getLocale, t, tv, type MessageKey } from "@/lib/evals/messages/runtime";
import { SOURCE_FRESHNESS_DAYS } from "@/lib/evals/sector-packs/flags";
import { SECTOR_LABELS, isSector } from "@/lib/evals/sector-packs/sectors";

/**
 * Sector pack authoring (launch L-25, P-31): the ops library tab and the
 * expert screen. Staff import pack files, move versions through draft →
 * review → publish and edit questions; verified experts draft and edit
 * questions; eligible experts record reviews. Every question shows its
 * source, rights, author and review; published versions are read-only.
 */

type Role = { staff: boolean; expert: boolean; reviewer: boolean };
type Status = "draft" | "in_review" | "published";
type VersionSummary = {
  id: string; packId: string; version: number; status: Status; notes: string; createdAt: string; updatedAt: string; submittedAt: string | null; publishedAt: string | null;
  items: number; approved: number; pending: number; changesRequested: number; rejected: number; oldestSource: string | null;
};
type Pack = { id: string; sector: string; jurisdiction: string; language: string; title: { en: string; es: string }; summary: { en: string; es: string }; versions: VersionSummary[] };
type ReviewStatus = "pending" | "approved" | "changes_requested" | "rejected";
type Item = {
  id: string; key: string; topic: string; language: string; question: string; questionEn: string | null; expected: string; keyFacts: string[];
  severity: "low" | "medium" | "high" | "critical"; difficulty: "routine" | "advanced" | "challenge"; answerability: string;
  source: { url: string; title: string; publisher: string; locator: string; excerpt: string; retrievedAt: string; asOf: string | null };
  rights: { kind: RightsKind; basis: string; licenceRef: string | null };
  authorId: string; authorNote: string; updatedBy: string;
  review: { status: ReviewStatus; reviewerId: string | null; reviewerProfileId: string | null; reviewedAt: string | null; note: string | null };
  stats: { workspaces: number; results: number; passed: number | null; partial: number | null; failed: number | null } | null;
};
type RightsKind = "public_official_text" | "public_sector_reuse" | "licensed" | "caudals_owned";
type VersionDetail = { role: Role; pack: Omit<Pack, "versions">; version: VersionSummary; items: Item[]; minPublished: number };

const STATUS_LABEL: Record<Status, MessageKey> = { draft: "sectorPackStatusDraft", in_review: "sectorPackStatusInReview", published: "sectorPackStatusPublished" };
const STATUS_TONE: Record<Status, "warn" | "info" | "pass"> = { draft: "warn", in_review: "info", published: "pass" };
const REVIEW_LABEL: Record<ReviewStatus, MessageKey> = { pending: "sectorPackReviewPending", approved: "sectorPackReviewApproved", changes_requested: "sectorPackReviewChanges", rejected: "sectorPackReviewRejected" };
const REVIEW_TONE: Record<ReviewStatus, "warn" | "pass" | "info" | "fail"> = { pending: "warn", approved: "pass", changes_requested: "info", rejected: "fail" };
const RIGHTS_LABEL: Record<RightsKind, MessageKey> = { public_official_text: "sectorPackRightsPublicOfficial", public_sector_reuse: "sectorPackRightsPublicReuse", licensed: "sectorPackRightsLicensed", caudals_owned: "sectorPackRightsCaudals" };

const title = (value: { en: string; es: string }) => (getLocale() === "es" ? value.es : value.en);
const sectorLabel = (sector: string) => (isSector(sector) ? t(SECTOR_LABELS[sector]) : sector);
const stale = (date: string | null) => !!date && Date.now() - Date.parse(`${date}T00:00:00Z`) > SOURCE_FRESHNESS_DAYS * 86_400_000;

export function SectorPackLibrary({ mode }: { mode: "ops" | "expert" }) {
  const [versionId, setVersionId] = useState<string | null>(null);
  return versionId ? <PackVersion versionId={versionId} onBack={() => setVersionId(null)} onOpen={setVersionId} /> : <PackList mode={mode} onOpen={setVersionId} />;
}

function PackList({ mode, onOpen }: { mode: "ops" | "expert"; onOpen: (id: string) => void }) {
  const [data, setData] = useState<{ role: Role; packs: Pack[] } | null>(null);
  const [error, setError] = useState("");
  const [importing, setImporting] = useState(false);
  const load = useCallback(() => evalRequest<{ role: Role; packs: Pack[] }>("/sector-packs").then(setData).catch((value) => setError(value instanceof Error ? value.message : t("error"))), []);
  useEffect(() => { void load(); }, [load]);
  return (
    <>
      {mode === "expert" && <PageHeading title={t("sectorPacks")}>{t("sectorPacksHelp")}</PageHeading>}
      {mode === "ops" && <p className="p-cell-meta">{t("sectorPacksHelp")}</p>}
      {error && <Status error>{error}</Status>}
      {data?.role.staff && (
        <Toolbar>
          <span className="p-toolbar-spacer" />
          <Action variant="secondary" onClick={() => setImporting(true)}>
            <Upload aria-hidden="true" />
            {t("sectorPackImport")}
          </Action>
        </Toolbar>
      )}
      {!data && !error ? (
        <TableSkeleton columns={5} />
      ) : data && !data.packs.length ? (
        <EmptyState title={t("sectorPackNone")} icon={<BookCheck />}>
          <p>{t("sectorPackNoneHelp")}</p>
        </EmptyState>
      ) : data ? (
        <DataTable caption={t("sectorPacks")} headers={[t("sectorPackColumnPack"), t("sectorPackColumnVersion"), { label: t("sectorPackColumnQuestions"), align: "end" }, { label: t("sectorPackColumnApproved"), align: "end" }, { label: t("sectorPackColumnOldest"), align: "end" }]}>
          {data.packs.flatMap((pack) =>
            pack.versions.map((version) => (
              <tr key={version.id}>
                <th scope="row">
                  <span className="p-table-primary">
                    <button type="button" className="p-row-link p-row-button" onClick={() => onOpen(version.id)}>
                      {title(pack.title)}
                    </button>
                    <span className="p-cell-meta">{sectorLabel(pack.sector)} · {pack.jurisdiction} · {pack.language}</span>
                  </span>
                </th>
                <td>
                  <span className="p-row p-nowrap">
                    <span>v{version.version}</span>
                    <Badge tone={STATUS_TONE[version.status]} dot>{t(STATUS_LABEL[version.status])}</Badge>
                  </span>
                </td>
                <td className="p-num">{version.items}</td>
                <td className="p-num">{version.approved}/{version.items}</td>
                <td className="p-table-action p-cell-meta">
                  {version.oldestSource ? formatDate(version.oldestSource) : "—"}
                  {stale(version.oldestSource) && <> · <Badge tone="warn">{t("sectorPackStale")}</Badge></>}
                </td>
              </tr>
            )),
          )}
        </DataTable>
      ) : null}
      {importing && <ImportDialog onClose={() => setImporting(false)} onImported={async (versionId) => { setImporting(false); await load(); onOpen(versionId); }} />}
    </>
  );
}

function ImportDialog({ onClose, onImported }: { onClose: () => void; onImported: (versionId: string) => Promise<void> }) {
  const [file, setFile] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!file || pending) return;
    setPending(true);
    setError("");
    try {
      const body = JSON.parse(await file.text()) as unknown;
      const result = await evalRequest<{ versionId: string; created: number; updated: number; items: number }>("/sector-packs", "POST", body);
      notify(tv("sectorPackImported", { created: result.created, updated: result.updated, items: result.items }));
      await onImported(result.versionId);
    } catch (value) {
      setError(value instanceof SyntaxError ? t("error") : value instanceof Error ? value.message : t("error"));
    } finally {
      setPending(false);
    }
  }
  return (
    <Modal
      open
      onOpenChange={(open) => !open && onClose()}
      title={t("sectorPackImport")}
      description={t("sectorPackImportHelp")}
      alert={error ? <Status error>{error}</Status> : undefined}
      footer={
        <>
          <Action variant="secondary" onClick={onClose}>{t("cancel")}</Action>
          <Action type="submit" form="sector-pack-import" disabled={!file || pending}>{pending ? t("working") : t("sectorPackImport")}</Action>
        </>
      }
    >
      <form id="sector-pack-import" onSubmit={submit}>
        <Field id="sector-pack-file" label={t("sectorPackFile")} type="file" accept="application/json,.json" onChange={(event) => setFile(event.target.files?.[0] ?? null)} required />
      </form>
    </Modal>
  );
}

function PackVersion({ versionId, onBack, onOpen }: { versionId: string; onBack: () => void; onOpen: (id: string) => void }) {
  const [data, setData] = useState<VersionDetail | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [query, setQuery] = useState("");
  const [topic, setTopic] = useState("all");
  const [review, setReview] = useState<"all" | ReviewStatus>("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Item | "new" | null>(null);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const load = useCallback(async () => {
    try { setData(await evalRequest<VersionDetail>(`/sector-packs/versions/${versionId}`)); setError(""); }
    catch (value) { setError(value instanceof Error ? value.message : t("error")); }
  }, [versionId]);
  useEffect(() => { void load(); }, [load]);
  const topics = useMemo(() => [...new Set(data?.items.map((item) => item.topic) ?? [])].sort(), [data]);
  if (!data) return error ? <Status error>{error}</Status> : <TableSkeleton columns={5} />;
  const { version, pack, role, items } = data;
  const open = version.status !== "published";
  const needle = query.trim().toLowerCase();
  const visible = items.filter((item) => (topic === "all" || item.topic === topic) && (review === "all" || item.review.status === review)
    && (!needle || `${item.key} ${item.question} ${item.questionEn ?? ""} ${item.source.title} ${item.source.locator}`.toLowerCase().includes(needle)));
  const item = items.find((candidate) => candidate.id === openId) ?? null;
  const publishable = version.items >= data.minPublished && version.approved === version.items;

  async function move(to: Status) {
    setPending(true);
    setError("");
    try {
      await evalRequest(`/sector-packs/versions/${versionId}/status`, "POST", { to });
      notify(t("sectorPackStatusChanged"));
      setConfirmPublish(false);
      await load();
    } catch (value) {
      setError(value instanceof Error ? value.message : t("error"));
    } finally {
      setPending(false);
    }
  }
  async function newVersion() {
    setPending(true);
    try {
      const created = await evalRequest<{ id: string }>("/sector-packs/versions", "POST", { packId: pack.id, notes: "" });
      onOpen(created.id);
    } catch (value) {
      setError(value instanceof Error ? value.message : t("error"));
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <div className="p-row">
        <Action variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft aria-hidden="true" />
          {t("sectorPackBack")}
        </Action>
      </div>
      <PageHeading
        title={title(pack.title)}
        meta={
          <>
            <span>{tv("sectorPackVersionLabel", { version: version.version })}</span>
            <Badge tone={STATUS_TONE[version.status]} dot>{t(STATUS_LABEL[version.status])}</Badge>
            <span>{sectorLabel(pack.sector)} · {pack.jurisdiction}</span>
          </>
        }
        actions={
          role.staff ? (
            <>
              {version.status === "draft" && <Action onClick={() => void move("in_review")} disabled={pending || !version.items}>{t("sectorPackSubmit")}</Action>}
              {version.status === "in_review" && (
                <>
                  <Action variant="secondary" onClick={() => void move("draft")} disabled={pending}>{t("sectorPackReturn")}</Action>
                  <Action onClick={() => setConfirmPublish(true)} disabled={pending || !publishable} title={publishable ? undefined : tv("sectorPackPublishBlocked", { min: data.minPublished })}>{t("sectorPackPublish")}</Action>
                </>
              )}
              {version.status === "published" && <Action variant="secondary" onClick={() => void newVersion()} disabled={pending}>{t("sectorPackNewVersion")}</Action>}
            </>
          ) : undefined
        }
      >
        {title(pack.summary)}
      </PageHeading>
      {error && <Status error>{error}</Status>}
      {open ? <Status tone="warn">{t("sectorPackPendingBanner")}</Status> : <Status tone="info">{t("sectorPackPublishedBanner")}</Status>}
      {version.status === "in_review" && !publishable && <p className="p-field-hint">{tv("sectorPackPublishBlocked", { min: data.minPublished })}</p>}
      <div className="p-sector-progress">
        <Progress value={version.approved} max={Math.max(1, version.items)} label={t("sectorPackColumnApproved")} />
        <span className="p-cell-meta">{tv("sectorPackProgress", { approved: version.approved, items: version.items })}</span>
      </div>
      <Toolbar>
        <SearchInput value={query} onChange={setQuery} label={t("sectorPackSearch")} />
        <InlineSelect id="sector-pack-topic" label={t("sectorPackTopic")} value={topic} onChange={(event) => setTopic(event.target.value)}>
          <option value="all">{t("sectorPackAllTopics")}</option>
          {topics.map((value) => <option key={value} value={value}>{value}</option>)}
        </InlineSelect>
        <InlineSelect id="sector-pack-review" label={t("sectorPackColumnReview")} value={review} onChange={(event) => setReview(event.target.value as typeof review)}>
          <option value="all">{t("sectorPackAllReviews")}</option>
          {(Object.keys(REVIEW_LABEL) as ReviewStatus[]).map((value) => <option key={value} value={value}>{t(REVIEW_LABEL[value])}</option>)}
        </InlineSelect>
        <span className="p-toolbar-spacer" />
        {open && (
          <Action variant="secondary" onClick={() => setEditing("new")}>
            <Plus aria-hidden="true" />
            {t("sectorPackAddQuestion")}
          </Action>
        )}
      </Toolbar>
      <DataTable caption={t("sectorPackColumnQuestions")} headers={[t("sectorPackQuestion"), t("sectorPackColumnSource"), t("sectorPackColumnRights"), t("sectorPackColumnReview"), { label: t("sectorPackColumnResults"), align: "end" }]}>
        {visible.map((row) => (
          <tr key={row.id}>
            <th scope="row">
              <span className="p-table-primary">
                <button type="button" className="p-row-link p-row-button" onClick={() => setOpenId(row.id)}>{row.question}</button>
                <span className="p-cell-meta">{row.topic} · {row.key}</span>
              </span>
            </th>
            <td className="p-cell-meta">
              {row.source.publisher} · {row.source.locator}
              <br />
              {formatDate(row.source.retrievedAt)}
              {stale(row.source.retrievedAt) && <> · <Badge tone="warn">{t("sectorPackStale")}</Badge></>}
            </td>
            <td><Badge>{t(RIGHTS_LABEL[row.rights.kind])}</Badge></td>
            <td><Badge tone={REVIEW_TONE[row.review.status]} dot>{t(REVIEW_LABEL[row.review.status])}</Badge></td>
            <td className="p-table-action p-cell-meta">{resultsText(row.stats)}</td>
          </tr>
        ))}
      </DataTable>
      <ItemPanel
        key={openId ?? "closed"}
        item={item}
        role={role}
        versionStatus={version.status}
        onClose={() => setOpenId(null)}
        onEdit={(value) => { setOpenId(null); setEditing(value); }}
        onChanged={load}
      />
      {editing && (
        <ItemEditor
          versionId={versionId}
          language={pack.language}
          item={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={async () => { setEditing(null); notify(t("sectorPackItemSaved")); await load(); }}
        />
      )}
      <Modal
        open={confirmPublish}
        onOpenChange={setConfirmPublish}
        title={t("sectorPackPublish")}
        description={t("sectorPackPublishConfirm")}
        size="sm"
        footer={
          <>
            <Action variant="secondary" onClick={() => setConfirmPublish(false)}>{t("cancel")}</Action>
            <Action onClick={() => void move("published")} disabled={pending}>{t("sectorPackPublish")}</Action>
          </>
        }
      />
    </>
  );
}

function resultsText(stats: Item["stats"]) {
  if (!stats || !stats.results) return t("sectorPackResultsNone");
  if (stats.failed === null || stats.passed === null) return tv("sectorPackResultsFew", { results: stats.results });
  return tv("sectorPackResultsRate", { rate: Math.round(((stats.failed + (stats.partial ?? 0) / 2) / stats.results) * 100), results: stats.results, workspaces: stats.workspaces });
}

function ItemPanel({ item, role, versionStatus, onClose, onEdit, onChanged }: { item: Item | null; role: Role; versionStatus: Status; onClose: () => void; onEdit: (item: Item) => void; onChanged: () => Promise<void> }) {
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [removing, setRemoving] = useState(false);
  const open = versionStatus !== "published";
  async function decide(decision: "approved" | "changes_requested" | "rejected") {
    if (!item) return;
    setPending(true);
    setError("");
    try {
      await evalRequest(`/sector-packs/items/${item.id}/review`, "POST", { decision, ...(note.trim() ? { note: note.trim() } : {}) });
      notify(t("sectorPackReviewSaved"));
      setNote("");
      await onChanged();
    } catch (value) {
      setError(value instanceof Error ? value.message : t("error"));
    } finally {
      setPending(false);
    }
  }
  async function remove() {
    if (!item) return;
    setPending(true);
    try {
      await evalRequest(`/sector-packs/items/${item.id}`, "DELETE");
      notify(t("sectorPackItemRemoved"));
      setRemoving(false);
      onClose();
      await onChanged();
    } catch (value) {
      setError(value instanceof Error ? value.message : t("error"));
    } finally {
      setPending(false);
    }
  }
  return (
    <SidePanel
      open={!!item}
      onOpenChange={(value) => !value && onClose()}
      title={item?.question ?? t("sectorPackQuestion")}
      description={item && <><code className="p-code">{item.key}</code> · {t("sectorPackScope")}</>}
      wide
      footer={
        item && open ? (
          <span className="p-row">
            <Action variant="secondary" onClick={() => onEdit(item)} disabled={pending}>
              <Pencil aria-hidden="true" />
              {t("edit")}
            </Action>
            <Action variant="ghost" onClick={() => setRemoving(true)} disabled={pending}>
              <Trash2 aria-hidden="true" />
              {t("remove")}
            </Action>
          </span>
        ) : undefined
      }
    >
      {item && (
        <>
          {error && <Status error>{error}</Status>}
          <Badge tone={REVIEW_TONE[item.review.status]} dot>{t(REVIEW_LABEL[item.review.status])}</Badge>
          <DefinitionList
            items={[
              ...(item.questionEn ? [{ term: t("sectorPackQuestionEn"), value: item.questionEn }] : []),
              { term: t("sectorPackExpected"), value: item.expected },
              { term: t("keyFacts"), value: item.keyFacts.join(" · ") },
              { term: t("sectorPackTopic"), value: `${item.topic} · ${item.severity} · ${item.difficulty}` },
            ]}
          />
          <section>
            <h3 className="p-subhead">{t("sectorPackColumnSource")}</h3>
            <blockquote className="p-quote">{item.source.excerpt}</blockquote>
            <p className="p-cell-meta">
              {item.source.publisher} · {item.source.title} · {item.source.locator}
              <br />
              {t("sectorPackRetrieved")} {formatDate(item.source.retrievedAt)}
              {item.source.asOf && <> · {t("sectorPackAsOf")} {formatDate(item.source.asOf)}</>}
              {stale(item.source.retrievedAt) && <> · {tv("sectorPackStaleHelp", { days: SOURCE_FRESHNESS_DAYS })}</>}
            </p>
            <a className="p-link" href={item.source.url} target="_blank" rel="noreferrer noopener">
              {t("sectorPackOpenSource")}
              <ExternalLink aria-hidden="true" />
            </a>
          </section>
          <DefinitionList
            items={[
              { term: t("sectorPackRightsKind"), value: t(RIGHTS_LABEL[item.rights.kind]) },
              { term: t("sectorPackRightsBasis"), value: item.rights.basis },
              ...(item.rights.licenceRef ? [{ term: t("sectorPackLicenceRef"), value: item.rights.licenceRef }] : []),
              { term: t("sectorPackAuthor"), value: <code className="p-code">{item.authorId}</code> },
              { term: t("sectorPackReviewer"), value: item.review.reviewerId ? <><code className="p-code">{item.review.reviewerId}</code> · {tv("sectorPackReviewedOn", { date: formatDate(item.review.reviewedAt) })}</> : t("sectorPackReviewPending") },
              ...(item.review.note ? [{ term: t("sectorPackReviewNote"), value: item.review.note }] : []),
              { term: t("sectorPackColumnResults"), value: <>{resultsText(item.stats)}<br /><span className="p-cell-meta">{t("sectorPackResultsHelp")}</span></> },
            ]}
          />
          {role.reviewer && open && (
            <section className="p-sector-review">
              <h3 className="p-subhead">{t("sectorPackColumnReview")}</h3>
              {versionStatus !== "in_review" ? (
                <p className="p-cell-meta">{t("sectorPackReviewInReview")}</p>
              ) : (
                <>
                  <TextArea id="sector-pack-review-note" label={t("sectorPackReviewNote")} rows={3} value={note} onChange={(event) => setNote(event.target.value)} maxLength={2000} />
                  <span className="p-row">
                    <Action onClick={() => void decide("approved")} disabled={pending}>{t("sectorPackApprove")}</Action>
                    <Action variant="secondary" onClick={() => void decide("changes_requested")} disabled={pending || !note.trim()}>{t("sectorPackRequestChanges")}</Action>
                    <Action variant="ghost" onClick={() => void decide("rejected")} disabled={pending || !note.trim()}>{t("sectorPackReject")}</Action>
                  </span>
                  <p className="p-field-hint">{t("sectorPackOwnItem")}</p>
                </>
              )}
            </section>
          )}
        </>
      )}
      <Modal
        open={removing}
        onOpenChange={setRemoving}
        title={t("remove")}
        description={item?.question}
        size="sm"
        footer={
          <>
            <Action variant="secondary" onClick={() => setRemoving(false)}>{t("cancel")}</Action>
            <Action onClick={() => void remove()} disabled={pending}>{t("remove")}</Action>
          </>
        }
      />
    </SidePanel>
  );
}

const lines = (value: string) => value.split("\n").map((line) => line.trim()).filter(Boolean);

function ItemEditor({ versionId, language, item, onClose, onSaved }: { versionId: string; language: string; item: Item | null; onClose: () => void; onSaved: () => Promise<void> }) {
  const [form, setForm] = useState(() => ({
    key: item?.key ?? "", topic: item?.topic ?? "", question: item?.question ?? "", questionEn: item?.questionEn ?? "", expected: item?.expected ?? "",
    keyFacts: (item?.keyFacts ?? []).join("\n"), severity: item?.severity ?? "high", difficulty: item?.difficulty ?? "routine",
    url: item?.source.url ?? "", sourceTitle: item?.source.title ?? "", publisher: item?.source.publisher ?? "", locator: item?.source.locator ?? "",
    excerpt: item?.source.excerpt ?? "", retrievedAt: item?.source.retrievedAt ?? new Date().toISOString().slice(0, 10), asOf: item?.source.asOf ?? "",
    rightsKind: item?.rights.kind ?? "public_official_text", basis: item?.rights.basis ?? "", licenceRef: item?.rights.licenceRef ?? "",
  }));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const set = (key: keyof typeof form) => (event: { target: { value: string } }) => setForm((current) => ({ ...current, [key]: event.target.value }));
  async function save(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      await evalRequest(`/sector-packs/versions/${versionId}/items`, "POST", {
        item: {
          key: form.key.trim(), topic: form.topic.trim(), language, question: form.question.trim(), ...(form.questionEn.trim() ? { questionEn: form.questionEn.trim() } : {}),
          expected: form.expected.trim(), keyFacts: lines(form.keyFacts), severity: form.severity, difficulty: form.difficulty,
          source: { url: form.url.trim(), title: form.sourceTitle.trim(), publisher: form.publisher.trim(), locator: form.locator.trim(), excerpt: form.excerpt.trim(), retrievedAt: form.retrievedAt, ...(form.asOf ? { asOf: form.asOf } : {}) },
          rights: { kind: form.rightsKind, basis: form.basis.trim(), ...(form.licenceRef.trim() ? { licenceRef: form.licenceRef.trim() } : {}) },
        },
      });
      await onSaved();
    } catch (value) {
      setError(value instanceof Error ? value.message : t("error"));
    } finally {
      setPending(false);
    }
  }
  return (
    <SidePanel
      open
      onOpenChange={(value) => !value && onClose()}
      title={item ? t("sectorPackEditQuestion") : t("sectorPackAddQuestion")}
      description={t("sectorPackPendingBanner")}
      wide
      footer={
        <span className="p-row">
          <Action variant="secondary" onClick={onClose}>{t("cancel")}</Action>
          <Action type="submit" form="sector-pack-item" disabled={pending}>{pending ? t("working") : t("save")}</Action>
        </span>
      }
    >
      <form id="sector-pack-item" className="p-form" onSubmit={save}>
        {error && <Status error>{error}</Status>}
        <div className="p-grid-2 p-form-grid">
          <Field id="spi-key" label={t("sectorPackKey")} value={form.key} onChange={set("key")} pattern="[a-z0-9][a-z0-9-]{2,79}" required readOnly={!!item} />
          <Field id="spi-topic" label={t("sectorPackTopic")} value={form.topic} onChange={set("topic")} maxLength={80} required />
        </div>
        <TextArea id="spi-question" label={t("sectorPackQuestion")} value={form.question} onChange={set("question")} rows={2} minLength={8} maxLength={2000} required />
        <Field id="spi-question-en" label={t("sectorPackQuestionEn")} value={form.questionEn} onChange={set("questionEn")} maxLength={2000} />
        <TextArea id="spi-expected" label={t("sectorPackExpected")} value={form.expected} onChange={set("expected")} rows={2} maxLength={4000} required />
        <TextArea id="spi-facts" label={t("sectorPackKeyFacts")} value={form.keyFacts} onChange={set("keyFacts")} rows={3} required />
        <div className="p-grid-2 p-form-grid">
          <SelectField id="spi-severity" label={t("severity")} value={form.severity} onChange={set("severity")}>
            {["low", "medium", "high", "critical"].map((value) => <option key={value} value={value}>{value}</option>)}
          </SelectField>
          <SelectField id="spi-difficulty" label={t("sectorPackDifficulty")} value={form.difficulty} onChange={set("difficulty")}>
            {["routine", "advanced", "challenge"].map((value) => <option key={value} value={value}>{value}</option>)}
          </SelectField>
        </div>
        <Field id="spi-url" type="url" label={t("sectorPackSourceUrl")} value={form.url} onChange={set("url")} pattern="https://.*" required />
        <div className="p-grid-2 p-form-grid">
          <Field id="spi-title" label={t("sectorPackSourceTitle")} value={form.sourceTitle} onChange={set("sourceTitle")} maxLength={500} required />
          <Field id="spi-publisher" label={t("sectorPackPublisher")} value={form.publisher} onChange={set("publisher")} maxLength={200} required />
        </div>
        <Field id="spi-locator" label={t("sectorPackLocator")} value={form.locator} onChange={set("locator")} maxLength={200} required />
        <TextArea id="spi-excerpt" label={t("sectorPackExcerpt")} value={form.excerpt} onChange={set("excerpt")} rows={5} minLength={20} maxLength={1500} required />
        <div className="p-grid-2 p-form-grid">
          <Field id="spi-retrieved" type="date" label={t("sectorPackRetrieved")} value={form.retrievedAt} onChange={set("retrievedAt")} required />
          <Field id="spi-asof" type="date" label={t("sectorPackAsOf")} value={form.asOf} onChange={set("asOf")} />
        </div>
        <SelectField id="spi-rights" label={t("sectorPackRightsKind")} value={form.rightsKind} onChange={set("rightsKind")}>
          {(Object.keys(RIGHTS_LABEL) as RightsKind[]).map((value) => <option key={value} value={value}>{t(RIGHTS_LABEL[value])}</option>)}
        </SelectField>
        <TextArea id="spi-basis" label={t("sectorPackRightsBasis")} value={form.basis} onChange={set("basis")} rows={2} minLength={20} maxLength={1000} required />
        {form.rightsKind === "licensed" && <Field id="spi-licence" label={t("sectorPackLicenceRef")} value={form.licenceRef} onChange={set("licenceRef")} maxLength={300} required />}
      </form>
    </SidePanel>
  );
}
