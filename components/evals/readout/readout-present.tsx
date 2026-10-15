"use client";

/**
 * Readout mode entry points (launch L-35): a report revision, loaded through
 * the readout API, and the example evaluation, from its fixture with notes
 * and picks kept on this device. Both render ReadoutView.
 */
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { ReportSnapshot } from "@/lib/evals/reports/contracts";
import type { ReadoutNextStep } from "@/lib/evals/reports/readout";
import { readoutCopy } from "@/lib/evals/reports/readout-copy";
import { readoutAccess, type ReadoutAccess, type ReadoutMode } from "@/lib/evals/readout/access";
import { getLocale } from "@/lib/evals/messages/runtime";
import { evalRequest } from "../api";
import { notify } from "../overlays";
import { Action, ActionLink, Loading, PageHeading, Status } from "../primitives";
import { useWorkspace } from "../workspace-context";
import { ReadoutView, type ReadoutExportState, type ReadoutSaveInput } from "./readout-view";

type ReadoutResponse = {
  access: ReadoutAccess;
  revision: { id: string; report_id: string; created_at: string; review_status: string; snapshot: ReportSnapshot };
  defaultNextStep: ReadoutNextStep;
  deck: { transcriptIds: string[] | null; nextStep: ReadoutNextStep | null; updatedAt: string | null };
  notes?: Record<string, string>;
};
type ExportJob = { id: string; status: string; artifact_id?: string | null; download_path?: string | null };

function useView() {
  const params = useSearchParams();
  return params.get("view") === "presenter" ? ("presenter" as const) : ("audience" as const);
}

/** `/workspace/reports/[id]/present`: readout of one report revision (`?revision=`, default the current one). */
export function ReportReadout({ reportId, mode }: { reportId: string; mode: ReadoutMode }) {
  const { orgId, role, operator, withOrg } = useWorkspace();
  const params = useSearchParams();
  const router = useRouter();
  const view = useView();
  const locale = getLocale();
  const copy = readoutCopy(locale);
  const requested = params.get("revision");
  const access = readoutAccess(mode, role, operator);
  const [data, setData] = useState<ReadoutResponse | null>(null);
  const [error, setError] = useState("");
  const [job, setJob] = useState<ExportJob | null>(null);
  const reportHref = withOrg(`/workspace/reports/${reportId}`);

  const load = useCallback(() => {
    if (!orgId || !access.present) return;
    const query = new URLSearchParams({ orgId, ...(requested ? { revisionId: requested } : {}) });
    void evalRequest<ReadoutResponse>(`/reports/${reportId}/readout?${query.toString()}`)
      .then((value) => {
        setData(value);
        setError("");
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : copy.loadFailed));
  }, [orgId, access.present, requested, reportId, copy.loadFailed]);
  useEffect(() => {
    load();
  }, [load]);

  const download = useCallback(
    (artifactId: string) => {
      const name = `${data?.revision.snapshot.system.name ?? "report"} readout`;
      notify(copy.exportReady);
      window.location.assign(`/api/evals/v1/report-artifacts/${artifactId}?orgId=${encodeURIComponent(orgId)}&name=${encodeURIComponent(name)}`);
    },
    [data, orgId, copy.exportReady],
  );
  // Poll a queued readout PDF until the document worker finishes it, then download it.
  useEffect(() => {
    if (!job || !["queued", "running"].includes(job.status)) return;
    const timer = window.setTimeout(
      () =>
        void evalRequest<ExportJob>(`/exports/${job.id}?orgId=${encodeURIComponent(orgId)}`)
          .then((next) => {
            setJob(next);
            if (next.status === "completed" && next.artifact_id) download(next.artifact_id);
          })
          .catch(() => undefined),
      2000,
    );
    return () => window.clearTimeout(timer);
  }, [job, orgId, download]);

  const onExport = useCallback(
    async (choice: { transcriptIds: string[]; nextStep: ReadoutNextStep }) => {
      if (!data) return;
      try {
        const queued = await evalRequest<ExportJob>(`/reports/${reportId}/readout/export`, "POST", { orgId, revisionId: data.revision.id, locale, transcriptIds: choice.transcriptIds, nextStep: choice.nextStep });
        if (queued.status === "completed" && queued.artifact_id) {
          setJob(queued);
          download(queued.artifact_id);
        } else {
          setJob(queued);
          notify(copy.exportPreparing);
        }
      } catch {
        setJob({ id: "", status: "failed" });
      }
    },
    [data, reportId, orgId, locale, download, copy.exportPreparing],
  );
  const onSave = useCallback(
    async (input: ReadoutSaveInput) => {
      const saved = await evalRequest<ReadoutResponse>(`/reports/${reportId}/readout`, "PUT", { orgId, revisionId: data!.revision.id, ...input });
      notify(copy.saved);
      return { saved: { transcriptIds: saved.deck.transcriptIds, nextStep: saved.deck.nextStep }, notes: saved.notes ?? {} };
    },
    [reportId, orgId, data, copy.saved],
  );
  const onPresented = useCallback(
    (slideCount: number) => {
      if (data) void evalRequest(`/reports/${reportId}/readout/presented`, "POST", { orgId, revisionId: data.revision.id, slideCount }).catch(() => undefined);
    },
    [data, reportId, orgId],
  );
  const exportState: ReadoutExportState = { status: !job ? "idle" : job.status === "failed" ? "failed" : job.status === "completed" ? "ready" : "preparing" };

  if (!access.present)
    return (
      <>
        <PageHeading title={copy.present} />
        <Status tone="warn" action={<ActionLink variant="secondary" size="sm" href={reportHref}>{copy.exit}</ActionLink>}>{copy.notAllowed}</Status>
      </>
    );
  if (error)
    return (
      <>
        <PageHeading title={copy.present} />
        <Status error action={<Action variant="secondary" size="sm" onClick={load}>{copy.retry}</Action>}>{error}</Status>
      </>
    );
  if (!data) return <Loading>{copy.loading}</Loading>;
  return (
    <ReadoutView
      key={data.revision.id}
      view={view}
      locale={locale}
      snapshot={data.revision.snapshot}
      revisionId={data.revision.id}
      access={data.access}
      defaultNextStep={data.defaultNextStep}
      saved={{ transcriptIds: data.deck.transcriptIds, nextStep: data.deck.nextStep }}
      notes={data.notes}
      onSave={data.access.edit ? onSave : undefined}
      onExport={onExport}
      exportState={exportState}
      onPresented={onPresented}
      onExit={() => router.push(reportHref)}
      presenterHref={withOrg(`/workspace/reports/${reportId}/present?revision=${data.revision.id}&view=presenter`)}
    />
  );
}

