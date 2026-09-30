import { randomUUID } from "node:crypto";
import type { Browser, BrowserContext, Page } from "playwright";
import { browserProbeEvidenceSchema, scopedBrowserStorageState, websiteRecipeSchema, type BrowserLocator, type BrowserProbeEvidence, type BrowserStorageState, type WebsiteRecipe } from "../../lib/evals/contracts/browser";
import { type RemoteAction } from "../../lib/evals/contracts/remote-browser";
import { withContentHash } from "../../lib/evals/contracts/hashing";
import { browserLocator, guardBrowserContext, restoreBrowserSessionStorage, validateWebsiteRecipe } from "../../lib/evals/connectors/browser-executor";
import { selectAt } from "./teach";

export type ControlScope = { orgId: string; actorId: string; targetId: string; endpoint: string };
type Session = ControlScope & { id: string; context: BrowserContext; page: Page; mode: "view" | "control" | "teach"; selections: Partial<Record<"launcher" | "input" | "submit" | "response" | "busy", BrowserLocator>>; created: number; touched: number; busy: boolean; test: { status: "idle" | "running" | "ready" | "failed"; error: string | null; response: string }; testAbort?: AbortController; evidence?: BrowserProbeEvidence; recipe?: WebsiteRecipe; state?: BrowserStorageState };
const failureCodes = new Set(["browser_session_expired", "browser_capacity", "browser_busy", "control_required", "teach_required", "selector_ambiguous", "selector_unavailable", "teach_incomplete", "completion_signal_required", "website_frame_unavailable", "recipe_probe_failed", "capture_incomplete", "destination_denied", "destination_invalid", "browser_session_unavailable", "login_required", "website_recipe_origin_mismatch"]);
export function browserControlError(error: unknown) {
  if (error instanceof Error && failureCodes.has(error.message)) return error.message;
  if (error instanceof Error && error.name === "TimeoutError") return "selector_or_navigation_timeout";
  return "browser_unavailable";
}
const safeUrl = (url: string) => { try { const value = new URL(url); return value.origin + value.pathname; } catch { return ""; } };

