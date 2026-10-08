import { randomUUID } from "node:crypto";
import type {
  Browser,
  BrowserContext,
  Frame,
  FrameLocator,
  Locator,
  Page,
} from "playwright";
import type { CandidateInput } from "../contracts/projections";
import type { InvocationContext } from "../contracts/connectors";
import {
  browserDiscoverySnapshotSchema,
  browserProbeEvidenceSchema,
  scopedBrowserStorageState,
  websiteTeachExtension,
  type BrowserDiscoverySnapshot,
  type BrowserLocator,
  type BrowserProbeEvidence,
  type WebsiteRecipe,
  type BrowserStorageState,
} from "../contracts/browser";
import { observationSchema, type Observation } from "../contracts/results";
import { canonicalJson, sha256, withContentHash } from "../contracts/hashing";
import { validatePublicDestination, type Lookup } from "./egress";
import { contentWords, isEchoOfPrompt } from "../scoring/text";

type FrameLike = Page | Frame | FrameLocator;
type DestinationCheck = (url: string) => Promise<void>;

export function browserLocator(root: FrameLike, value: BrowserLocator): Locator {
  if (value.kind === "role") {
    return root.getByRole(value.role, value.name ? { name: value.name, exact: true } : undefined);
  }
  if (value.kind === "label") return root.getByLabel(value.text, { exact: true });
  if (value.kind === "test_id") return root.getByTestId(value.value);
  return root.locator(value.value);
}

function scopedRoot(page: FrameLike, frames: BrowserLocator[]): FrameLike {
  let root = page;
  for (const frame of frames) root = browserLocator(root, frame).contentFrame();
  return root;
}
function locator(page: FrameLike, recipe: Pick<WebsiteRecipe, "frame_chain">, value: BrowserLocator): Locator {
  return browserLocator(scopedRoot(page, value.frames ?? recipe.frame_chain ?? []), value);
}
async function recipeRoot(page: Page, _recipe: WebsiteRecipe): Promise<FrameLike> { return page; }

// Repository-owned page scripts; see browser-locators.ts for why these are
// built from strings rather than serialized TypeScript callbacks.
const innerTexts = new Function("els", "return els.map(el => (el.innerText || el.textContent || ''))") as (elements: Element[]) => string[];

type Part = "launcher" | "reset" | "input" | "submit" | "assistant_message";
function partOptions(recipe: WebsiteRecipe, part: Part, primary: BrowserLocator) {
  return [primary, ...(websiteTeachExtension(recipe)?.alternates?.[part] ?? [])];
}

