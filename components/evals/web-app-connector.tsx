"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Crosshair, Globe, MousePointer2, Play, Save, X } from "lucide-react";
import type { BrowserLocator } from "@/lib/evals/contracts/browser";
import type { RemoteAction } from "@/lib/evals/contracts/remote-browser";
import { evalRequest } from "./api";
import { Action, Field, SectionHeading, Status, StatusBadge } from "./primitives";

type Part = "launcher" | "input" | "submit" | "response" | "busy";
type Snapshot = { image: string; width: number; height: number; mode: "view" | "control" | "teach"; url: string; tabs: Array<{ index: number; url: string; active: boolean }>; selections: Partial<Record<Part, BrowserLocator>>; test: { status: "idle" | "running" | "ready" | "failed"; error: string | null; response: string } };
const parts: Array<{ id: Part; label: string; hint: string }> = [
  { id: "launcher", label: "Chatbot launcher", hint: "Optional. Select the button that opens the chat." },
  { id: "input", label: "Prompt input", hint: "Select the field where a question is entered." },
  { id: "submit", label: "Send button", hint: "Select Send. It must disable during streaming, or teach a loading indicator below." },
  { id: "response", label: "Assistant response", hint: "Select an assistant message or its response container. Avoid a region that includes your own messages." },
  { id: "busy", label: "Loading indicator", hint: "Optional if Send disables while generating. Select a visible indicator that disappears when the answer is complete." },
];
const testErrors: Record<string, string> = {
  capture_incomplete: "The assistant response did not finish. Teach a loading indicator or a Send button that disables while streaming.",
  recipe_probe_failed: "The connector could not capture distinct complete replies in fresh sessions. Repair the response selector or reset behavior.",
  selector_or_navigation_timeout: "A page or element timed out. Sign in again or repair the selected elements.",
};