export class BrowserControl {
  private readonly sessions = new Map<string, Session>();
  private opening = false;
  constructor(private readonly options: { browser: Browser; destinationCheck: (url: string) => Promise<void>; maxSessions?: number }) {}
  get active() { return this.sessions.size > 0 || this.opening; }
  async expire() {
    for (const [id, session] of this.sessions) if (Date.now() - session.created > 30 * 60_000 || Date.now() - session.touched > 10 * 60_000) {
      this.sessions.delete(id); session.testAbort?.abort(); await session.context.close().catch(() => {});
    }
  }
  async close() { for (const session of this.sessions.values()) { session.testAbort?.abort(); await session.context.close().catch(() => {}); } this.sessions.clear(); }
  private async captureState(session: Session) {
    if (new URL(session.page.url()).origin !== new URL(session.endpoint).origin) throw new Error("login_required");
    // Only the target and explicitly taught frame origins are persisted. SSO
    // provider cookies are intentionally discarded after they grant app access.
    const allowed = new Set([new URL(session.endpoint).origin]);
    for (const selection of Object.values(session.selections)) {
      let frame = session.page.mainFrame();
      for (const step of selection?.frames ?? []) {
        const handle = await browserLocator(frame, step).elementHandle();
        if (!handle) throw new Error("website_frame_unavailable");
        try { const child = await handle.contentFrame(); if (!child) throw new Error("website_frame_unavailable"); frame = child; }
        finally { await handle.dispose(); }
        const url = new URL(frame.url()); if (url.protocol === "https:") allowed.add(url.origin);
      }
    }
    for (const origin of allowed) await this.options.destinationCheck(origin);
    const state = await session.context.storageState({ indexedDB: true });
    const sessionStorage: Array<{ origin: string; entries: Array<{ name: string; value: string }> }> = [];
    for (const frame of session.page.frames()) {
      try { const origin = new URL(frame.url()).origin; if (allowed.has(origin)) sessionStorage.push({ origin, entries: await frame.evaluate<Array<{ name: string; value: string }>>("Object.keys(sessionStorage).map(name => ({name,value:sessionStorage.getItem(name)}))") }); } catch { /* cross-origin navigation in progress */ }
    }
    if (JSON.stringify({state,sessionStorage}).length > 500_000) throw new Error("browser_state_too_large");
    const hosts = [...allowed].map(origin => new URL(origin).hostname);
    return scopedBrowserStorageState({
      scope_origins: [...allowed], session_storage: sessionStorage,
      cookies: state.cookies.filter(cookie => hosts.some(host => host === cookie.domain.replace(/^\./, "") || (cookie.domain.startsWith(".") && host.endsWith(cookie.domain)))),
      origins: state.origins.filter(origin => allowed.has(origin.origin)),
    }, session.endpoint);
  }
  private recipe(session: Session) {
    const { input, submit, response, launcher, busy } = session.selections;
    if (!input || !response) throw new Error("teach_incomplete");
    if (!submit && !busy) throw new Error("completion_signal_required");
    const url = new URL(session.page.url());
    if (url.origin !== new URL(session.endpoint).origin || url.username || url.password) throw new Error("website_recipe_origin_mismatch");
    // A clean page path is required; query values from an auth redirect never
    // enter a recipe. SPAs can retain a non-sensitive navigation fragment.
    url.search = ""; if (!/^#!?\/[A-Za-z0-9/_~.-]{0,200}$/.test(url.hash)) url.hash = "";
    return websiteRecipeSchema.parse(withContentHash({ schema_version: "1.0", recipe_revision_id: randomUUID(), source: "operator_authored", start_url: url.toString(), launcher: launcher ?? null, frame_chain: [], input,
      submit: submit ? { kind: "click", locator: submit } : { kind: "press_enter" }, message_container: response, assistant_message: response,
      completion: busy ? { kind: "selector_hidden", locator: busy } : { kind: "send_enabled", locator: submit }, reset: { kind: "new_context" }, assistant_extraction: "last_new_message", created_at: new Date().toISOString(), extensions: { "caudals.evals/teach": { version: 1 } } }));
  }
  async dispatch(scope: ControlScope, action: RemoteAction, initial?: { state?: BrowserStorageState; recipe?: WebsiteRecipe }) {
    await this.expire();
    if (action.action === "open") {
      if (this.opening || this.sessions.size >= (this.options.maxSessions ?? 1)) throw new Error("browser_capacity");
      this.opening = true;
      let context: BrowserContext | undefined;
      try {
        await this.options.destinationCheck(scope.endpoint);
        const state = initial?.state;
        context = await this.options.browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: false, serviceWorkers: "block", ...(state ? { storageState: scopedBrowserStorageState(state, scope.endpoint) } : {}) });
        await guardBrowserContext(context, this.options.destinationCheck);
        await restoreBrowserSessionStorage(context, state);
        const page = await context.newPage();
        page.setDefaultTimeout(10_000);
        const session: Session = { ...scope, id: randomUUID(), context, page, created: Date.now(), touched: Date.now(), mode: "view", selections: {}, busy: false, test: { status: "idle", error: null, response: "" } };
        context.on("page", popup => { popup.setDefaultTimeout(10_000); session.page = popup; });
        context.on("dialog", dialog => { void dialog.dismiss().catch(() => {}); });
        await page.goto(initial?.recipe?.start_url ?? scope.endpoint, { waitUntil: "domcontentloaded", timeout: 30_000 });
        if (initial?.recipe) {
          const recipe = initial.recipe;
          const scoped = (value: BrowserLocator) => ({ ...value, frames: value.frames ?? recipe.frame_chain });
          session.selections = { input: scoped(recipe.input), response: scoped(recipe.assistant_message), ...(recipe.launcher ? { launcher: scoped(recipe.launcher) } : {}), ...(recipe.submit.kind === "click" ? { submit: scoped(recipe.submit.locator) } : {}), ...(recipe.completion.kind === "selector_hidden" ? { busy: scoped(recipe.completion.locator) } : {}) };
        }
        this.sessions.set(session.id, session);
        return { sessionId: session.id, expiresAt: new Date(session.created + 30 * 60_000).toISOString() };
      } catch (error) { await context?.close().catch(() => {}); throw error; }
      finally { this.opening = false; }
    }
    const session = this.sessions.get(action.sessionId);
    if (!session) throw new Error("browser_session_expired");
    if (session.orgId !== scope.orgId || session.actorId !== scope.actorId || session.targetId !== scope.targetId || session.endpoint !== scope.endpoint) throw new Error("browser_control_denied");
    if (action.action === "close") { this.sessions.delete(session.id); session.testAbort?.abort(); await session.context.close(); return { closed: true }; }
    // A pixel capture and an arriving keystroke may overlap. Serialize rather
    // than dropping input while a screenshot holds the page.
    const waitUntil = Date.now() + 10_000;
    while (session.busy && Date.now() < waitUntil) await new Promise(resolve => setTimeout(resolve, 20));
    if (session.busy) throw new Error("browser_busy");
    if (!this.sessions.has(session.id)) throw new Error("browser_session_expired");
    session.touched = Date.now(); session.busy = true;
    try {
      if (session.page.isClosed()) session.page = session.context.pages().at(-1)!;
      if (!session.page) throw new Error("browser_session_expired");
      if (action.action === "snapshot") {
        const masks = session.page.frames().map(frame => frame.locator('input[type="password"]'));
        const image = await session.page.screenshot({ type: "jpeg", quality: 60, timeout: 5000, mask: masks });
        return { sessionId: session.id, image: image.toString("base64"), width: 1280, height: 800, mode: session.mode, url: safeUrl(session.page.url()), tabs: session.context.pages().map((page, index) => ({ index, url: safeUrl(page.url()), active: page === session.page })), selections: session.selections, test: session.test };
      }
      if (action.action === "mode") { if (session.test.status === "running") throw new Error("browser_busy"); session.mode = action.mode; return { mode: session.mode }; }
      if (action.action === "save") { session.recipe = this.recipe(session); session.state = await this.captureState(session); return { recipe: session.recipe, storageState: session.state }; }
      if (action.action === "test") {
        if (session.test.status === "running") throw new Error("browser_busy");
        session.recipe ??= this.recipe(session); session.state = await this.captureState(session); session.mode = "view";
        session.test = { status: "running", error: null, response: "" }; session.evidence = undefined;
        session.testAbort = new AbortController();
        void validateWebsiteRecipe({ browser: this.options.browser, destinationCheck: this.options.destinationCheck, recipe: session.recipe, storageState: session.state, timeoutMs: 60_000, signal: session.testAbort.signal, onResponse: response => { session.test.response = response.slice(0, 50_000); } })
          .then(evidence => {
            if (!evidence.distinct_responses || !evidence.reset_verified || !evidence.streaming_complete || !evidence.duplicate_free) throw new Error("recipe_probe_failed");
            session.evidence = browserProbeEvidenceSchema.parse(evidence); session.test.status = "ready";
          }).catch(error => { session.test.status = "failed"; session.test.error = browserControlError(error); });
        return { status: "running" };
      }
      if (action.action === "result") {
        if (session.test.status !== "ready" || !session.evidence || !session.recipe || !session.state) throw new Error("recipe_probe_failed");
        return { recipe: session.recipe, storageState: session.state, evidence: session.evidence, response: session.test.response };
      }
      if (session.test.status === "running") throw new Error("browser_busy");
      session.test = { status: "idle", error: null, response: "" }; session.evidence = undefined; session.recipe = undefined;
      if (action.action === "clear") { delete session.selections[action.part]; return { cleared: true }; }
      if (action.action === "click" && session.mode === "teach") {
        if (!action.part) throw new Error("teach_required");
        session.selections[action.part] = await selectAt(session.page, action.x, action.y, action.part === "response");
        return { selections: session.selections };
      }
      if (session.mode !== "control") throw new Error("control_required");
      switch (action.action) {
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
        case "tab": { const page = session.context.pages()[action.index]; if (!page) throw new Error("selector_unavailable"); session.page = page; break; }
      }
      return { ok: true };
    } finally { session.busy = false; }
  }
}
