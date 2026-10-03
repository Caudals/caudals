import { randomUUID } from "node:crypto";
import type { Browser, BrowserContext, CDPSession, Page } from "playwright";
import { browserProbeEvidenceSchema, probeEvidenceReady, scopedBrowserStorageState, websiteRecipeSchema, type BrowserLocator, type BrowserProbeEvidence, type BrowserStorageState, type WebsiteRecipe } from "../../lib/evals/contracts/browser";
import type { RemoteAction, RemoteInputEvent, RemoteRect, RemoteState, RemoteStreamMessage, TeachPart } from "../../lib/evals/contracts/remote-browser";
import { withContentHash } from "../../lib/evals/contracts/hashing";
import { browserLocator, guardBrowserContext, loginRequired, restoreBrowserSessionStorage, validateWebsiteRecipe } from "../../lib/evals/connectors/browser-executor";
import { detectChatControls, detectLauncherFor, probeChatReply, type DetectStep } from "../../lib/evals/connectors/browser-autodetect";
import { selectAt } from "./teach";
import { cleanWebsiteNavigation, websiteAppNavigation } from "../../lib/evals/contracts/website-navigation";

export type ControlScope = { orgId: string; actorId: string; targetId: string; endpoint: string };
type Work = { status: "idle" | "running" | "ready" | "failed"; error: string | null; step: string | null };
type Listener = (message: { type: "frame-ready" } | { type: "state-changed" } | { type: "closed"; reason: string }) => void;
type Session = ControlScope & {
  id: string; context: BrowserContext; page: Page; mode: "view" | "control" | "teach"; pickPart: TeachPart | null;
  selections: Partial<Record<TeachPart, BrowserLocator>>; alternates: Partial<Record<TeachPart, BrowserLocator[]>>;
  completion: WebsiteRecipe["completion"] | null;
  startUrl?: string;
  created: number; touched: number; chain: Promise<unknown>;
  teach: Work & { reply: string }; test: Work & { response: string };
  work?: AbortController; evidence?: BrowserProbeEvidence; recipe?: WebsiteRecipe; state?: BrowserStorageState;
  frame: { image: string; seq: number; width: number; height: number } | null;
  cdp?: CDPSession; castPage?: Page; listeners: Set<Listener>; lastStreamAt: number; streamed: boolean;
  rects: Partial<Record<TeachPart, RemoteRect | null>>; rectsAt: number; loading: boolean;
};

// Long enough to sign in, teach and test without the studio closing underneath the person.
const IDLE_MS = 20 * 60_000, LIFETIME_MS = 120 * 60_000, ABANDONED_MS = 3 * 60_000;
const failureCodes = new Set(["browser_session_expired", "browser_capacity", "browser_busy", "control_required", "teach_required", "selector_ambiguous", "selector_unavailable", "teach_incomplete", "completion_signal_required", "website_frame_unavailable", "recipe_probe_failed", "capture_incomplete", "destination_denied", "destination_invalid", "browser_session_unavailable", "login_required", "website_recipe_origin_mismatch", "chat_input_not_found", "chat_launcher_not_found", "launcher_unavailable", "response_not_identified", "submit_unverified", "target_execution_aborted", "browser_state_too_large", "browser_control_denied"]);
export function browserControlError(error: unknown) {
  if (error instanceof Error && failureCodes.has(error.message)) return error.message;
  if (error instanceof Error && error.name === "TimeoutError") return "selector_or_navigation_timeout";
  if (error instanceof Error && /strict mode violation/.test(error.message)) return "selector_ambiguous";
  return "browser_unavailable";
}
const safeUrl = (url: string) => { try { const value = new URL(url); return value.origin + value.pathname; } catch { return ""; } };
const idle = (): Work => ({ status: "idle", error: null, step: null });

export class BrowserControl {
  private readonly sessions = new Map<string, Session>();
  private opening = false;
  constructor(private readonly options: { browser: Browser; destinationCheck: (url: string) => Promise<void>; maxSessions?: number }) {}
  get active() { return this.sessions.size > 0 || this.opening; }

