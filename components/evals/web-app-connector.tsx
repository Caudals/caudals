"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { ArrowLeft, ArrowRight, Globe, RotateCw, Sparkles, Square, Wrench } from "lucide-react";
import type { RemoteAction, RemoteInputEvent, RemoteState, RemoteStreamMessage, TeachPart } from "@/lib/evals/contracts/remote-browser";
import { t, type MessageKey } from "@/lib/evals/messages/en";
import { evalRequest } from "./api";
import { Action, Badge, Loading, SectionHeading, Status, Steps } from "./primitives";
import { Workspace } from "./overlays";

/** The remote viewport. Pixels and pointer coordinates share this frame. */
const VIEW = { width: 1280, height: 800 };
const PARTS: Array<{ id: TeachPart; label: MessageKey }> = [
  { id: "launcher", label: "webAppPartLauncher" },
  { id: "input", label: "webAppPartInput" },
  { id: "submit", label: "webAppPartSubmit" },
  { id: "response", label: "webAppPartResponse" },
  { id: "busy", label: "webAppPartBusy" },
];
const ERRORS: Record<string, MessageKey> = {
  chat_input_not_found: "webAppErrInput",
  chat_launcher_not_found: "webAppErrLauncher",
  launcher_unavailable: "webAppErrLauncher",
  conversation_reset_unverified: "webAppErrReset",
  response_not_identified: "webAppErrResponse",
  submit_unverified: "webAppErrSubmit",
  login_required: "webAppErrLogin",
  browser_session_unavailable: "webAppErrLogin",
  capture_incomplete: "webAppErrIncomplete",
  website_usage_limit: "webAppErrUsageLimit",
  recipe_probe_failed: "webAppErrProbe",
  selector_unavailable: "webAppErrChanged",
  selector_ambiguous: "webAppErrChanged",
  selector_or_navigation_timeout: "webAppErrChanged",
  website_frame_unavailable: "webAppErrChanged",
  teach_incomplete: "webAppErrResponse",
  website_recipe_origin_mismatch: "webAppErrOrigin",
  destination_denied: "webAppErrDestination",
  destination_invalid: "webAppErrDestination",
  target_execution_aborted: "webAppErrStopped",
};
const REPAIRS: Record<string, MessageKey> = {
  browser_session_unavailable: "webAppRepairLogin",
  login_required: "webAppRepairLogin",
  website_selector_failed: "webAppRepairChanged",
  selector_unavailable: "webAppRepairChanged",
  launcher_unavailable: "webAppRepairChanged",
  capture_incomplete: "webAppRepairIncomplete",
  website_usage_limit: "webAppErrUsageLimit",
};
const errorText = (code: string | null | undefined) => t(ERRORS[code ?? ""] ?? "webAppErrGeneric");
const ENDED = new Set(["lifetime", "idle", "abandoned", "closed", "shutdown", "browser_session_expired", "browser_control_denied"]);