/** The first locator (primary, then recorded fallbacks) that resolves to one visible element. */
async function resolvePart(root: FrameLike, recipe: WebsiteRecipe, part: Part, primary: BrowserLocator, timeoutMs: number) {
  const options = partOptions(recipe, part, primary);
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    for (const value of options) {
      const match = locator(root, recipe, value);
      if ((await match.count().catch(() => 0)) === 1 && (await match.isVisible().catch(() => false))) return match;
    }
    if (Date.now() >= deadline) throw new Error("selector_unavailable");
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

async function textSnapshot(root: FrameLike, recipe: WebsiteRecipe) {
  const read = (value: BrowserLocator) => locator(root, recipe, value).evaluateAll(innerTexts)
    .then((values) => values.map((value) => value.trim()).filter(Boolean));
  const primary = await read(recipe.assistant_message);
  if (primary.length) return primary;
  // A reply locator that matches nothing may have drifted; recorded
  // fallbacks keep the run going when they still find the messages.
  for (const value of websiteTeachExtension(recipe)?.alternates?.assistant_message ?? []) {
    const values = await read(value).catch(() => [] as string[]);
    if (values.length) return values;
  }
  return primary;
}

/**
 * The assistant messages a turn added. Handles widgets that re-render or trim
 * their history, a message that grows in place, and the user's own message
 * echoed into a bubble the reply locator also matches (dropped when `prompt`
 * is given, so the executor keeps waiting for the real reply).
 */
export function newAssistantMessages(previous: string[], current: string[], prompt?: string) {
  let messages: string[];
  // Longest suffix of the previous list that the current list starts with.
  let overlap = 0;
  for (let size = Math.min(previous.length, current.length); size > 0; size--) {
    if (previous.slice(previous.length - size).every((value, index) => current[index] === value)) { overlap = size; break; }
  }
  if (overlap > 0 || !previous.length) messages = current.slice(overlap);
  else if (current.length === previous.length && current.slice(0, -1).every((value, index) => value === previous[index]) && current.at(-1)!.startsWith(previous.at(-1)!)) {
    // One container whose text grows with each message.
    messages = [current.at(-1)!.slice(previous.at(-1)!.length).trim()].filter(Boolean);
  } else {
    const pool = [...previous];
    messages = current.filter((value) => { const at = pool.indexOf(value); if (at >= 0) { pool.splice(at, 1); return false; } return true; });
  }
  if (prompt) messages = messages.filter((value) => !isEchoOfPrompt(value, prompt));
  return { messages, duplicateFree: new Set(messages).size === messages.length };
}
const joinTurn = (messages: string[]) => messages.map((value) => value.trim()).filter(Boolean).join("\n\n");

// Only explicit limits in visible application dialogs/banners count. An
// assistant discussing quotas in its answer is still ordinary reply content.
const USAGE_LIMIT = new Function("els", `
  const exhausted=/(?:reached|exceeded).{0,80}(?:limit|quota)|(?:limit|quota).{0,60}(?:reached|exceeded|exhausted)|(?:alcanzad[oa]|superad[oa]|agotad[oa]).{0,80}(?:l[ií]mite|cupo|cuota|cr[eé]ditos|interacciones)|(?:l[ií]mite|cupo|cuota|cr[eé]ditos).{0,60}(?:alcanzad[oa]|superad[oa]|agotad[oa])|(?:no|insufficient|not enough) (?:remaining |available )?credits|sin cr[eé]ditos/i;
  return els.some(el=>{
    const r=el.getBoundingClientRect(),s=getComputedStyle(el);
    if(r.width<4||r.height<4||s.display==='none'||s.visibility==='hidden'||Number(s.opacity)<0.05)return false;
    if(el.querySelector('textarea,[contenteditable="true"],[role="textbox"]')||el.closest('[data-message-author-role],.message-assistant,.assistant-message,.bot-message'))return false;
    return exhausted.test((el.innerText||el.textContent||'').replace(/\\s+/g,' ').slice(0,6000));
  });
`) as (elements: Element[]) => boolean;
export async function websiteUsageLimitReached(root: FrameLike) {
  if ("frames" in root) {
    for (const frame of root.frames()) if (await websiteUsageLimitReached(frame)) return true;
    return false;
  }
  return root.locator('[role="dialog"],[aria-modal="true"],[role="alert"],[class*="modal" i],[class*="overlay" i],[class*="quota" i],[id*="quota" i],[class*="limit" i],[id*="limit" i]')
    .evaluateAll(USAGE_LIMIT);
}

/** Network and WebSocket activity, so completion never relies on text stability alone. */
export type PageActivity = { inflight(): number; lastActivity(): number; mark(): void; dispose(): void };
export function trackPageActivity(page: Page): PageActivity {
  const streaming = new Set(["fetch", "xhr", "eventsource", "other"]);
  const pending = new Map<object, number>();
  let since = 0, last = Date.now();
  const touch = () => { last = Date.now(); };
  const onRequest = (request: import("playwright").Request) => {
    if (!streaming.has(request.resourceType())) return;
    pending.set(request, Date.now()); touch();
  };
  const onDone = (request: import("playwright").Request) => { if (pending.delete(request)) touch(); };
  const onSocket = (socket: import("playwright").WebSocket) => { socket.on("framereceived", touch); socket.on("framesent", touch); };
  page.on("request", onRequest); page.on("requestfinished", onDone); page.on("requestfailed", onDone); page.on("websocket", onSocket);
  return {
    // Only requests started after the prompt count, and a request open for
    // more than a minute is a long poll or a notification channel.
    inflight: () => [...pending.values()].filter((started) => started >= since && Date.now() - started < 60_000).length,
    lastActivity: () => last,
    mark: () => { since = Date.now(); touch(); },
    dispose: () => { page.off("request", onRequest); page.off("requestfinished", onDone); page.off("requestfailed", onDone); page.off("websocket", onSocket); },
  };
}

export async function waitForCompletion(
  root: FrameLike,
  recipe: WebsiteRecipe,
  previous: string[],
  deadline: number,
  activity?: PageActivity,
  prompt?: string,
  /** True when the reply added quick-reply buttons; a buttons-only reply then completes on network quiet. */
  repliedWithActions?: () => Promise<boolean>,
) {
  let candidate = "";
  const waitStarted = Date.now();
  let lastActionCheck = 0;
  let lastLimitCheck = 0;
  let changedAt = 0;
  let prior = "";
  let busySeen = false;
  const stableFor =
    recipe.completion.kind === "text_stable" ? recipe.completion.stable_ms
      : recipe.completion.kind === "quiescent" ? recipe.completion.quiet_ms : 500;
  const networkQuiet = (ms: number) => !activity || (activity.inflight() === 0 && Date.now() - activity.lastActivity() >= ms);
  while (Date.now() < deadline) {
    // Read the completion signal before the text: a widget that swaps in the
    // final answer and clears its busy state together must not yield the
    // partial text captured just before the swap.
    let signalReady = true;
    let signalMissed = false;
    if (recipe.completion.kind === "selector_hidden") {
      const visible = await locator(root, recipe, recipe.completion.locator)
        .first()
        .isVisible()
        .catch(() => false);
      if (visible) busySeen = true;
      signalReady = busySeen && !visible;
      signalMissed = !busySeen && !visible;
    } else if (recipe.completion.kind === "send_enabled") {
      const enabled = await locator(root, recipe, recipe.completion.locator)
        .first()
        .isEnabled()
        .catch(() => false);
      if (!enabled) busySeen = true;
      signalReady = busySeen && enabled;
      // Some apps keep Send disabled while the input is empty.
      signalMissed = busySeen && !enabled;
    }
    const messages = await textSnapshot(root, recipe);
    if (Date.now() - lastLimitCheck >= 1_000) {
      lastLimitCheck = Date.now();
      if (await websiteUsageLimitReached(root)) throw new Error("website_usage_limit");
    }
    const fresh = newAssistantMessages(previous, messages, prompt);
    // Every bubble the turn added counts: basic bots split one reply into several.
    candidate =
      recipe.assistant_extraction === "last_new_message"
        ? joinTurn(fresh.messages)
        : prompt && isEchoOfPrompt(messages.at(-1) ?? "", prompt) ? "" : messages.at(-1) ?? "";
    if (candidate && candidate !== prior) {
      prior = candidate;
      changedAt = Date.now();
    }
    const quietFor = changedAt ? Date.now() - changedAt : 0;
    if (candidate && changedAt) {
      if (recipe.completion.kind === "quiescent") {
        if (quietFor >= stableFor && networkQuiet(Math.min(stableFor, 1_000))) return candidate;
        // A connection held open by the page never blocks a long-settled reply.
        if (quietFor >= Math.max(stableFor * 4, 8_000)) return candidate;
      } else if (signalReady && quietFor >= stableFor) {
        return candidate;
      } else if (signalMissed && activity && quietFor >= 5_000 && networkQuiet(2_000)) {
        // A signal too brief to observe (or Send left disabled by an empty
        // input) falls back to a long, network-confirmed quiet period.
        return candidate;
      }
    }
    if (!candidate && repliedWithActions && Date.now() - waitStarted >= 3_000 && Date.now() - lastActionCheck >= 1_000 && networkQuiet(2_000)) {
      lastActionCheck = Date.now();
      if (await repliedWithActions()) return "";
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("capture_incomplete");
}

/** Types a prompt the way a person would and submits it. */
export async function sendWebsitePrompt(
  root: FrameLike,
  parts: { input: BrowserLocator; submit: BrowserLocator | null; frame_chain?: BrowserLocator[] },
  prompt: string,
  resolved?: { input?: Locator; submit?: Locator | null },
) {
  const recipe = { frame_chain: parts.frame_chain ?? [] };
  const input = resolved?.input ?? locator(root, recipe, parts.input).first();
  const page = input.page();
  if (await websiteUsageLimitReached(page)) throw new Error("website_usage_limit");
  await dismissConsent(page);
  await input.click({ timeout: 10_000 }).catch(() => input.focus({ timeout: 5_000 }));
  const editable = await input.evaluate(new Function("el", "return el.isContentEditable && !('value' in el)") as (element: Element) => boolean);
  const read = new Function("el", "return ('value' in el ? el.value : el.innerText) || ''") as (element: Element) => string;
  if (editable) {
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.press("Backspace");
    await page.keyboard.insertText(prompt);
  } else {
    await input.fill(prompt);
  }
  const head = prompt.trim().slice(0, 24);
  if (!(await input.evaluate(read)).includes(head)) {
    // Editors that ignore programmatic input still accept real keystrokes.
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.press("Backspace");
    await input.pressSequentially(prompt, { delay: 2 });
  }
  if (!parts.submit) { await input.press("Enter"); return; }
  const submit = resolved?.submit ?? locator(root, recipe, parts.submit).first();
  // Announcements can appear after the composer is focused. Close an ordinary
  // notice through its own close control before trying to send.
  await dismissConsent(page);
  // Send buttons usually enable a moment after the input event.
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline && !(await submit.isEnabled().catch(() => true))) await new Promise((resolve) => setTimeout(resolve, 100));
  // Check actionability without sending. A notice may appear while Send is
  // enabling or animating; dismiss it before the single real click.
  const actionableUntil = Date.now() + 10_000;
  while (Date.now() < actionableUntil) {
    if (await submit.click({ trial: true, timeout: 1_000 }).then(() => true, () => false)) break;
    await dismissConsent(page);
  }
  await submit.click({ timeout: 10_000 });
}

/** Distinguishes an expired login from a changed chat UI after a page load. */
export async function loginRequired(page: Page, startUrl: string) {
  const current = new URL(page.url());
  if (current.origin !== new URL(startUrl).origin) return true;
  if (/(^|\/)(log-?in|sign-?in|signin|auth|sso|oauth|session|account\/login|accounts)(\/|$|\?)/i.test(current.pathname)) return true;
  for (const frame of page.frames()) {
    if (await frame.locator('input[type="password"]').first().isVisible().catch(() => false)) return true;
  }
  return false;
}

// Cookie-consent dialogs cover launchers and inputs on most EU sites. Caudals
// declines optional cookies (never accepts them for the customer) and only
// acknowledges notices that offer no choice. Repository-owned page script.
const DISMISS_CONSENT = new Function(`
  const known = ['#onetrust-reject-all-handler', '.ot-pc-refuse-all-handler', '#CybotCookiebotDialogBodyButtonDecline',
    '#CybotCookiebotDialogBodyLevelButtonLevelOptinDeclineAll', '#didomi-notice-disagree-button', '[data-testid="uc-deny-all-button"]',
    '.cky-btn-reject', '.cmplz-deny', '.iubenda-cs-reject-btn', '#cookiescript_reject', '.osano-cm-denyAll', '#hs-eu-decline-button',
    '[data-cookiefirst-action="reject"]', '#wt-cli-reject-btn', '.cc-deny', '#axeptio_btn_dismiss', '#truste-consent-required', '.sp_choice_type_REJECT_ALL'];
  const decline = /^(rechazar|rechazar todas?|rechazar todo|rechazar cookies|rechazar las cookies|rechazar opcionales|rechazar cookies opcionales|denegar|denegar todas?|no acepto|no aceptar|solo (las )?(necesarias|esenciales|t[eé]cnicas)|s[oó]lo (las )?(cookies )?(necesarias|esenciales|t[eé]cnicas)|usar s[oó]lo (las )?cookies (necesarias|t[eé]cnicas)|continuar sin aceptar|reject|reject all|reject all cookies|reject cookies|reject optional cookies|decline|decline all|decline cookies|deny|deny all|refuse|refuse all|only (necessary|essential)( cookies)?|necessary cookies only|use necessary cookies only|essential cookies only|continue without accepting|tout refuser|refuser|continuer sans accepter|ablehnen|alle ablehnen|rifiuta|rifiuta tutto|rejeitar|rejeitar todos)$/i;
  const acknowledge = /^(ok|okay|vale|entendido|de acuerdo|got it|understood|i understand|close|cerrar|×|✕|x)$/i;
  const accept = /accept|acepta|agree|allow|permitir|consent/i;
  const about = /cookie|consent|consentimiento|privacidad|privacy|rgpd|gdpr|datos personales|personal data/i;
  const visible = el => { const r = el.getBoundingClientRect(); if (r.width < 4 || r.height < 4) return false; const s = getComputedStyle(el); return s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0.05; };
  const roots = [document]; for (let i = 0; i < roots.length && i < 50; i++) for (const el of roots[i].querySelectorAll('*')) if (el.shadowRoot) roots.push(el.shadowRoot);
  for (const root of roots) for (const selector of known) { const el = root.querySelector(selector); if (el && visible(el)) { el.click(); return 'known'; } }
  const label = el => (el.innerText || el.value || el.getAttribute('aria-label') || el.textContent || '').replace(/\\s+/g, ' ').trim();
  const banner = el => { let node = el; for (let i = 0; i < 10 && node; i++) { node = node.parentElement || (node.getRootNode && node.getRootNode().host) || null; if (node && about.test((node.id || '') + ' ' + (typeof node.className === 'string' ? node.className : '') + ' ' + (node.getAttribute('aria-label') || '') + ' ' + (node.innerText || '').slice(0, 1500))) return node; } return null; };
  const buttons = []; for (const root of roots) for (const el of root.querySelectorAll('button,[role="button"],a,input[type="button"],input[type="submit"]')) if (visible(el)) buttons.push(el);
  for (const el of buttons) { const text = label(el); if (text.length <= 60 && decline.test(text) && banner(el)) { el.click(); return 'declined'; } }
  // A notice without any choice: acknowledging it consents to nothing optional.
  const notices = new Set(); for (const el of buttons) { const text = label(el); const box = text.length <= 30 && acknowledge.test(text) ? banner(el) : null; if (box) notices.add(box); }
  for (const box of notices) { const choices = buttons.filter(el => box.contains(el) && accept.test(label(el))); if (choices.length) continue; const el = buttons.find(item => box.contains(item) && acknowledge.test(label(item))); if (el) { el.click(); return 'acknowledged'; } }
  return null;
`) as () => string | null;

// A fresh browser can show the same promotional announcement every time. Only
// close it through an explicit dismissal; authentication, consent and binding
// agreement screens stay under the person's control.
const FIND_NOTICE_CLOSE = new Function(`
  const visible=el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return r.width>3&&r.height>3&&s.display!=='none'&&s.visibility!=='hidden';};
  const close=/^(×|✕|x|close|cerrar|dismiss|descartar|not now|ahora no|later|más tarde|got it|entendido)$/i;
  const protectedText=/captcha|two.factor|2fa|one.time code|verification code|c[oó]digo de verificaci[oó]n|sign in|log in|iniciar sesi[oó]n|acepto.{0,40}(t[eé]rminos|condiciones)|agree.{0,40}(terms|conditions)|accept.{0,40}(terms|conditions)|terms of (use|service)|t[eé]rminos (de uso|y condiciones)/i;
  const roots=[document];for(let i=0;i<roots.length&&i<50;i++)for(const el of roots[i].querySelectorAll('*'))if(el.shadowRoot)roots.push(el.shadowRoot);
  for(const root of roots)for(const el of root.querySelectorAll('button,[role="button"],[onclick],a,span')){
    if(!visible(el))continue;
    const labels=[el.getAttribute('aria-label'),el.getAttribute('title'),el.innerText,el.textContent];
    if(!labels.some(label=>label&&close.test(label.trim())))continue;
    if(!el.matches('button,[role="button"],[onclick],a')&&getComputedStyle(el).cursor!=='pointer')continue;
    let box=el.parentElement||el.getRootNode()?.host,notice=null;
    for(let depth=0;box&&depth<10;depth++,box=box.parentElement||box.getRootNode()?.host){
      if(box===document.body||box===document.documentElement)break;
      const hint=(box.id||'')+' '+(typeof box.className==='string'?box.className:'');
      if(!(box.matches('[role="dialog"],[aria-modal="true"]')||/notice|announcement|promo|modal|overlay|popup|popover/i.test(hint)))continue;
      const text=(box.innerText||'').slice(0,6000);
      if(protectedText.test(text)||/cookie|consent/i.test(hint)||box.querySelector('textarea,[contenteditable="true"],[role="textbox"],input[type="password"],input[autocomplete="one-time-code"],input[type="checkbox"],iframe[src*="captcha" i]')){notice=null;break;}
      notice=box;
    }
    if(notice){el.setAttribute('data-caudals-notice-close','');return true;}
  }
  return false;
`) as () => boolean;

/** Declines optional cookies and closes ordinary notices in every frame. */
export async function dismissConsent(page: Page) {
  let dismissed = false;
  for (const frame of page.frames()) {
    if (frame.isDetached()) continue;
    const result = await frame.evaluate(DISMISS_CONSENT).catch(() => null);
    if (result) dismissed = true;
    const notice = await frame.evaluate(FIND_NOTICE_CLOSE).catch(() => false);
    if (notice) {
      const match = frame.locator("[data-caudals-notice-close]").first();
      const clicked = await match.click({ timeout: 2_000 }).then(() => true, () => false);
      // Some oversized fixed announcements put their Close control outside
      // the viewport. Invoke only that verified dismissal's own click handler.
      if (clicked || await match.evaluate(new Function("el", "if (!el.isConnected) return false; el.click(); return true") as (el: HTMLElement) => boolean).catch(() => false)) dismissed = true;
      await frame.locator("[data-caudals-notice-close]").evaluateAll(new Function("els", "for (const el of els) el.removeAttribute('data-caudals-notice-close')") as (els: Element[]) => void).catch(() => {});
    }
  }
  if (dismissed) await page.waitForTimeout(600);
  return dismissed;
}

export function assertScorableWebsiteRecipe(recipe: WebsiteRecipe) {
  if (recipe.completion.kind === "text_stable") {
    throw new Error("website_completion_unverified");
  }
}

export async function guardBrowserContext(
  context: BrowserContext,
  check: DestinationCheck,
) {
  await context.routeWebSocket("**/*", async (socket) => {
    try {
      const destination = new URL(socket.url());
      if (destination.protocol !== "wss:") throw new Error("destination_invalid");
      destination.protocol = "https:";
      await check(destination.toString());
      socket.connectToServer();
    } catch {
      socket.close();
    }
  });
  await context.route("**/*", async (route) => {
    const url = route.request().url();
    try {
      if (new URL(url).protocol !== "https:") throw new Error("destination_invalid");
      await check(url);
      await route.continue();
    } catch {
      await route.abort("blockedbyclient");
    }
  });
}

export async function restoreBrowserSessionStorage(context: BrowserContext, state?: BrowserStorageState) {
  if (!state?.session_storage?.length) return;
  await context.addInitScript({ content: `(() => { const states=${JSON.stringify(state.session_storage)};const state=states.find(item=>item.origin===location.origin);if(state)for(const item of state.entries)sessionStorage.setItem(item.name,item.value); })()` });
}

export async function discoverWebsite(args: {
  browser: Browser;
  url: string;
  destinationCheck: DestinationCheck;
  timeoutMs?: number;
  /** Receives a viewport-only JPEG with every input masked, for operator assistance. */
  onScreenshot?: (bytes: Buffer) => void;
}): Promise<BrowserDiscoverySnapshot> {
  await args.destinationCheck(args.url);
  const context = await args.browser.newContext({
    acceptDownloads: false,
    serviceWorkers: "block",
  });
  try {
    await guardBrowserContext(context, args.destinationCheck);

    const page = await context.newPage();
    await page.goto(args.url, {
      waitUntil: "domcontentloaded",
      timeout: Math.min(args.timeoutMs ?? 30_000, 60_000),
    });
    // Keep this as browser-native JavaScript. The production tsx loader adds
    // helper references to serialized function callbacks that do not exist in
    // Chromium's page context.
    const snapshot = await page.evaluate(`(() => {
      const describe = (element) => {
        const html = element;
        return [
          element.tagName.toLocaleLowerCase(),
          element.getAttribute("role"),
          element.getAttribute("aria-label"),
          element.getAttribute("data-testid"),
          element.id,
          html.innerText?.trim().slice(0, 120),
        ]
          .filter(Boolean)
          .join(" | ")
          .slice(0, 500);
      };
      const all = (selector, limit = 25) =>
        Array.from(document.querySelectorAll(selector)).slice(0, limit).map(describe);
      const text = document.body?.innerText?.toLocaleLowerCase() ?? "";
      const html = document.documentElement.innerHTML.toLocaleLowerCase();
      return {
        url: location.href,
        title: document.title,
        provider_hint:
          ["intercom", "drift", "zendesk", "crisp", "salesforce"].find((name) =>
            html.includes(name),
          ) ?? null,
        launchers: all(
          'button,[role="button"],[aria-label*="chat" i],[data-testid*="chat" i]',
        ),
        text_inputs: all(
          'textarea,input[type="text"],[contenteditable="true"],[role="textbox"]',
        ),
        message_regions: all(
          '[role="log"],[aria-live],[data-testid*="message" i],[class*="message" i]',
        ),
        frames: all("iframe", 20),
        has_closed_shadow_hint: all("*")
          .slice(0, 200)
          .some((description) => description.includes("shadow")),
        has_captcha: /captcha|verify you are human|cloudflare challenge/.test(text),
      };
    })()`);
    if (args.onScreenshot) {
      try {
        await page.setViewportSize({ width: 1024, height: 768 });
        const bytes = await page.screenshot({
          type: "jpeg", quality: 45, fullPage: false, timeout: 10_000,
          mask: [page.locator('input, textarea, [contenteditable="true"], [role="textbox"]')],
        });
        if (bytes.length <= 400_000) args.onScreenshot(bytes);
      } catch {
        // Evidence is best effort; discovery must not fail because a capture did.
      }
    }
    return browserDiscoverySnapshotSchema.parse(snapshot);
  } finally {
    await context.close();
  }
}

export function knownRecipeProposal(
  snapshot: BrowserDiscoverySnapshot,
  recipeRevisionId = randomUUID(),
): Omit<WebsiteRecipe, "content_hash"> | null {
  if (snapshot.has_captcha || !snapshot.text_inputs.length) return null;
  const common = {
    schema_version: "1.0" as const,
    recipe_revision_id: recipeRevisionId,
    source: "known_recipe" as const,
    start_url: snapshot.url,
    frame_chain: [] as BrowserLocator[],
    input: { kind: "role" as const, role: "textbox" as const, name: null },
    submit: { kind: "press_enter" as const },
    message_container: { kind: "role" as const, role: "log" as const, name: null },
    assistant_message: {
      kind: "css" as const,
      value: '[data-message-author-role="assistant"], [data-testid*="assistant" i], .assistant-message',
    },
    completion: { kind: "text_stable" as const, stable_ms: 500 },
    reset: { kind: "new_context" as const },
    assistant_extraction: "last_new_message" as const,
    created_at: new Date().toISOString(),
    extensions: {
      "caudals.evals/discovery": { provider_hint: snapshot.provider_hint },
    },
  };
  return {
    ...common,
    launcher: snapshot.launchers.length
      ? ({ kind: "css", value: '[aria-label*="chat" i], [data-testid*="chat" i]' } as const)
      : null,
  };
}

async function openRecipe(args: {
  browser: Browser;
  recipe: WebsiteRecipe;
  destinationCheck: DestinationCheck;
  storageState?: BrowserStorageState;
  signal?: AbortSignal;
}) {
  if (args.signal?.aborted) throw new Error("target_execution_aborted");
  const context = await args.browser.newContext({
    acceptDownloads: false,
    serviceWorkers: "block",
    viewport: { width: 1280, height: 800 },
    ...(args.storageState ? { storageState: scopedBrowserStorageState(args.storageState, args.recipe.start_url) } : {}),
  });
  const abort = () => { void context.close().catch(() => {}); };
  args.signal?.addEventListener("abort", abort, { once: true });
  if (args.signal?.aborted) abort();
  try {
    await guardBrowserContext(context, args.destinationCheck);
    await restoreBrowserSessionStorage(context, args.storageState);
    const page = await context.newPage();
    page.setDefaultTimeout(15_000);
    const activity = trackPageActivity(page);
    await page.goto(args.recipe.start_url, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    const root = await recipeRoot(page, args.recipe);
    await openChat(page, root, args.recipe);
    if (args.recipe.reset.kind === "click") {
      // A new context preserves authentication, but many apps also restore the
      // last conversation from the server. Reset it even with a visible input.
      const reset = await resolvePart(root, args.recipe, "reset", args.recipe.reset.locator, 10_000);
      await dismissConsent(page);
      const messages = locator(root, args.recipe, args.recipe.assistant_message);
      await messages.evaluateAll(new Function("els", "for (const el of els) el.setAttribute('data-caudals-before-reset', el.innerText || el.textContent || '')") as (els: Element[]) => void);
      activity.mark();
      await reset.click({ timeout: 10_000 });
      await openChat(page, root, args.recipe);
      // New chat commonly waits for an API call while leaving the old input
      // visible. Do not send the next question into that outgoing conversation.
      const resetDeadline = Date.now() + 15_000;
      let settled = false;
      try {
        while (Date.now() < resetDeadline) {
          const stale = await messages.evaluateAll(new Function("els", "return els.some(el => el.hasAttribute('data-caudals-before-reset') && el.getAttribute('data-caudals-before-reset') === (el.innerText || el.textContent || '') && (el.innerText || el.textContent || '').trim())") as (els: Element[]) => boolean);
          if (!stale && activity.inflight() === 0 && Date.now() - activity.lastActivity() >= 800) { settled = true; break; }
          await page.waitForTimeout(200);
        }
      } finally {
        await messages.evaluateAll(new Function("els", "for (const el of els) el.removeAttribute('data-caudals-before-reset')") as (els: Element[]) => void).catch(() => {});
      }
      if (!settled) throw new Error("conversation_reset_unverified");
    }
    return { context, page, root, activity, release: () => args.signal?.removeEventListener("abort", abort) };
  } catch (error) {
    args.signal?.removeEventListener("abort", abort);
    await context.close().catch(() => {});
    if (args.signal?.aborted) throw new Error("target_execution_aborted");
    throw error;
  }
}

/**
 * Waits for the chat input, clicking the launcher only while the chat is
 * closed: a widget that restores itself open must not be toggled shut.
 */
async function openChat(page: Page, root: FrameLike, recipe: WebsiteRecipe) {
  const deadline = Date.now() + 30_000;
  const loadedAt = Date.now();
  let clicks = 0, lastClick = 0, consentChecks = 0, lastConsent = 0;
  const inputs = partOptions(recipe, "input", recipe.input);
  const launchers = recipe.launcher ? partOptions(recipe, "launcher", recipe.launcher) : [];
  const inputOpen = async () => {
    for (const value of inputs) {
      const match = locator(root, recipe, value);
      // A launcher's widget can paint its closed panel unstyled in the page
      // before its stylesheet hides it (Visor.ai): only an input on screen
      // means that chat is open.
      if ((await match.count().catch(() => 0)) === 1 && (await match.isVisible().catch(() => false)) && (!launchers.length || await onScreen(page, match))) return true;
    }
    return false;
  };
  while (Date.now() < deadline) {
    if (await inputOpen()) {
      // A consent dialog can cover a chat box that is already visible.
      if (!consentChecks) { consentChecks++; await page.waitForTimeout(Math.max(0, 800 - (Date.now() - loadedAt))); await dismissConsent(page); }
      // Greetings often arrive after the input, and an unstyled panel can close
      // itself once styled: let the chat settle, then confirm it is still open,
      // so the reply snapshot starts after the greeting.
      await settleMessages(root, recipe, Math.min(deadline, Date.now() + 6_000));
      if (await inputOpen()) return;
      continue;
    }
    // Consent managers load late; a dialog over the launcher blocks every click.
    if (consentChecks < 6 && Date.now() - loadedAt > 800 && Date.now() - lastConsent > 1_500) {
      consentChecks++; lastConsent = Date.now();
      if (await dismissConsent(page)) continue;
    }
    if (launchers.length && clicks < 2 && Date.now() - loadedAt > 1_200 && Date.now() - lastClick > 5_000) {
      for (const value of launchers) {
        const match = locator(root, recipe, value).first();
        if (await match.isVisible().catch(() => false)) {
          if (await match.click({ timeout: 5_000 }).then(() => true, () => false)) { clicks++; lastClick = Date.now(); break; }
        }
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (await loginRequired(page, recipe.start_url)) throw new Error("login_required");
  throw new Error(recipe.launcher && !clicks ? "launcher_unavailable" : "selector_unavailable");
}

async function settleMessages(root: FrameLike, recipe: WebsiteRecipe, until: number) {
  const read = async () => JSON.stringify(await textSnapshot(root, recipe).catch(() => []));
  let last = await read(), since = Date.now();
  while (Date.now() < until && Date.now() - since < 1_500) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    const next = await read();
    if (next !== last) { last = next; since = Date.now(); }
  }
}

async function onScreen(page: Page, match: Locator) {
  const box = await match.boundingBox().catch(() => null);
  const view = page.viewportSize();
  return !!box && !!view && box.x < view.width && box.x + box.width > 0 && box.y < view.height && box.y + box.height > 0;
}

/* ------------------------------------------------- quick-reply actions --- */

const ACTION_SELECTOR = 'button,[role="button"],a[href],[role="option"],[role="menuitem"],input[type="button"]';
// Remember every clickable element present before the prompt, so the
// buttons a reply adds can be told apart from the page's own chrome.
const MARK_ACTIONS = new Function("el", `
  const all = [];
  const visit = root => { for (const node of root.querySelectorAll(${JSON.stringify(ACTION_SELECTOR)})) all.push(node); for (const node of root.querySelectorAll('*')) if (node.shadowRoot) visit(node.shadowRoot); };
  visit(el.getRootNode && el.getRootNode().querySelectorAll ? el.getRootNode() : el.ownerDocument);
  window.__caudalsSeenActions = new WeakSet(all);
  window.__caudalsChatInput = el;
`) as (element: Element) => void;
// Buttons added since MARK_ACTIONS, in the chat panel (from a message: the
// nearest ancestor holding a text box; from the input: its whole document).
const COLLECT_ACTIONS = new Function("el", "fromMessage", `
  const seen = window.__caudalsSeenActions;
  const clear = root => { for (const node of root.querySelectorAll('[data-caudals-action]')) node.removeAttribute('data-caudals-action'); for (const node of root.querySelectorAll('*')) if (node.shadowRoot) clear(node.shadowRoot); };
  clear(el.ownerDocument || document);
  const box = 'textarea,input[type="text"],input:not([type]),[contenteditable="true"],[role="textbox"]';
  const visible = node => { const r = node.getBoundingClientRect(); if (r.width < 4 || r.height < 4) return false; const s = getComputedStyle(node); return s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0.05; };
  let panel = el.getRootNode && el.getRootNode().querySelectorAll ? el.getRootNode() : el.ownerDocument;
  if (fromMessage) { panel = el; for (let i = 0; i < 14 && panel.parentElement; i++) { panel = panel.parentElement; if (panel.querySelector(box)) break; } }
  const composer = window.__caudalsChatInput && window.__caudalsChatInput.isConnected ? window.__caudalsChatInput : panel.querySelector ? panel.querySelector(box) : null;
  const parentOf = node => node.parentElement || (node.getRootNode && node.getRootNode().host) || null;
  const outsideChat = node => {
    for(let cur=node,depth=0;cur&&depth<24;cur=parentOf(cur),depth++){
      if(composer && cur.contains(composer)) break;
      const hint=(cur.id||'')+' '+(typeof cur.className==='string'?cur.className:'');
      if(cur.matches('nav,aside,header,footer,[role="navigation"],[role="complementary"],[role="banner"],[role="contentinfo"],[role="dialog"],[aria-modal="true"]') || /sidebar|conversation[-_ ]?(list|title)|chat[-_ ]?list|history[-_ ]?list|modal|overlay|announcement|promo|popover/i.test(hint))return true;
    }
    return false;
  };
  const nodes = []; const visit = root => { for (const node of root.querySelectorAll(${JSON.stringify(ACTION_SELECTOR)})) nodes.push(node); for (const node of root.querySelectorAll('*')) if (node.shadowRoot) visit(node.shadowRoot); };
  visit(panel);
  const chrome = /^(send|send message|enviar|enviar mensaje|submit|close|cerrar|minimi[sz]e|minimizar|menu|menú|attach|adjuntar|emoji|copy|copiar|like|dislike|me gusta|no me gusta|feedback|reset|reiniciar|restart|new chat|nuevo chat|nueva conversaci[oó]n|expand|ampliar|more|más|options|opciones|share|compartir|x|×|✕|👍|👎|ver más|see more|leer más|read more|copiar texto|copiar respuesta|copy text|copy answer|copy response|copy to clipboard|copiar al portapapeles|regenerar|regenerate|volver a generar)$/i;
  const out = [];
  for (const node of nodes) {
    if (outsideChat(node)) continue;
    if (seen ? seen.has(node) : !(el.contains(node) || (el.compareDocumentPosition(node) & 4))) continue;
    if (!visible(node) || node.disabled || node.getAttribute('aria-disabled') === 'true') continue;
    if (composer && node.parentElement && (node.parentElement.contains(composer) || (node.parentElement.parentElement && node.parentElement.parentElement.contains(composer) && !node.parentElement.parentElement.contains(el)))) continue;
    const label = (node.innerText || node.value || node.getAttribute('aria-label') || node.textContent || '').replace(/\\s+/g, ' ').trim();
    // A bare URL is a cited source link, not something a person would pick.
    if (!label || label.length > 80 || chrome.test(label) || /^https?:\\/\\//i.test(label) || out.some(item => item.label === label)) continue;
    let external = false;
    if (node.tagName === 'A') { try { const url = new URL(node.getAttribute('href'), location.href); external = url.origin !== location.origin || (url.pathname !== location.pathname && !url.hash); } catch { external = true; } }
    node.setAttribute('data-caudals-action', String(out.length));
    out.push({ label, external });
    if (out.length >= 12) break;
  }
  return out;
`) as (element: Element, fromMessage: boolean) => Array<{ label: string; external: boolean }>;

const RISKY_ACTION = /compra|comprar|contrat|pagar|pago|presupuesto|buy|purchase|pay\b|checkout|quote|llam|call|tel[eé]fono|phone|whatsapp|e-?mail|correo|baja|cancel|elimin|borrar|delete|unsubscribe|log ?in|iniciar sesi|acceder|registr|sign ?(in|up)|descarg|download|agente|agent|humano|human|persona|operador|operator|valora|rate|encuesta|survey/i;

/**
 * The quick reply a person would pick for this question: the one whose label
 * shares the most meaningful words with it, when that choice is clear. Never
 * links that leave the page, purchases, contact, sign-in or deletion.
 */
export function pickGuidedAction(question: string, actions: Array<{ label: string; external: boolean }>): number | null {
  const asked = contentWords(question);
  const stems = (words: string[]) => words.map((word) => word.slice(0, 5));
  const askedStems = new Set(stems(asked));
  const scores = actions.map((action) => {
    if (action.external || RISKY_ACTION.test(action.label)) return 0;
    const words = contentWords(action.label);
    if (!words.length) return 0;
    const hits = stems(words).filter((stem) => askedStems.has(stem)).length;
    return hits / words.length;
  });
  const best = Math.max(0, ...scores);
  if (best < 0.5) return null;
  const winners = scores.filter((score) => score === best).length;
  return winners === 1 ? scores.indexOf(best) : null;
}

async function markActions(input: Locator) {
  await input.evaluate(MARK_ACTIONS).catch(() => {});
}
async function collectActions(root: FrameLike, recipe: WebsiteRecipe, input: Locator) {
  const messages = locator(root, recipe, recipe.assistant_message);
  const count = await messages.count().catch(() => 0);
  const fromMessage = count > 0;
  const element = fromMessage ? messages.nth(count - 1) : input;
  return element.evaluate(COLLECT_ACTIONS, fromMessage).catch(() => [] as Array<{ label: string; external: boolean }>);
}

/** After the completion signal, waits out a short quiet window so late bubbles join the reply. */
async function settleTurn(root: FrameLike, recipe: WebsiteRecipe, previous: string[], prompt: string, deadline: number, quietMs = 1_500) {
  let text = joinTurn(newAssistantMessages(previous, await textSnapshot(root, recipe), prompt).messages);
  let stableSince = Date.now();
  while (Date.now() - stableSince < quietMs && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    const next = joinTurn(newAssistantMessages(previous, await textSnapshot(root, recipe), prompt).messages);
    if (next !== text) { text = next; stableSince = Date.now(); }
  }
  return newAssistantMessages(previous, await textSnapshot(root, recipe), prompt);
}

const GUIDED_STEPS = 2;

async function invokeOpenWebsite(args: {
  session: Awaited<ReturnType<typeof openRecipe>>;
  recipe: WebsiteRecipe;
  input: CandidateInput;
  context: InvocationContext;
}) {
  assertScorableWebsiteRecipe(args.recipe);
  if (args.context.signal.aborted) throw new Error("target_execution_aborted");
  const started = new Date().toISOString();
  const session = args.session;
  const deadline = new Date(args.context.deadline).getTime();
  let previous = await textSnapshot(session.root, args.recipe);
  const prompt = [...args.input.messages]
    .reverse()
    .find((message) => message.role === "user")?.content;
  if (!prompt) throw new Error("website_prompt_missing");
  const input = await resolvePart(session.root, args.recipe, "input", args.recipe.input, 15_000);
  const submit = args.recipe.submit.kind === "click"
    ? await resolvePart(session.root, args.recipe, "submit", args.recipe.submit.locator, 5_000)
    : null;
  await markActions(input);
  // Requests the submit itself starts are the reply's own streams.
  session.activity.mark();
  await sendWebsitePrompt(session.root, {
    input: args.recipe.input,
    submit: args.recipe.submit.kind === "click" ? args.recipe.submit.locator : null,
    frame_chain: args.recipe.frame_chain,
  }, prompt, { input, submit });

  const parts: string[] = [];
  const guided: Array<{ action: string; reply_chars: number }> = [];
  let actions: Array<{ label: string; external: boolean }> = [];
  let turnPrompt = prompt;
  let messageCount = 0;
  let duplicateFree = true;
  for (let step = 0; ; step++) {
    let completed = true;
    try {
      await waitForCompletion(session.root, args.recipe, previous, deadline, session.activity, turnPrompt,
        async () => (await collectActions(session.root, args.recipe, input)).length > 0);
    } catch (error) {
      if (!(error instanceof Error) || error.message !== "capture_incomplete") throw error;
      completed = false;
    }
    const captured = completed ? await settleTurn(session.root, args.recipe, previous, turnPrompt, deadline) : { messages: [] as string[], duplicateFree: true };
    const found = await collectActions(session.root, args.recipe, input);
    if (found.length) actions = found;
    // A reply made only of buttons is still a reply; nothing at all is not.
    if (!captured.messages.length && !found.length) {
      if (step === 0) throw new Error("capture_incomplete");
      break;
    }
    if (!captured.duplicateFree) duplicateFree = false;
    messageCount += captured.messages.length;
    const text = joinTurn(captured.messages);
    if (step > 0) guided.push({ action: turnPrompt, reply_chars: text.length });
    if (text) parts.push(text);
    if (step >= GUIDED_STEPS || !found.length || Date.now() > deadline - 10_000) break;
    const choice = pickGuidedAction(prompt, found);
    if (choice === null) break;
    // Follow the matching quick reply, as a person would.
    const label = found[choice].label;
    previous = await textSnapshot(session.root, args.recipe);
    const button = locator(session.root, args.recipe, { kind: "css", value: `[data-caudals-action="${choice}"]`, frames: args.recipe.assistant_message.frames }).first();
    await markActions(input);
    session.activity.mark();
    const clicked = await button.click({ timeout: 5_000 }).then(() => true, () => false);
    if (!clicked) break;
    parts.push(`→ ${label}`);
    turnPrompt = label;
  }
  if (!duplicateFree) throw new Error("capture_incomplete");
  // Trailing "→ choice" with no reply after it is dropped.
  while (parts.length && parts.at(-1)!.startsWith("→ ")) parts.pop();
  const output = parts.join("\n\n");
  const finished = new Date().toISOString();
  if (args.context.signal.aborted) throw new Error("target_execution_aborted");
  return observationSchema.parse(
    withContentHash({
      schema_version: "1.0" as const,
      observation_id: randomUUID(),
      run_id: args.context.run_id,
      case_revision_id: args.input.case_revision_id,
      repetition: 0,
      attempt_id: args.context.attempt_id,
      target_revision_id: args.context.target_revision_id,
      started_at: started,
      finished_at: finished,
      messages: [
        ...args.input.messages,
        { role: "assistant" as const, content: output },
      ],
      tool_events: [],
      artifacts: [],
      provider_request_id: null,
      status: "succeeded" as const,
      error: null,
      metadata: {
        latency_ms: {
          value: Math.max(0, Date.parse(finished) - Date.parse(started)),
          provenance: "measured" as const,
        },
        input_tokens: { value: null, provenance: "unavailable" as const },
        output_tokens: { value: null, provenance: "unavailable" as const },
        cost: { value: null, provenance: "unavailable" as const },
        model_identity: { value: null, provenance: "unavailable" as const },
      },
      extensions: {
        "caudals.evals/browser": {
          recipe_revision_id: args.recipe.recipe_revision_id,
          extraction: args.recipe.assistant_extraction,
          new_message_count: messageCount,
          duplicate_free: duplicateFree,
          ...(actions.length ? { actions: actions.map((action) => action.label) } : {}),
          ...(guided.length ? { guided } : {}),
        },
      },
    }),
  );
}

/** One context belongs to one fenced attempt; subsequent calls keep its widget state. */
export async function openWebsiteAttemptSession(args: {
  browser: Browser;
  recipe: WebsiteRecipe;
  destinationCheck: DestinationCheck;
  storageState?: BrowserStorageState;
  signal?: AbortSignal;
}) {
  assertScorableWebsiteRecipe(args.recipe);
  const session = await openRecipe(args);
  let previousMessages: ReturnType<typeof observationSchema.parse>["messages"] | null = null;
  let identity: { runId: string; targetRevisionId: string; attemptId: string } | null = null;
  let busy = false;
  let closed = false;
  return {
    async invoke(input: CandidateInput, context: InvocationContext) {
      if (closed || busy) throw new Error("website_session_unavailable");
      if (identity && (identity.runId !== context.run_id ||
        identity.targetRevisionId !== context.target_revision_id ||
        identity.attemptId !== context.attempt_id)) throw new Error("scenario_identity_mismatch");
      if (previousMessages && (input.messages.length !== previousMessages.length + 1 ||
        canonicalJson(input.messages.slice(0, previousMessages.length)) !== canonicalJson(previousMessages) ||
        input.messages.at(-1)?.role !== "user")) throw new Error("scenario_transcript_mismatch");
      busy = true;
      const abort = () => { void session.context.close().catch(() => {}); };
      context.signal.addEventListener("abort", abort, { once: true });
      try {
        const observation = await invokeOpenWebsite({ session, recipe: args.recipe, input, context });
        identity ??= { runId: context.run_id, targetRevisionId: context.target_revision_id, attemptId: context.attempt_id };
        previousMessages = observation.messages;
        return observation;
      } finally {
        context.signal.removeEventListener("abort", abort);
        busy = false;
      }
    },
    async close() {
      if (closed) return;
      closed = true;
      session.release();
      await session.context.close();
    },
  };
}

export async function invokeWebsite(args: {
  browser: Browser;
  recipe: WebsiteRecipe;
  input: CandidateInput;
  context: InvocationContext;
  destinationCheck: DestinationCheck;
  storageState?: BrowserStorageState;
}) {
  const session = await openWebsiteAttemptSession({ ...args, signal: args.context.signal });
  // The reply's allowance starts once the chat is open, not before the page loaded.
  const deadline = new Date(Math.max(Date.parse(args.context.deadline), Date.now() + 45_000)).toISOString();
  try { return await session.invoke(args.input, { ...args.context, deadline }); }
  finally { await session.close(); }
}

export async function validateWebsiteRecipe(args: {
  browser: Browser;
  recipe: WebsiteRecipe;
  destinationCheck: DestinationCheck;
  timeoutMs?: number;
  storageState?: BrowserStorageState;
  onResponse?: (response: string) => void;
  /** Content-free diagnostics for a probe attempt that failed. */
  onProbeFailed?: (failure: { probe: number; attempt: number; code: string; ms: number }) => void;
  signal?: AbortSignal;
}): Promise<BrowserProbeEvidence> {
  const prompts = [
    `Connection check ${randomUUID()}`,
    `Reset check ${randomUUID()}`,
  ];
  const responses: string[] = [];
  const duplicateFlags: boolean[] = [];
  // A slow page load or one reply that misses its window should not fail the
  // whole check: each fresh session gets one more try before it counts.
  const probeOnce = async (index: number, prompt: string, attempt: number): Promise<Observation> => {
    if (args.signal?.aborted) throw new Error("target_execution_aborted");
    const controller = new AbortController();
    const started = Date.now();
    try {
      return await invokeWebsite({
        ...args,
        input: {
          schema_version: "1.0",
          case_id: `probe-${index + 1}`,
          case_revision_id: `probe-${index + 1}`,
          messages: [{ role: "user", content: prompt }],
          attachments: [],
          tools: [],
        },
        context: {
          run_id: `probe-${index + 1}`,
          target_revision_id: args.recipe.recipe_revision_id,
          execution_plan_id: `probe-plan-${index + 1}`,
          tenant_scope_handle: "probe",
          deadline: new Date(Date.now() + (args.timeoutMs ?? 30_000)).toISOString(),
          attempt_id: `probe-attempt-${index + 1}`,
          scoped_credential_handle: null,
          destination_policy_id: "public-https-v1",
          reserved_cost: { amount: "0", currency: "EUR" },
          signal: args.signal ?? controller.signal,
        },
      });
    } catch (error) {
      args.onProbeFailed?.({ probe: index + 1, attempt, code: error instanceof Error ? (/^[a-z][a-z0-9_]{2,60}$/.test(error.message) ? error.message : error.name) : "unknown", ms: Date.now() - started });
      if (attempt >= 2 || args.signal?.aborted || (error instanceof Error && ["website_completion_unverified", "website_usage_limit"].includes(error.message))) throw error;
      return probeOnce(index, prompt, attempt + 1);
    }
  };
  for (const [index, prompt] of prompts.entries()) {
    const observation = await probeOnce(index, prompt, 1);
    responses.push(
      [...observation.messages]
        .reverse()
        .find((message) => message.role === "assistant")?.content ?? "",
    );
    args.onResponse?.(responses.at(-1)!);
    duplicateFlags.push((observation.extensions["caudals.evals/browser"] as { duplicate_free?: boolean } | undefined)?.duplicate_free === true);
  }
  const multiTurn = await probeWebsiteFollowUp(args);
  return browserProbeEvidenceSchema.parse({
    checked_at: new Date().toISOString(),
    messages: prompts.map((prompt, index) => ({
      prompt_hash: sha256(prompt),
      response_hash: sha256(responses[index]),
    })),
    distinct_responses: responses[0] !== responses[1],
    reset_verified:
      args.recipe.reset.kind !== "unsupported" &&
      !responses[1].includes(prompts[0]),
    streaming_complete: responses.every(Boolean),
    duplicate_free: duplicateFlags.every(Boolean),
    screenshot_artifact_id: null,
    trace_artifact_id: null,
    multi_turn_verified: multiTurn.verified,
    multi_turn_probe: multiTurn.probe,
  });
}

// Sends a follow-up in the same context as a first message. Multi-turn counts as
// verified only when both turns capture a new, complete, non-duplicated reply;
// any failure leaves the capability unverified instead of failing the recipe.
async function probeWebsiteFollowUp(args: {
  browser: Browser;
  recipe: WebsiteRecipe;
  destinationCheck: DestinationCheck;
  timeoutMs?: number;
  storageState?: BrowserStorageState;
  signal?: AbortSignal;
}) {
  const prompts = [`Conversation check ${randomUUID()}`, `Follow-up check ${randomUUID()}`];
  const controller = new AbortController();
  const context: InvocationContext = {
    run_id: "probe-conversation",
    target_revision_id: args.recipe.recipe_revision_id,
    execution_plan_id: "probe-plan-conversation",
    tenant_scope_handle: "probe",
    deadline: new Date(Date.now() + (args.timeoutMs ?? 30_000)).toISOString(),
    attempt_id: "probe-attempt-conversation",
    scoped_credential_handle: null,
    destination_policy_id: "public-https-v1",
    reserved_cost: { amount: "0", currency: "EUR" },
    signal: args.signal ?? controller.signal,
  };
  const input = (messages: CandidateInput["messages"]): CandidateInput => ({
    schema_version: "1.0", case_id: "probe-conversation", case_revision_id: "probe-conversation", messages, attachments: [], tools: [],
  });
  const reply = (observation: Awaited<ReturnType<typeof invokeOpenWebsite>>) => ({
    text: [...observation.messages].reverse().find((message) => message.role === "assistant")?.content ?? "",
    duplicateFree: (observation.extensions["caudals.evals/browser"] as { duplicate_free?: boolean } | undefined)?.duplicate_free === true,
  });
  let session: Awaited<ReturnType<typeof openWebsiteAttemptSession>> | null = null;
  try {
    session = await openWebsiteAttemptSession({ ...args, signal: context.signal });
    const turnContext = () => ({ ...context, deadline: new Date(Date.now() + (args.timeoutMs ?? 45_000)).toISOString() });
    const first = await session.invoke(input([{ role: "user", content: prompts[0] }]), turnContext());
    const second = await session.invoke(input([...first.messages, { role: "user", content: prompts[1] }]), turnContext());
    const [a, b] = [reply(first), reply(second)];
    const verified = Boolean(a.text && b.text && a.text !== b.text && a.duplicateFree && b.duplicateFree);
    return { verified, probe: verified ? { prompt_hash: sha256(prompts.join("\n")), response_hash: sha256(b.text) } : null };
  } catch {
    return { verified: false, probe: null };
  } finally {
    await session?.close().catch(() => {});
  }
}

export function publicDestinationCheck(lookup?: Lookup): DestinationCheck {
  return async (url) => {
    const parsed = new URL(url);
    if (!/^https:$/.test(parsed.protocol)) throw new Error("destination_invalid");
    await validatePublicDestination(parsed.origin + parsed.pathname, lookup);
  };
}