  async expire() {
    const now = Date.now();
    for (const session of [...this.sessions.values()]) {
      const abandoned = session.streamed && session.listeners.size === 0 && now - session.lastStreamAt > ABANDONED_MS && session.teach.status !== "running" && session.test.status !== "running";
      if (now - session.created > LIFETIME_MS || now - session.touched > IDLE_MS || abandoned) await this.dispose(session, now - session.created > LIFETIME_MS ? "lifetime" : abandoned ? "abandoned" : "idle");
    }
  }
  async close() { for (const session of [...this.sessions.values()]) await this.dispose(session, "shutdown"); }
  private async dispose(session: Session, reason: string) {
    this.sessions.delete(session.id);
    session.work?.abort();
    for (const listener of session.listeners) listener({ type: "closed", reason });
    session.listeners.clear();
    await session.context.close().catch(() => {});
  }

  // ---------------------------------------------------------------- pixels --
  // CDP screencast pushes a frame only when the page repaints, so the live
  // view is smooth without polling screenshots that block input.
  private async cast(session: Session) {
    const page = session.page;
    if (session.castPage === page || page.isClosed()) return;
    const previous = session.cdp;
    session.castPage = page; session.cdp = undefined;
    await previous?.send("Page.stopScreencast").catch(() => {});
    await previous?.detach().catch(() => {});
    const cdp = await session.context.newCDPSession(page);
    if (session.castPage !== page) { await cdp.detach().catch(() => {}); return; }
    session.cdp = cdp;
    cdp.on("Page.screencastFrame", (event: { data: string; sessionId: number; metadata: { deviceWidth?: number; deviceHeight?: number } }) => {
      void cdp.send("Page.screencastFrameAck", { sessionId: event.sessionId }).catch(() => {});
      if (session.castPage !== page) return;
      session.frame = { image: event.data, seq: (session.frame?.seq ?? 0) + 1, width: Math.round(event.metadata.deviceWidth ?? 1280), height: Math.round(event.metadata.deviceHeight ?? 800) };
      for (const listener of session.listeners) listener({ type: "frame-ready" });
    });
    await cdp.send("Page.startScreencast", { format: "jpeg", quality: 70, maxWidth: 1280, maxHeight: 800, everyNthFrame: 1 });
  }
  private watch(session: Session, page: Page) {
    page.setDefaultTimeout(10_000);
    page.on("close", () => {
      if (session.page !== page) return;
      const next = session.context.pages().filter(item => !item.isClosed()).at(-1);
      if (next) { session.page = next; void this.cast(session).catch(() => {}); }
      this.changed(session);
    });
    page.on("load", () => { session.loading = false; this.changed(session); });
    page.on("framenavigated", frame => { if (frame === page.mainFrame()) { session.loading = true; this.changed(session); } });
  }