export function WebAppConnector({ orgId, targetId, status, errorCode, paused = false, onChanged }: {
  orgId: string; targetId: string; status?: string | null; errorCode?: string | null; paused?: boolean; onChanged?: () => void;
}) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [opening, setOpening] = useState(false);
  const active = useRef<string | null>(null);
  const command = useCallback(<T,>(value: RemoteAction) => evalRequest<T>(`/targets/${targetId}/web-app`, "POST", { orgId, command: value }), [orgId, targetId]);

  async function open() {
    setError(""); setNotice(""); setOpening(true);
    try {
      const result = await command<{ sessionId: string; sessionExpired: boolean }>({ action: "open" });
      active.current = result.sessionId; setSessionId(result.sessionId);
      if (result.sessionExpired) setNotice(t("webAppSessionExpired"));
    } catch (reason) { setError(reason instanceof Error ? reason.message : t("webAppErrGeneric")); }
    finally { setOpening(false); }
  }
  const close = useCallback((reason?: string) => {
    const id = active.current;
    active.current = null; setSessionId(null);
    if (reason) setNotice(t("webAppSessionEnded"));
    if (id && !reason) void command({ action: "close", sessionId: id }).catch(() => {});
  }, [command]);
  // Leaving the page releases the remote browser for the next person.
  useEffect(() => () => {
    if (active.current) void fetch(`/api/evals/v1/targets/${targetId}/web-app`, { method: "POST", credentials: "same-origin", keepalive: true, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orgId, command: { action: "close", sessionId: active.current } }) });
  }, [orgId, targetId]);

  const repair = status === "needs_operator" || paused;
  const summary = status === "ready" && !paused ? t("webAppReadySummary") : repair ? t(REPAIRS[errorCode ?? ""] ?? "webAppRepairSummary") : t("webAppDraftSummary");
  return <section className="p-web-connector" aria-label={t("webAppTitle")}>
    <SectionHeading title={t("webAppTitle")}>{t("webAppIntro")}</SectionHeading>
    {paused && <Status tone="warn">{t("webAppRepairPaused")}</Status>}
    {!paused && <Status tone={status === "ready" ? "success" : repair ? "warn" : undefined}>{summary}</Status>}
    {error && <Status error>{error}</Status>}
    {notice && <Status>{notice}</Status>}
    <div className="p-row">
      <Action variant={status === "ready" && !paused ? "secondary" : "primary"} onClick={() => void open()} disabled={opening || !!sessionId}>
        {repair ? <Wrench aria-hidden="true" /> : <Globe aria-hidden="true" />}
        {opening ? t("webAppOpening") : repair ? t("webAppRepair") : t("webAppOpen")}
      </Action>
    </div>
    {sessionId && <WebAppStudio key={sessionId} orgId={orgId} targetId={targetId} sessionId={sessionId} command={command} onClose={close}
      onReady={() => { setNotice(t("webAppConnected")); onChanged?.(); }} onSaved={() => onChanged?.()} />}
  </section>;
}

type Command = <T>(value: RemoteAction) => Promise<T>;