/* ------------------------------------------------------------ example --- */

const EXAMPLE_KEY = "caudals.readout.example";
type LocalReadout = { transcriptIds: string[] | null; nextStep: ReadoutNextStep | null; notes: Record<string, string> };
function readLocal(): LocalReadout {
  try {
    const value = JSON.parse(window.localStorage.getItem(EXAMPLE_KEY) ?? "null") as Partial<LocalReadout> | null;
    return { transcriptIds: Array.isArray(value?.transcriptIds) ? value.transcriptIds.filter((id): id is string => typeof id === "string") : null, nextStep: value?.nextStep === "pilot" || value?.nextStep === "subscription" ? value.nextStep : null, notes: value?.notes && typeof value.notes === "object" ? (value.notes as Record<string, string>) : {} };
  } catch {
    return { transcriptIds: null, nextStep: null, notes: {} };
  }
}
const subscribeNever = () => () => undefined;

/**
 * `/workspace/example/present`: the example evaluation as the demo deck. It
 * is read-only: an operator's notes and picks stay in this browser, nothing
 * is sent anywhere, and there is no PDF export of the example.
 */
export function ExampleReadout({ snapshot, mode, defaultNextStep = "pilot" }: { snapshot: ReportSnapshot; mode: ReadoutMode; defaultNextStep?: ReadoutNextStep }) {
  const { role, operator } = useWorkspace();
  const router = useRouter();
  const view = useView();
  const locale = getLocale();
  const copy = readoutCopy(locale);
  const access = readoutAccess(mode, role, operator);
  const ready = useSyncExternalStore(subscribeNever, () => true, () => false);
  const local = useMemo(() => (ready ? readLocal() : null), [ready]);
  const onSave = useCallback(async (input: ReadoutSaveInput) => {
    const current = readLocal();
    const notes = { ...current.notes };
    for (const [key, body] of Object.entries(input.notes)) {
      if (body == null) delete notes[key];
      else notes[key] = body;
    }
    const next: LocalReadout = { transcriptIds: input.transcriptIds, nextStep: input.nextStep, notes };
    try {
      window.localStorage.setItem(EXAMPLE_KEY, JSON.stringify(next));
    } catch {
      /* kept for this session only */
    }
    return { saved: { transcriptIds: next.transcriptIds, nextStep: next.nextStep }, notes };
  }, []);

  if (!access.present)
    return (
      <>
        <PageHeading title={copy.present} />
        <Status tone="warn" action={<ActionLink variant="secondary" size="sm" href="/workspace/example">{copy.exit}</ActionLink>}>{copy.notAllowed}</Status>
      </>
    );
  if (!local) return <Loading>{copy.loading}</Loading>;
  return (
    <ReadoutView
      view={view}
      locale={locale}
      snapshot={snapshot}
      revisionId={snapshot.report_revision_id}
      access={access}
      sample
      defaultNextStep={defaultNextStep}
      saved={{ transcriptIds: local.transcriptIds, nextStep: local.nextStep }}
      notes={access.notes ? local.notes : undefined}
      onSave={access.edit ? onSave : undefined}
      onExit={() => router.push("/workspace/example")}
      presenterHref="/workspace/example/present?view=presenter"
    />
  );
}