export function WebAppConnector({ orgId, targetId, onChanged }: { orgId: string; targetId: string; onChanged?: () => void }) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [part, setPart] = useState<Part>("input");
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState(false);
  const frameRef = useRef<HTMLDivElement>(null);
  const active = useRef<string | null>(null);
  const queue = useRef(Promise.resolve());
  const typed = useRef("");
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const committed = useRef(false);
  const pointerAt = useRef(0);
  const command = useCallback(<T,>(value: RemoteAction) => evalRequest<T>(`/targets/${targetId}/web-app`, "POST", { orgId, command: value }), [orgId, targetId]);
  const fail = (reason: unknown) => setError(reason instanceof Error ? reason.message : "The remote browser is unavailable. Reopen Teach Mode to try again.");
  function send(value: RemoteAction) {
    queue.current = queue.current.then(async () => { if (active.current !== ("sessionId" in value ? value.sessionId : null)) return; await command(value); }).catch(fail);
  }
  function flushTyping() {
    if (typingTimer.current) clearTimeout(typingTimer.current);
    if (typed.current && active.current) { send({ action: "text", sessionId: active.current, text: typed.current }); typed.current = ""; }
  }
  async function run(value: RemoteAction) {
    setError(""); setPending(true);
    try { flushTyping(); await queue.current; await command(value); }
    catch (reason) { fail(reason); }
    finally { setPending(false); }
  }
  async function open() {
    setError(""); setNotice(""); setPending(true);
    try {
      const result = await command<{ sessionId: string; sessionExpired: boolean }>({ action: "open" });
      active.current = result.sessionId; committed.current = false; setSessionId(result.sessionId);
      if (result.sessionExpired) setNotice("The saved login has expired. Use Take control to sign in again.");
    } catch (reason) { fail(reason); }
    finally { setPending(false); }
  }
  async function close() {
    if (!sessionId) return;
    const id = sessionId; active.current = null; typed.current = ""; setSessionId(null); setSnapshot(null);
    try { await command({ action: "close", sessionId: id }); } catch (reason) { fail(reason); }
  }
  useEffect(() => {
    if (!sessionId) return;
    let stopped = false, timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        await queue.current;
        if (stopped || document.visibilityState === "hidden") return;
        const value = await command<Snapshot>({ action: "snapshot", sessionId });
        if (stopped) return;
        setSnapshot(value);
        if (value.test.status === "ready" && !committed.current) {
          committed.current = true;
          try { await command({ action: "result", sessionId }); setNotice("Connection ready. Complete replies and fresh-session reset verified. Your login is saved securely for up to seven days."); onChanged?.(); }
          catch (reason) { committed.current = false; throw reason; }
        }
      } catch (reason) { if (!stopped) fail(reason); }
      finally { if (!stopped) timer = setTimeout(() => void poll(), 1000); }
    };
    void poll();
    return () => { stopped = true; clearTimeout(timer); };
  }, [command, sessionId, onChanged]);
  useEffect(() => () => {
    if (typingTimer.current) clearTimeout(typingTimer.current);
    if (active.current) void fetch(`/api/evals/v1/targets/${targetId}/web-app`, { method: "POST", credentials: "same-origin", keepalive: true, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orgId, command: { action: "close", sessionId: active.current } }) });
  }, [orgId, targetId]);
  const mode = snapshot?.mode ?? "view";
  const testing = snapshot?.test.status === "running";
  const ready = !!snapshot?.selections.input && !!snapshot?.selections.response && (!!snapshot?.selections.submit || !!snapshot?.selections.busy);
  const markChanged = () => { committed.current = false; setNotice(""); };
  function pointer(event: React.PointerEvent<HTMLDivElement>, phase: "move" | "down" | "up") {
    if (!sessionId || !snapshot || mode !== "control" || testing) return;
    if (phase === "move" && Date.now() - pointerAt.current < 80) return;
    pointerAt.current = Date.now();
    if (phase === "down") { event.currentTarget.setPointerCapture(event.pointerId); event.currentTarget.focus(); flushTyping(); markChanged(); }
    if (phase === "up") event.currentTarget.releasePointerCapture(event.pointerId);
    const box = event.currentTarget.getBoundingClientRect();
    send({ action: "pointer", sessionId, phase, x: Math.max(0, Math.min(1279, (event.clientX - box.left) / box.width * snapshot.width)), y: Math.max(0, Math.min(799, (event.clientY - box.top) / box.height * snapshot.height)) });
  }
  return <section className="p-web-connector" aria-label="Web App Connector">
    <SectionHeading title="Web App Connector">Sign in to your app, teach Caudals where to interact, then test the connection.</SectionHeading>
    {error && <Status error>{error}</Status>}
    {notice && <Status>{notice}</Status>}
    {!sessionId ? <div className="p-row"><Action variant="secondary" onClick={() => void open()} disabled={pending}><Globe aria-hidden="true" />{pending ? "Opening remote browser…" : "Open Teach Mode / repair connector"}</Action></div> : <>
      <div className="p-row">
        <Action variant={mode === "control" ? "primary" : "secondary"} disabled={pending || testing} onClick={() => void run({ action: "mode", sessionId, mode: "control" })}><MousePointer2 aria-hidden="true" />Take control</Action>
        <Action variant={mode === "teach" ? "primary" : "secondary"} disabled={pending || testing} onClick={() => void run({ action: "mode", sessionId, mode: "teach" })}><Crosshair aria-hidden="true" />Teach Caudals</Action>
        <Action variant="ghost" disabled={pending} onClick={() => void close()}><X aria-hidden="true" />Close browser</Action>
      </div>
      <p className="p-field-hint">{mode === "control" ? "Click the browser to focus it, then type or paste to sign in. Complete SSO, 2FA and CAPTCHA directly. Use the tabs below for popups." : mode === "teach" ? parts.find(item => item.id === part)?.hint : "The browser is view-only. Choose Take control to sign in or navigate."} Sessions close after 30 minutes.</p>
      <form className="p-web-address" onSubmit={event => { event.preventDefault(); markChanged(); void run({ action: "navigate", sessionId, url }); }}>
        <Field id={`remote-address-${targetId}`} label="Remote browser address" type="url" value={url} placeholder={snapshot?.url ?? "https://…"} onChange={event => setUrl(event.target.value)} disabled={mode !== "control" || testing} />
        <Action type="submit" variant="secondary" disabled={mode !== "control" || !url || pending || testing}>Go</Action>
      </form>
      {snapshot && snapshot.tabs.length > 1 && <div className="p-row" aria-label="Remote browser tabs">{snapshot.tabs.map(tab => <Action key={tab.index} size="sm" variant={tab.active ? "primary" : "secondary"} disabled={mode !== "control" || testing} onClick={() => void run({ action: "tab", sessionId, index: tab.index })}>Tab {tab.index + 1}: {tab.url.slice(0, 55)}</Action>)}</div>}
      {mode === "teach" && <div className="p-web-teach" aria-label="Elements to teach">{parts.map(item => <div key={item.id}>
        <Action size="sm" variant={part === item.id ? "primary" : "secondary"} onClick={() => setPart(item.id)} aria-pressed={part === item.id}>{item.label}{snapshot?.selections[item.id] ? " ✓" : ""}</Action>
        {snapshot?.selections[item.id] && <><span className="p-cell-meta">{snapshot.selections[item.id]?.kind} · {snapshot.selections[item.id]?.frames?.length ?? 0} frames</span><Action size="sm" variant="ghost" onClick={() => { markChanged(); void run({ action: "clear", sessionId, part: item.id }); }} aria-label={`Clear ${item.label}`}><X aria-hidden="true" /></Action></>}
      </div>)}</div>}
      <div className={`p-web-browser p-web-browser-${mode}`} ref={frameRef} role="application" tabIndex={0} aria-label="Live remote browser. In Take control mode, click to focus and type to interact."
        onPointerDown={event => pointer(event, "down")}
        onPointerMove={event => pointer(event, "move")}
        onPointerUp={event => pointer(event, "up")}
        onPointerCancel={event => pointer(event, "up")}
        onClick={event => {
          if (!snapshot || mode !== "teach" || testing) return;
          frameRef.current?.focus(); flushTyping(); markChanged();
          const box = event.currentTarget.getBoundingClientRect();
          send({ action: "click", sessionId, button: "left", x: Math.min(1279, (event.clientX - box.left) / box.width * snapshot.width), y: Math.min(799, (event.clientY - box.top) / box.height * snapshot.height), ...(mode === "teach" ? { part } : {}) });
        }}
        onKeyDown={event => {
          if (mode !== "control" || testing || event.nativeEvent.isComposing) return;
          if (event.key.toLowerCase() === "v" && (event.ctrlKey || event.metaKey)) return;
          event.preventDefault(); markChanged();
          if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
            typed.current += event.key; if (typingTimer.current) clearTimeout(typingTimer.current); typingTimer.current = setTimeout(flushTyping, 120);
          } else if (!['Shift','Control','Meta','Alt'].includes(event.key) && !(event.key.toLowerCase() === 'v' && (event.ctrlKey || event.metaKey))) {
            flushTyping(); send({ action: "key", sessionId, key: `${event.ctrlKey || event.metaKey ? "Control+" : ""}${event.altKey ? "Alt+" : ""}${event.shiftKey ? "Shift+" : ""}${event.key === " " ? "Space" : event.key}` });
          }
        }}
        onPaste={event => { if (mode === "control" && !testing) { event.preventDefault(); flushTyping(); markChanged(); send({ action: "text", sessionId, text: event.clipboardData.getData("text").slice(0, 4000) }); } }}
        onCompositionEnd={event => { if (mode === "control" && !testing && event.data) send({ action: "text", sessionId, text: event.data }); }}
        onWheel={event => { if (mode === "control" && !testing) { flushTyping(); send({ action: "scroll", sessionId, dx: Math.max(-2000, Math.min(2000, event.deltaX)), dy: Math.max(-2000, Math.min(2000, event.deltaY)) }); } }}>
        {/* Live, private pixel frames are transient data URIs; Next image optimization must not cache them. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {snapshot ? <img src={`data:image/jpeg;base64,${snapshot.image}`} alt="Live isolated Chromium session" draggable={false} /> : <p>Connecting to the remote browser…</p>}
      </div>
      <div className="p-row">
        <Action variant="secondary" disabled={!ready || pending || testing} onClick={async () => { setPending(true); setError(""); try { await command({ action: "save", sessionId }); setNotice("Connector saved. Test Connection verifies it before evaluation runs."); onChanged?.(); } catch(reason) { fail(reason); } finally { setPending(false); } }}><Save aria-hidden="true" />Save connector</Action>
        <Action disabled={!ready || pending || testing} onClick={() => { committed.current = false; void run({ action: "test", sessionId }); }}><Play aria-hidden="true" />{testing ? "Testing connection…" : "Test Connection"}</Action>
        {snapshot?.test.status !== "idle" && snapshot?.test.status && <StatusBadge value={snapshot.test.status === "running" ? "checking_connection" : snapshot.test.status} />}
      </div>
      {testing && <Status>Loading fresh sessions, sending test prompts and waiting for complete responses. This can take a few minutes.</Status>}
      {snapshot?.test.status === "failed" && <Status error>{testErrors[snapshot.test.error ?? ""] ?? "The UI or login changed. Use Take control to sign in, then reopen Teach Caudals to repair the connector."}</Status>}
      {snapshot?.test.response && <details className="p-web-response"><summary>Captured assistant response</summary><p>{snapshot.test.response}</p></details>}
    </>}
  </section>;
}