function WebAppStudio({ orgId, targetId, sessionId, command, onClose, onReady, onSaved }: {
  orgId: string; targetId: string; sessionId: string; command: Command; onClose: (reason?: string) => void; onReady: () => void; onSaved: () => void;
}) {
  const [state, setState] = useState<RemoteState | null>(null);
  const [error, setError] = useState("");
  const [address, setAddress] = useState("");
  const [connected, setConnected] = useState(false);
  const [hasFrame, setHasFrame] = useState(false);
  const [saved, setSaved] = useState(false);
  const [repairing, setRepairing] = useState(false);
  const [box, setBox] = useState({ width: 0, height: 0 });
  const canvas = useRef<HTMLCanvasElement>(null);
  const surface = useRef<HTMLDivElement>(null);
  const keys = useRef<HTMLTextAreaElement>(null);
  const queue = useRef<RemoteInputEvent[]>([]);
  const sending = useRef(false);
  const pendingFrame = useRef<string | null>(null);
  const decoding = useRef(false);
  const lastDown = useRef({ at: 0, x: 0, y: 0, count: 1 });
  const previous = useRef<{ teach?: string; test?: string }>({});
  const committed = useRef(false);

  const fail = useCallback((reason: unknown) => setError(reason instanceof Error ? reason.message : t("webAppErrGeneric")), []);
  const run = useCallback(async (value: RemoteAction) => {
    setError("");
    try { return await command(value); } catch (reason) { fail(reason); return null; }
  }, [command, fail]);

  // ---- pixels: decode off the main thread, always draw the newest frame.
  const draw = useCallback((image: string) => {
    pendingFrame.current = image;
    if (decoding.current) return;
    decoding.current = true;
    void (async () => {
      try {
        while (pendingFrame.current) {
          const data = pendingFrame.current; pendingFrame.current = null;
          const bytes = Uint8Array.from(atob(data), char => char.charCodeAt(0));
          const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/jpeg" }));
          const element = canvas.current;
          if (element) {
            if (element.width !== bitmap.width || element.height !== bitmap.height) { element.width = bitmap.width; element.height = bitmap.height; }
            element.getContext("2d")?.drawImage(bitmap, 0, 0);
            setHasFrame(true);
          }
          bitmap.close();
        }
      } catch { /* a corrupt frame is replaced by the next one */ }
      finally { decoding.current = false; }
    })();
  }, []);

  // ---- live stream: frames and state over SSE. EventSource retries a
  // dropped stream itself; a refused one is reopened here with backoff.
  useEffect(() => {
    let source: EventSource | null = null, retry: ReturnType<typeof setTimeout> | null = null, stopped = false, failures = 0;
    const connect = () => {
      source = new EventSource(`/api/evals/v1/targets/${targetId}/web-app/stream?orgId=${encodeURIComponent(orgId)}&sessionId=${encodeURIComponent(sessionId)}`);
      source.onopen = () => { failures = 0; setConnected(true); };
      source.onmessage = event => {
        const message = JSON.parse(event.data) as RemoteStreamMessage;
        if (message.type === "frame") draw(message.image);
        else if (message.type === "state") setState(message.state);
        else if (message.type === "closed") {
          source?.close();
          if (ENDED.has(message.reason)) { stopped = true; onClose(message.reason); }
          else { setConnected(false); retry = setTimeout(connect, 1_500); }
        }
      };
      source.onerror = () => {
        setConnected(false);
        if (source?.readyState !== EventSource.CLOSED || stopped) return;
        failures++;
        // A session that no longer exists ends the stream for good.
        void command({ action: "snapshot", sessionId }).then(
          () => { if (!stopped) retry = setTimeout(connect, Math.min(10_000, 1_000 * failures)); },
          () => { if (!stopped) { stopped = true; onClose("browser_session_expired"); } });
      };
    };
    connect();
    return () => { stopped = true; if (retry) clearTimeout(retry); source?.close(); };
  }, [command, draw, onClose, orgId, sessionId, targetId]);

  // ---- commit a verified connection once; keep a failed attempt's login.
  useEffect(() => {
    if (!state) return;
    const before = previous.current;
    previous.current = { teach: state.teach.status, test: state.test.status };
    if (state.test.status === "ready" && !committed.current) {
      committed.current = true;
      void command({ action: "result", sessionId }).then(() => { setSaved(true); setRepairing(false); onReady(); }, fail);
    }
    if (state.test.status === "running") { committed.current = false; if (saved) setSaved(false); }
    const failedNow = (before.test !== "failed" && state.test.status === "failed") || (before.teach !== "failed" && state.teach.status === "failed");
    if (failedNow) {
      setRepairing(true);
      void command({ action: state.parts.input && state.parts.response ? "save" : "checkpoint", sessionId }).then(onSaved, fail);
    }
  }, [command, fail, onReady, onSaved, saved, sessionId, state]);

  // The dialog portal mounts after the first commit, so observe through a callback ref.
  const [surfaceElement, setSurfaceElement] = useState<HTMLDivElement | null>(null);
  const attachSurface = useCallback((element: HTMLDivElement | null) => { surface.current = element; setSurfaceElement(element); }, []);
  useEffect(() => {
    if (!surfaceElement) return;
    const observer = new ResizeObserver(([entry]) => setBox({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(surfaceElement);
    return () => observer.disconnect();
  }, [surfaceElement]);

  // ---- input: one request in flight; moves and typing coalesce meanwhile.
  const pump = useCallback(async () => {
    if (sending.current) return;
    sending.current = true;
    try {
      while (queue.current.length) {
        const events = queue.current.splice(0, 80);
        await command({ action: "input", sessionId, events });
      }
    } catch (reason) { queue.current = []; fail(reason); }
    finally { sending.current = false; }
  }, [command, fail, sessionId]);
  const push = useCallback((event: RemoteInputEvent) => {
    const list = queue.current, last = list.at(-1);
    if (event.t === "move" && last?.t === "move") list[list.length - 1] = event;
    else if (event.t === "type" && last?.t === "type" && last.text.length + event.text.length <= 200) list[list.length - 1] = { t: "type", text: last.text + event.text };
    else list.push(event);
    void pump();
  }, [pump]);

  const working = state?.teach.status === "running" || state?.test.status === "running";
  const picking = state?.mode === "teach" ? state.pickPart : null;
  const interactive = !!state && !working;
  const point = (event: { clientX: number; clientY: number }) => {
    const rect = surface.current!.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(VIEW.width - 1, (event.clientX - rect.left) / rect.width * VIEW.width)),
      y: Math.max(0, Math.min(VIEW.height - 1, (event.clientY - rect.top) / rect.height * VIEW.height)),
    };
  };
  const button = (value: number) => value === 2 ? "right" as const : value === 1 ? "middle" as const : "left" as const;
  function pointer(event: ReactPointerEvent<HTMLDivElement>, phase: "down" | "move" | "up") {
    if (!interactive) return;
    const { x, y } = point(event);
    if (picking) {
      if (phase === "down") { event.preventDefault(); void run({ action: "click", sessionId, x, y, button: "left", part: picking }); }
      return;
    }
    if (phase === "down") {
      event.preventDefault();
      keys.current?.focus({ preventScroll: true });
      event.currentTarget.setPointerCapture(event.pointerId);
      const last = lastDown.current, now = Date.now();
      const count = now - last.at < 450 && Math.hypot(x - last.x, y - last.y) < 6 ? Math.min(3, last.count + 1) : 1;
      lastDown.current = { at: now, x, y, count };
      push({ t: "down", x, y, button: button(event.button), count });
    } else if (phase === "up") {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      push({ t: "up", x, y, button: button(event.button), count: lastDown.current.count });
    } else push({ t: "move", x, y });
  }
  useEffect(() => {
    const element = surface.current;
    if (!element) return;
    const wheel = (event: WheelEvent) => {
      if (!interactive || picking) return;
      event.preventDefault();
      const scale = event.deltaMode === 1 ? 40 : event.deltaMode === 2 ? 800 : 1;
      const { x, y } = point(event);
      push({ t: "wheel", x, y, dx: Math.max(-3000, Math.min(3000, event.deltaX * scale)), dy: Math.max(-3000, Math.min(3000, event.deltaY * scale)) });
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
  });
  function keyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if (!interactive || picking || event.nativeEvent.isComposing) return;
    const command = event.ctrlKey || event.metaKey;
    // Paste arrives as a paste event with the clipboard text.
    if (command && event.key.toLowerCase() === "v") return;
    if (["Shift", "Control", "Meta", "Alt", "CapsLock", "Unidentified", "Process", "Dead"].includes(event.key)) return;
    event.preventDefault();
    if (event.key.length === 1 && !command && !event.altKey) { push({ t: "type", text: event.key }); return; }
    const name = event.key === " " ? "Space" : event.key.length === 1 ? event.key.toLowerCase() : event.key;
    if (!/^([a-zA-Z0-9]|Enter|Tab|Backspace|Delete|Escape|ArrowUp|ArrowDown|ArrowLeft|ArrowRight|Home|End|PageUp|PageDown|Space)$/.test(name)) return;
    push({ t: "key", key: `${command ? "Control+" : ""}${event.altKey ? "Alt+" : ""}${event.shiftKey && name.length > 1 ? "Shift+" : ""}${name}` });
  }

  const scale = box.width / VIEW.width;
  const parts = state?.parts ?? {};
  const teachStep = state?.teach.step;
  const stepIndex = state?.test.status === "running" ? 4 : teachStep === "verify_fresh" ? 3 : teachStep === "read_reply" ? 2 : teachStep === "send_probe" ? 1 : 0;
  const steps = [teachStep === "open_chat" ? t("webAppStepOpen") : t("webAppStepFind"), t("webAppStepSend"), t("webAppStepRead"), t("webAppStepFresh"), t("webAppStepTest")]
    .map((label, index) => ({ label, state: index < stepIndex ? "done" as const : index === stepIndex ? "current" as const : "upcoming" as const }));
  const failure = state?.test.status === "failed" ? state.test.error : state?.teach.status === "failed" ? state.teach.error : null;
  const ready = state?.test.status === "ready" && saved;
  const verified = state?.test.status === "ready";
  // A manual selection invalidates the old test. Keep the other Fix actions
  // and Test again visible until the repaired connection has been saved.
  const needsRepair = (repairing || !!failure) && !working && !ready;
  const completion = state?.completion === "selector_hidden" ? t("webAppCompletionHidden") : state?.completion === "send_enabled" ? t("webAppCompletionSend") : state?.completion === "quiescent" ? t("webAppCompletionQuiet") : null;
  const reply = state?.test.response || state?.teach.reply;
  const taught = !!(parts.input && parts.response);

  return <Workspace open onOpenChange={value => { if (!value) onClose(); }} title={t("webAppTitle")} description={t("webAppStudioHelp")}
    onEscapeKeyDown={event => { if (document.activeElement === keys.current) event.preventDefault(); }}
    actions={<Action variant="secondary" size="sm" onClick={() => onClose()}>{t("webAppClose")}</Action>}>
    <div className="p-web-studio">
      <div className="p-web-stage">
        <form className="p-web-toolbar" onSubmit={event => { event.preventDefault(); const value = address.trim(); if (value) void run({ action: "navigate", sessionId, url: /^https?:\/\//i.test(value) ? value : `https://${value}` }); }}>
          <Action variant="ghost" shape="icon" size="sm" aria-label={t("webAppBack")} disabled={!interactive} onClick={() => void run({ action: "history", sessionId, direction: "back" })}><ArrowLeft aria-hidden="true" /></Action>
          <Action variant="ghost" shape="icon" size="sm" aria-label={t("webAppForward")} disabled={!interactive} onClick={() => void run({ action: "history", sessionId, direction: "forward" })}><ArrowRight aria-hidden="true" /></Action>
          <Action variant="ghost" shape="icon" size="sm" aria-label={t("webAppReload")} disabled={!interactive} onClick={() => void run({ action: "history", sessionId, direction: "reload" })}><RotateCw aria-hidden="true" /></Action>
          <label className="sr-only" htmlFor={`web-address-${sessionId}`}>{t("webAppAddress")}</label>
          <input id={`web-address-${sessionId}`} className="p-web-address" type="text" inputMode="url" autoComplete="off" spellCheck={false} value={address} placeholder={state?.url ?? "https://"} disabled={!interactive}
            onChange={event => setAddress(event.target.value)} onFocus={event => { if (!address && state?.url) { setAddress(state.url); requestAnimationFrame(() => event.target.select()); } }} />
          {state && state.tabs.length > 1 && <select className="p-web-tabs" aria-label={t("webAppTabs")} value={state.tabs.find(tab => tab.active)?.index ?? 0} disabled={!interactive}
            onChange={event => void run({ action: "tab", sessionId, index: Number(event.target.value) })}>
            {state.tabs.map(tab => <option key={tab.index} value={tab.index}>{tab.index + 1}. {tab.url.replace(/^https?:\/\//, "").slice(0, 60)}</option>)}
          </select>}
          {(state?.loading || !connected) && <span className="p-web-toolbar-status" role="status"><span className="p-spinner" aria-hidden="true" />{connected ? t("webAppLoadingPage") : t("webAppReconnecting")}</span>}
        </form>
        <div ref={attachSurface} className="p-web-viewport" data-mode={picking ? "pick" : working ? "busy" : "control"} role="application" aria-label={t("webAppLiveBrowser")}
          onPointerDown={event => pointer(event, "down")} onPointerMove={event => pointer(event, "move")} onPointerUp={event => pointer(event, "up")} onPointerCancel={event => pointer(event, "up")}
          onContextMenu={event => event.preventDefault()}>
          <canvas ref={canvas} width={VIEW.width} height={VIEW.height} aria-hidden="true" />
          {!hasFrame && <div className="p-web-placeholder"><Loading>{t("webAppOpening")}</Loading></div>}
          {scale > 0 && PARTS.map(part => {
            const rect = parts[part.id]?.rect;
            if (!rect) return null;
            // Labels sit above the mark, flipped inward near the right or top edge.
            const edge = [rect.x * scale + 130 > box.width ? "end" : "", rect.y * scale < 24 ? "below" : ""].filter(Boolean).join(" ") || undefined;
            return <div key={part.id} className="p-web-mark" data-part={part.id} data-edge={edge} style={{ left: rect.x * scale, top: rect.y * scale, width: Math.max(8, rect.width * scale), height: Math.max(8, rect.height * scale) }}>
              <span>{t(part.label)}</span>
            </div>;
          })}
          {working && <div className="p-web-veil"><span className="p-spinner" aria-hidden="true" />{t("webAppWorking")}</div>}
          <textarea ref={keys} className="p-web-keys" aria-label={t("webAppLiveBrowser")} autoCapitalize="off" autoComplete="off" autoCorrect="off" spellCheck={false} tabIndex={-1}
            onKeyDown={keyDown}
            onPaste={event => { if (!interactive || picking) return; event.preventDefault(); const text = event.clipboardData.getData("text").slice(0, 4000); if (text) push({ t: "text", text }); }}
            onCompositionEnd={event => { if (interactive && !picking && event.data) push({ t: "type", text: event.data.slice(0, 200) }); event.currentTarget.value = ""; }}
            onInput={event => { const element = event.currentTarget; if ((event.nativeEvent as InputEvent).isComposing) return; if (element.value && interactive && !picking) push({ t: "type", text: element.value.slice(0, 200) }); element.value = ""; }} />
        </div>
        {picking && <Status action={<Action size="sm" variant="ghost" onClick={() => void run({ action: "mode", sessionId, mode: "control" })}>{t("webAppCancel")}</Action>}>
          {t("webAppPick").replace("{part}", t(PARTS.find(part => part.id === picking)!.label))}
        </Status>}
      </div>

      <aside className="p-web-side" aria-label={t("webAppTeach")}>
        {error && <Status error>{error}</Status>}
        {!working && !verified && <>
          <p className="p-web-side-help">{t("webAppTeachHelp")}</p>
          <Action block onClick={() => void run({ action: "autoteach", sessionId })} disabled={!state}><Sparkles aria-hidden="true" />{taught || failure ? t("webAppTeachAgain") : t("webAppTeach")}</Action>
        </>}
        {working && <>
          <Steps label={t("webAppSteps")} steps={steps} />
          <Action variant="secondary" block onClick={() => void run({ action: "cancel", sessionId })}><Square aria-hidden="true" />{t("webAppStop")}</Action>
        </>}
        {failure && !working && <Status error>{errorText(failure)}</Status>}
        {ready && <>
          <Status tone="success">{t("webAppConnected")}</Status>
          <div className="p-row">
            <Action onClick={() => onClose()}>{t("webAppDone")}</Action>
            <Action variant="secondary" onClick={() => void run({ action: "test", sessionId })}>{t("webAppTestAgain")}</Action>
          </div>
        </>}
        {verified && !saved && <Status>{error ? t("webAppSaveFailed") : t("webAppSaving")}</Status>}
        {verified && !saved && error && <Action onClick={() => {
          setError("");
          void command({ action: "result", sessionId }).then(() => { setSaved(true); setRepairing(false); onReady(); }, fail);
        }}>{t("webAppSaveConnection")}</Action>}

        {needsRepair && <div className="p-web-parts">
          <h3>{t("webAppParts")}</h3>
          <ul>
            {PARTS.filter(part => part.id !== "busy" || parts.busy || failure === "capture_incomplete").map(part => {
              const found = parts[part.id];
              const fallback = part.id === "launcher" ? t("webAppPartNotNeeded") : part.id === "submit" && parts.input ? t("webAppPartEnter") : part.id === "busy" ? t("webAppPartNotNeeded") : t("webAppPartMissing");
              return <li key={part.id} data-part={part.id}>
                <span className="p-web-swatch" aria-hidden="true" />
                <span className="p-web-part-name">{t(part.label)}</span>
                {found ? <Badge tone="pass" dot>{t("webAppPartFound")}{found.frames ? ` · iframe` : ""}</Badge> : <span className="p-cell-meta">{fallback}</span>}
                <Action size="sm" variant="ghost" disabled={!interactive} aria-pressed={picking === part.id}
                  onClick={() => void run({ action: "mode", sessionId, mode: "teach", part: part.id })}>{t("webAppFix")}</Action>
              </li>;
            })}
          </ul>
          {completion && <p className="p-cell-meta">{t("webAppFinishedWhen")} {completion}.</p>}
          {taught && !working && !ready && <Action variant="secondary" size="sm" onClick={() => void run({ action: "test", sessionId })}>{t("webAppTestAgain")}</Action>}
        </div>}

        {reply && <details className="p-web-response" open={ready}>
          <summary>{t("webAppCaptured")}</summary>
          <p>{reply}</p>
        </details>}
      </aside>
    </div>
  </Workspace>;
}
