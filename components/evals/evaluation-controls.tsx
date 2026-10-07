"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pause, Play, RotateCcw, Square } from "lucide-react";
import type { EvaluationControlAction } from "@/lib/evals/repositories/evaluation-controls";
import { evalRequest } from "./api";
import { Action, Status } from "./primitives";
import { Modal, notify, type MenuEntry } from "./overlays";
import { getLocale, t } from "@/lib/evals/messages/en";

type ControlState = { subject: { id: string; kind: "generation" | "run"; status: string; phase?: string; updatedAt: string } | null; restart: { id: string; status: string; reason_code: string | null } | null; actions: EvaluationControlAction[] };
const labels = { pause: () => t("pauseEvaluation"), resume: () => t("resumeEvaluation"), stop: () => t("stopEvaluation"), restart: () => t("restartEvaluation") };
const icons = { pause: <Pause />, resume: <Play />, stop: <Square />, restart: <RotateCcw /> };

/** Scoped by the keyed journey; cleanup prevents reads and commands crossing evaluations. */
export function useEvaluationControls(orgId: string, evaluationId: string, canWrite: boolean, onChanged: () => Promise<void>) {
  const [state, setState] = useState<ControlState | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [confirm, setConfirm] = useState<"stop" | "restart" | null>(null);
  const [version, setVersion] = useState(0);
  const revision = useRef(0);
  const lastState = useRef<ControlState | null>(null);
  const alive = useRef(true), busy = useRef(false), commandKey = useRef<{ action: EvaluationControlAction; subjectId: string; key: string } | null>(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    if (!orgId) return;
    let live = true, timer = 0;
    const poll = async () => {
      const readRevision = revision.current;
      try {
        if (busy.current) return;
        const next = await evalRequest<ControlState>(`/evaluations/${evaluationId}/control?orgId=${encodeURIComponent(orgId)}`);
        if (!live || busy.current || readRevision !== revision.current) return;
        const previous = lastState.current;
        lastState.current = next;
        setState(next);
        if (previous?.subject && (previous.subject.id !== next.subject?.id || previous.subject.status !== next.subject?.status)) void onChanged().catch(() => {});
        setError(previous => previous === t("evaluationControlsLoadError") ? "" : previous);
      } catch {
        if (live && !busy.current && readRevision === revision.current) { setError(t("evaluationControlsLoadError")); setState(null); }
      } finally {
        if (live) timer = window.setTimeout(() => void poll(), 4_000);
      }
    };
    void poll();
    return () => { live = false; window.clearTimeout(timer); };
  }, [orgId, evaluationId, version, onChanged]);

  const apply = useCallback(async (action: EvaluationControlAction) => {
    if (!state?.subject || busy.current) return;
    const subject = state.subject;
    revision.current++;
    busy.current = true; setPending(true); setError("");
    const previous = commandKey.current;
    const key = previous?.action === action && previous.subjectId === subject.id ? previous.key : crypto.randomUUID();
    commandKey.current = { action, subjectId: subject.id, key };
    try {
      const next = await evalRequest<ControlState>(`/evaluations/${evaluationId}/control`, "POST", { orgId, action, subjectId: subject.id, subjectKind: subject.kind, locale: getLocale() }, key);
      if (!alive.current) return;
      setState(next); setConfirm(null); commandKey.current = null;
      notify(t("evaluationControlSaved"));
      setVersion(value => value + 1);
      await onChanged();
    } catch (reason) {
      if (alive.current) setError(reason instanceof Error ? reason.message : t("error"));
    } finally {
      busy.current = false;
      if (alive.current) setPending(false);
    }
  }, [state, orgId, evaluationId, onChanged]);

  const menu: MenuEntry[] = canWrite ? (state?.actions ?? []).map(action => ({ label: labels[action](), icon: icons[action], disabled: pending, ...(action === "stop" ? { tone: "danger" as const } : {}), onSelect: () => action === "stop" || action === "restart" ? setConfirm(action) : void apply(action) })) : [];
  const waiting = state?.restart?.status === "pending";
  const status = state?.subject?.status;
  const message = waiting ? t("evaluationRestartWaiting") : state?.restart?.status === "failed" ? t("evaluationRestartFailed") : status === "pause_requested" ? t("evaluationPauseWaiting") : status === "cancel_requested" ? t("evaluationStopWaiting") : state?.subject?.kind === "generation" && status === "paused" && state.actions.includes("resume") ? t("evaluationPreparationPaused") : status === "stopped" ? t("evaluationPreparationStopped") : "";
  return { state, menu, pending, apply, alert: error && !confirm ? <Status error action={<Action variant="secondary" size="sm" onClick={() => setVersion(value => value + 1)}>{t("retry")}</Action>}>{error}</Status> : message ? <Status tone="warn">{message}</Status> : null,
    dialog: confirm ? <Modal open size="sm" title={labels[confirm]()} description={confirm === "restart" ? t("evaluationRestartHelp") : waiting ? t("evaluationStopRestartHelp") : t("evaluationStopHelp")} onOpenChange={open => { if (!open && !pending) { setConfirm(null); setError(""); } }} alert={error ? <Status error>{error}</Status> : null} footer={<><Action variant="secondary" disabled={pending} onClick={() => { setConfirm(null); setError(""); }}>{t("cancel")}</Action><Action variant={confirm === "stop" ? "danger" : "primary"} disabled={pending} onClick={() => void apply(confirm)}>{pending ? t("working") : labels[confirm]()}</Action></>} /> : null };
}