  // ------------------------------------------------------------ live state --
  private async rects(session: Session) {
    if (Date.now() - session.rectsAt < 600 || session.page.isClosed()) return session.rects;
    session.rectsAt = Date.now();
    const rects: Session["rects"] = {};
    for (const [part, value] of Object.entries(session.selections) as Array<[TeachPart, BrowserLocator]>) {
      let root: Page | ReturnType<Page["frameLocator"]> = session.page;
      for (const frame of value.frames ?? []) root = browserLocator(root, frame).contentFrame();
      const box = await browserLocator(root, value).last().boundingBox({ timeout: 150 }).catch(() => null);
      rects[part] = box ? { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width), height: Math.round(box.height) } : null;
    }
    session.rects = rects;
    return rects;
  }
  async state(session: Session): Promise<RemoteState> {
    const rects = await this.rects(session);
    const title = await session.page.title().catch(() => "");
    return {
      sessionId: session.id, mode: session.mode, pickPart: session.pickPart,
      url: safeUrl(session.page.url()), title: title.slice(0, 200), loading: session.loading,
      tabs: session.context.pages().map((page, index) => ({ index, url: safeUrl(page.url()), active: page === session.page })),
      parts: Object.fromEntries((Object.entries(session.selections) as Array<[TeachPart, BrowserLocator]>).map(([part, value]) => [part, { kind: value.kind, frames: value.frames?.length ?? 0, rect: rects[part] ?? null }])),
      completion: session.completion?.kind ?? (session.selections.busy ? "selector_hidden" : null),
      teach: { status: session.teach.status, error: session.teach.error, step: session.teach.step, reply: session.teach.reply.slice(0, 2_000) },
      test: { status: session.test.status, error: session.test.error, step: session.test.step, response: session.test.response.slice(0, 50_000) },
      expiresAt: new Date(session.created + LIFETIME_MS).toISOString(),
    };
  }
  private changed(session: Session) {
    session.rectsAt = 0;
    for (const listener of session.listeners) listener({ type: "state-changed" });
  }

  /** Streams frames and state to one viewer; returns an unsubscribe function. */
  subscribe(scope: ControlScope, sessionId: string, send: (message: RemoteStreamMessage) => boolean | void) {
    const session = this.owned(scope, sessionId);
    let lastFrame = 0, lastSent = 0, timer: ReturnType<typeof setTimeout> | null = null, stateTimer: ReturnType<typeof setTimeout> | null = null, closed = false;
    const sendFrame = () => {
      timer = null;
      if (closed || !session.frame || session.frame.seq === lastFrame) return;
      lastFrame = session.frame.seq; lastSent = Date.now();
      send({ type: "frame", ...session.frame });
    };
    const pushState = () => {
      stateTimer = null;
      if (closed) return;
      void this.state(session).then(state => { if (!closed) send({ type: "state", state }); }).catch(() => {});
    };
    const listener: Listener = message => {
      if (message.type === "frame-ready") { if (!timer) timer = setTimeout(sendFrame, Math.max(0, 70 - (Date.now() - lastSent))); }
      else if (message.type === "state-changed") { if (!stateTimer) stateTimer = setTimeout(pushState, 50); }
      else send(message);
    };
    session.listeners.add(listener);
    session.streamed = true; session.lastStreamAt = Date.now(); session.touched = Date.now();
    void this.cast(session).catch(() => {});
    pushState(); sendFrame();
    // Rects follow scrolling and the clock keeps an open viewer's session alive.
    const heartbeat = setInterval(() => { session.lastStreamAt = Date.now(); session.touched = Date.now(); session.rectsAt = 0; pushState(); }, 1_500);
    return () => {
      closed = true; clearInterval(heartbeat);
      if (timer) clearTimeout(timer);
      if (stateTimer) clearTimeout(stateTimer);
      session.listeners.delete(listener); session.lastStreamAt = Date.now();
    };
  }

  private owned(scope: ControlScope, sessionId: string) {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error("browser_session_expired");
    if (session.orgId !== scope.orgId || session.actorId !== scope.actorId || session.targetId !== scope.targetId || session.endpoint !== scope.endpoint) throw new Error("browser_control_denied");
    return session;
  }

  // ----------------------------------------------------------- persistence --
  private async captureState(session: Session) {
    if (!websiteAppNavigation(session.endpoint, session.page.url()) || await loginRequired(session.page, session.page.url())) throw new Error("login_required");
    // Only the target and explicitly taught frame origins are persisted. SSO
    // provider cookies are intentionally discarded after they grant app access.
    const allowed = new Set([new URL(session.endpoint).origin, new URL(session.page.url()).origin]);
    for (const selection of Object.values(session.selections)) {
      let frame = session.page.mainFrame();
      for (const step of selection?.frames ?? []) {
        const handle = await browserLocator(frame, step).first().elementHandle({ timeout: 5_000 }).catch(() => null);
        if (!handle) break;
        try { const child = await handle.contentFrame(); if (!child) break; frame = child; }
        finally { await handle.dispose(); }
        try { const url = new URL(frame.url()); if (url.protocol === "https:") allowed.add(url.origin); } catch { /* about:srcdoc frames share the parent origin */ }
      }
    }
    for (const origin of [...allowed]) await this.options.destinationCheck(origin).catch(() => allowed.delete(origin));
    if (!allowed.has(new URL(session.endpoint).origin)) throw new Error("destination_denied");
    const state = await session.context.storageState({ indexedDB: true });
    const sessionStorage: Array<{ origin: string; entries: Array<{ name: string; value: string }> }> = [];
    for (const frame of session.page.frames()) {
      try {
        const origin = new URL(frame.url()).origin;
        if (allowed.has(origin) && !sessionStorage.some(item => item.origin === origin)) sessionStorage.push({ origin, entries: (await frame.evaluate<Array<{ name: string; value: string }>>("Object.keys(sessionStorage).slice(0,200).map(name => ({name,value:String(sessionStorage.getItem(name)).slice(0,50000)}))")) });
      } catch { /* cross-origin navigation in progress */ }
    }
    const origins = state.origins.filter(origin => allowed.has(origin.origin)).map(origin => {
      const stores = (origin as { indexedDB?: unknown[] }).indexedDB;
      return { ...origin, localStorage: origin.localStorage.slice(0, 200), ...(stores ? { indexedDB: stores.slice(0, 20) } : {}) };
    });
    if (JSON.stringify({ cookies: state.cookies, origins, sessionStorage }).length > 2_000_000) throw new Error("browser_state_too_large");
    const hosts = [...allowed].map(origin => new URL(origin).hostname);
    return scopedBrowserStorageState({
      scope_origins: [...allowed], session_storage: sessionStorage,
      cookies: state.cookies.filter(cookie => hosts.some(host => host === cookie.domain.replace(/^\./, "") || (cookie.domain.startsWith(".") && host.endsWith(cookie.domain)))).slice(0, 200),
      origins,
    }, session.endpoint);
  }
  private recipe(session: Session) {
    const { input, submit, response, launcher, busy } = session.selections;
    if (!input || !response) throw new Error("teach_incomplete");
    const url = new URL(session.startUrl ?? session.page.url());
    if (!websiteAppNavigation(session.endpoint, url.toString())) throw new Error("website_recipe_origin_mismatch");
    // A clean page path is required; query values from an auth redirect never
    // enter a recipe. SPAs can retain a non-sensitive navigation fragment.
    url.search = ""; if (!/^#!?\/[A-Za-z0-9/_~.-]{0,200}$/.test(url.hash)) url.hash = "";
    // A manually taught loading indicator wins; otherwise the signal Caudals
    // observed while the probe streamed; otherwise network-confirmed quiet.
    const quiet: WebsiteRecipe["completion"] = { kind: "quiescent", quiet_ms: 1_500 };
    const completion: WebsiteRecipe["completion"] = busy ? { kind: "selector_hidden", locator: busy }
      : session.completion?.kind === "send_enabled" ? (submit ? { kind: "send_enabled", locator: submit } : quiet)
      : session.completion ?? quiet;
    const alternates: Record<string, BrowserLocator[]> = {};
    for (const [part, key] of [["launcher", "launcher"], ["input", "input"], ["submit", "submit"], ["response", "assistant_message"]] as const) {
      const list = session.alternates[part];
      if (list?.length && session.selections[part]) alternates[key] = list.slice(0, 3);
    }
    return websiteRecipeSchema.parse(withContentHash({ schema_version: "1.0", recipe_revision_id: randomUUID(), source: "operator_authored", start_url: url.toString(), launcher: launcher ?? null, frame_chain: [], input,
      submit: submit ? { kind: "click", locator: submit } : { kind: "press_enter" }, message_container: response, assistant_message: response,
      completion, reset: { kind: "new_context" }, assistant_extraction: "last_new_message", created_at: new Date().toISOString(),
      extensions: { "caudals.evals/teach": { version: 2, detected: !!session.completion, ...(Object.keys(alternates).length ? { alternates } : {}) } } }));
  }

  // ------------------------------------------------------- background work --
  private invalidate(session: Session) {
    session.recipe = undefined; session.evidence = undefined;
    if (session.test.status !== "running") session.test = { ...idle(), response: "" };
  }
  private startTest(session: Session) {
    session.recipe ??= this.recipe(session);
    session.test = { status: "running", error: null, step: "fresh_session", response: "" }; session.evidence = undefined;
    const controller = session.work = new AbortController();
    this.changed(session);
    const run = async () => {
      session.state = await this.captureState(session);
      return validateWebsiteRecipe({ browser: this.options.browser, destinationCheck: this.options.destinationCheck, recipe: session.recipe!, storageState: session.state, timeoutMs: 75_000, signal: controller.signal,
        onResponse: response => { session.test.response = response.slice(0, 50_000); session.test.step = "follow_up"; this.changed(session); } });
    };
    void run().then(evidence => {
      if (!probeEvidenceReady(evidence)) throw new Error("recipe_probe_failed");
      session.evidence = browserProbeEvidenceSchema.parse(evidence); session.test = { ...session.test, status: "ready", step: null };
    }).catch(error => { session.test = { ...session.test, status: "failed", step: null, error: controller.signal.aborted ? "target_execution_aborted" : browserControlError(error) }; })
      .finally(() => { if (session.work === controller) session.work = undefined; this.changed(session); });
  }
  /** One click: find the chat, send a probe, learn the reply, verify a fresh load, then test. */
  private startAutoTeach(session: Session) {
    const controller = session.work = new AbortController();
    session.teach = { status: "running", error: null, step: "find_input", reply: "" };
    session.mode = "control"; session.pickPart = null;
    this.invalidate(session);
    const step = (value: DetectStep) => { session.teach.step = value; this.changed(session); };
    const run = async () => {
      const page = session.page;
      const controls = await detectChatControls(page, { onStep: step, signal: controller.signal });
      // Sending the first message can navigate to a conversation-specific URL.
      // A fresh evaluation must start at the composer we found before sending.
      session.startUrl = cleanWebsiteNavigation(page.url());
      session.selections = { input: controls.input.locator, ...(controls.submit ? { submit: controls.submit.locator } : {}), ...(controls.launcher ? { launcher: controls.launcher.locator } : {}) };
      session.alternates = { input: controls.input.alternates, submit: controls.submit?.alternates ?? [], launcher: controls.launcher?.alternates ?? [] };
      session.completion = null;
      this.changed(session);
      const detected = await probeChatReply(page, controls, { onStep: step, signal: controller.signal });
      session.selections.response = detected.response.locator; session.alternates.response = detected.response.alternates;
      session.completion = detected.completion; session.teach.reply = detected.reply;
      this.changed(session);
      if (!controls.launcher) {
        step("verify_fresh");
        const launcher = await this.freshLauncher(session, controller.signal);
        if (launcher) { session.selections.launcher = launcher.locator; session.alternates.launcher = launcher.alternates; }
      }
      session.recipe = this.recipe(session);
    };
    void run().then(() => {
      session.teach = { ...session.teach, status: "ready", step: null };
      if (session.work === controller) session.work = undefined;
      this.startTest(session);
    }).catch(error => {
      session.teach = { ...session.teach, status: "failed", step: null, error: controller.signal.aborted ? "target_execution_aborted" : browserControlError(error) };
      if (session.work === controller) session.work = undefined;
      this.changed(session);
    });
  }
  /** Loads the start page in a fresh context: if the chat is closed there, learn its launcher. */
  private async freshLauncher(session: Session, signal: AbortSignal) {
    const draft = this.recipe(session);
    const state = await this.captureState(session);
    const context = await this.options.browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: false, serviceWorkers: "block", storageState: scopedBrowserStorageState(state, session.endpoint) });
    const abort = () => { void context.close().catch(() => {}); };
    signal.addEventListener("abort", abort, { once: true });
    try {
      await guardBrowserContext(context, this.options.destinationCheck);
      await restoreBrowserSessionStorage(context, state);
      const page = await context.newPage();
      page.setDefaultTimeout(10_000);
      await page.goto(draft.start_url, { waitUntil: "domcontentloaded", timeout: 30_000 });
      let root: Page | ReturnType<Page["frameLocator"]> = page;
      for (const frame of draft.input.frames ?? []) root = browserLocator(root, frame).contentFrame();
      const input = browserLocator(root, draft.input).first();
      if (await input.waitFor({ state: "visible", timeout: 12_000 }).then(() => true, () => false)) return null;
      if (await loginRequired(page, draft.start_url)) throw new Error("login_required");
      return await detectLauncherFor(page, draft.input);
    } finally {
      signal.removeEventListener("abort", abort);
      await context.close().catch(() => {});
    }
  }

  // ----------------------------------------------------------------- input --
  private async applyInput(session: Session, events: RemoteInputEvent[]) {
    const { mouse, keyboard } = session.page;
    for (const event of events) {
      switch (event.t) {
        case "move": await mouse.move(event.x, event.y); break;
        case "down": await mouse.move(event.x, event.y); await mouse.down({ button: event.button, clickCount: event.count }); break;
        case "up": await mouse.move(event.x, event.y); await mouse.up({ button: event.button, clickCount: event.count }); break;
        case "wheel": await mouse.move(event.x, event.y); await mouse.wheel(event.dx, event.dy); break;
        case "key": await keyboard.press(event.key); break;
        case "type": await keyboard.type(event.text); break;
        case "text": await keyboard.insertText(event.text); break;
      }
    }
  }
  private serial<T>(session: Session, work: () => Promise<T>): Promise<T> {
    const next = session.chain.then(work, work);
    session.chain = next.catch(() => {});
    return next;
  }

  // -------------------------------------------------------------- dispatch --
  async dispatch(scope: ControlScope, action: RemoteAction, initial?: { state?: BrowserStorageState; recipe?: WebsiteRecipe; startUrl?: string }) {
    await this.expire();
    if (action.action === "open") return this.open(scope, initial);
    const session = this.owned(scope, action.sessionId);
    if (action.action === "close") { await this.dispose(session, "closed"); return { closed: true }; }
    session.touched = Date.now();
    if (session.page.isClosed()) session.page = session.context.pages().filter(page => !page.isClosed()).at(-1)!;
    if (!session.page) throw new Error("browser_session_expired");
    const working = session.teach.status === "running" || session.test.status === "running";
    switch (action.action) {
      case "snapshot": {
        const state = await this.state(session);
        const image = session.frame?.image ?? (await session.page.screenshot({ type: "jpeg", quality: 60, timeout: 5000 })).toString("base64");
        return { ...state, image, width: session.frame?.width ?? 1280, height: session.frame?.height ?? 800 };
      }
      case "cancel": session.work?.abort(); return { cancelled: true };
      case "result":
        if (session.test.status !== "ready" || !session.evidence || !session.recipe || !session.state) throw new Error("recipe_probe_failed");
        return { recipe: session.recipe, storageState: session.state, evidence: session.evidence, response: session.test.response };
      case "save":
        if (working) throw new Error("browser_busy");
        session.recipe ??= this.recipe(session); session.state = await this.captureState(session);
        return { recipe: session.recipe, storageState: session.state };
      case "checkpoint":
        if (working) throw new Error("browser_busy");
        return { storageState: await this.captureState(session), endpoint: cleanWebsiteNavigation(session.startUrl ?? session.page.url()) };
    }
    if (working) throw new Error("browser_busy");
    switch (action.action) {
      case "autoteach": this.startAutoTeach(session); return { status: "running" };
      case "test": this.startTest(session); return { status: "running" };
      case "mode":
        session.mode = action.mode; session.pickPart = action.mode === "teach" ? action.part ?? session.pickPart ?? "response" : null;
        this.changed(session); return { mode: session.mode };
      case "clear":
        delete session.selections[action.part]; delete session.alternates[action.part];
        if (action.part === "submit" && session.completion?.kind === "send_enabled") session.completion = null;
        this.invalidate(session); this.changed(session); return { cleared: true };
    }
    if (action.action === "click" && session.mode === "teach") {
      const part = action.part ?? session.pickPart;
      if (!part) throw new Error("teach_required");
      const value = await this.serial(session, () => selectAt(session.page, action.x, action.y, part === "response" || part === "busy"));
      session.selections[part] = value; delete session.alternates[part];
      if (part === "submit" && session.completion?.kind === "send_enabled") session.completion = { kind: "send_enabled", locator: value };
      session.mode = "control"; session.pickPart = null;
      this.invalidate(session); this.changed(session);
      return { part, selection: value };
    }
    if (session.mode !== "control") throw new Error("control_required");
    await this.serial(session, async () => {
      switch (action.action) {
        case "input": await this.applyInput(session, action.events); break;
        case "pointer":
          await session.page.mouse.move(action.x, action.y);
          if (action.phase === "down") await session.page.mouse.down();
          if (action.phase === "up") await session.page.mouse.up();
          break;
        case "click": await session.page.mouse.click(action.x, action.y, { button: action.button }); break;
        case "key": await session.page.keyboard.press(action.key); break;
        case "text": await session.page.keyboard.insertText(action.text); break;
        case "scroll": await session.page.mouse.wheel(action.dx, action.dy); break;
        case "navigate": await this.options.destinationCheck(action.url); await session.page.goto(action.url, { waitUntil: "domcontentloaded", timeout: 30_000 }); break;
        case "history":
          if (action.direction === "back") await session.page.goBack({ waitUntil: "domcontentloaded", timeout: 30_000 });
          else if (action.direction === "forward") await session.page.goForward({ waitUntil: "domcontentloaded", timeout: 30_000 });
          else await session.page.reload({ waitUntil: "domcontentloaded", timeout: 30_000 });
          break;
        case "tab": { const page = session.context.pages()[action.index]; if (!page) throw new Error("selector_unavailable"); session.page = page; await page.bringToFront().catch(() => {}); await this.cast(session); this.changed(session); break; }
      }
    });
    if (action.action === "navigate" || action.action === "history") this.changed(session);
    return { ok: true };
  }

  private async open(scope: ControlScope, initial?: { state?: BrowserStorageState; recipe?: WebsiteRecipe; startUrl?: string }) {
    // Reopening the same connector (a reload, a second tab) resumes the session.
    for (const session of this.sessions.values()) {
      if (session.orgId === scope.orgId && session.actorId === scope.actorId && session.targetId === scope.targetId && session.endpoint === scope.endpoint) {
        session.touched = Date.now();
        return { sessionId: session.id, expiresAt: new Date(session.created + LIFETIME_MS).toISOString(), resumed: true };
      }
    }
    if (this.opening || this.sessions.size >= (this.options.maxSessions ?? 2)) throw new Error("browser_capacity");
    this.opening = true;
    let context: BrowserContext | undefined;
    try {
      const startUrl = initial?.recipe?.start_url ?? initial?.startUrl ?? scope.endpoint;
      if (!websiteAppNavigation(scope.endpoint, startUrl)) throw new Error("website_recipe_origin_mismatch");
      await this.options.destinationCheck(scope.endpoint);
      const state = initial?.state;
      context = await this.options.browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: false, serviceWorkers: "block", ...(state ? { storageState: scopedBrowserStorageState(state, scope.endpoint) } : {}) });
      await guardBrowserContext(context, this.options.destinationCheck);
      await restoreBrowserSessionStorage(context, state);
      const page = await context.newPage();
      const session: Session = { ...scope, id: randomUUID(), context, page, created: Date.now(), touched: Date.now(), mode: "control", pickPart: null, selections: {}, alternates: {}, completion: null,
        chain: Promise.resolve(), teach: { ...idle(), reply: "" }, test: { ...idle(), response: "" }, frame: null, listeners: new Set(), lastStreamAt: Date.now(), streamed: false, rects: {}, rectsAt: 0, loading: true };
      this.watch(session, page);
      context.on("page", popup => { this.watch(session, popup); session.page = popup; void this.cast(session).catch(() => {}); this.changed(session); });
      context.on("dialog", dialog => { void dialog.dismiss().catch(() => {}); });
      if (initial?.recipe) {
        const recipe = initial.recipe;
        session.startUrl = recipe.start_url;
        const scoped = (value: BrowserLocator) => ({ ...value, frames: value.frames ?? recipe.frame_chain });
        session.selections = { input: scoped(recipe.input), response: scoped(recipe.assistant_message), ...(recipe.launcher ? { launcher: scoped(recipe.launcher) } : {}), ...(recipe.submit.kind === "click" ? { submit: scoped(recipe.submit.locator) } : {}) };
        if (recipe.completion.kind === "selector_hidden") session.completion = recipe.completion;
        else if (recipe.completion.kind === "send_enabled" || recipe.completion.kind === "quiescent") session.completion = recipe.completion;
        const alternates = (recipe.extensions["caudals.evals/teach"] as { alternates?: Record<string, BrowserLocator[]> } | undefined)?.alternates;
        if (alternates) session.alternates = { launcher: alternates.launcher, input: alternates.input, submit: alternates.submit, response: alternates.assistant_message };
      }
      this.sessions.set(session.id, session);
      await this.cast(session).catch(() => {});
      // Navigation finishes in the background: the viewer sees the page load.
      void page.goto(startUrl, { waitUntil: "domcontentloaded", timeout: 30_000 }).catch(() => {}).finally(() => { session.loading = false; this.changed(session); });
      return { sessionId: session.id, expiresAt: new Date(session.created + LIFETIME_MS).toISOString(), resumed: false };
    } catch (error) { await context?.close().catch(() => {}); throw error; }
    finally { this.opening = false; }
  }
}
