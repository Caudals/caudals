import type { Browser, ElementHandle, Frame, Page } from "playwright";
import type { BrowserLocator, WebsiteRecipe } from "../contracts/browser";
import { scopedBrowserStorageState, type BrowserStorageState } from "../contracts/browser";
import { browserLocator, dismissConsent, guardBrowserContext, loginRequired, restoreBrowserSessionStorage, sendWebsitePrompt, trackPageActivity, websiteUsageLimitReached, type PageActivity } from "./browser-executor";
import { frameChain, locatorCandidates, pageScript, resilientLocator } from "./browser-locators";

/**
 * One-pass connector detection. Caudals finds the chat input, its send button
 * and (when the chat is closed) its launcher in every frame, sends one short
 * probe, and learns the reply element and completion signal from what the page
 * actually does. Nothing here runs customer code or bypasses authentication;
 * the caller decides when a human is needed.
 */

export type DetectStep = "find_input" | "open_chat" | "send_probe" | "read_reply" | "verify_fresh";
export type DetectedPart = { locator: BrowserLocator; alternates: BrowserLocator[] };
export type DetectedControls = {
  input: DetectedPart;
  submit: DetectedPart | null;
  launcher: DetectedPart | null;
  reset?: DetectedPart | null;
};
export type DetectedConnector = DetectedControls & {
  response: DetectedPart;
  completion: WebsiteRecipe["completion"];
  reply: string;
};

const MARK = "data-caudals-probe";

// Shared page-side helpers: a shadow-aware walker, visibility and the text an
// element advertises about itself. Kept as plain browser JavaScript.
const PAGE_HELPERS = String.raw`
  const walk = (root, visit, budget = { n: 0 }) => {
    const nodes = root.querySelectorAll('*');
    for (const el of nodes) {
      if (++budget.n > 8000) return;
      visit(el);
      if (el.shadowRoot) walk(el.shadowRoot, visit, budget);
    }
  };
  const visible = el => {
    const rect = el.getBoundingClientRect();
    if (rect.width < 4 || rect.height < 4) return false;
    if (rect.bottom < 0 || rect.right < 0 || rect.top > innerHeight + 4 || rect.left > innerWidth + 4) return false;
    if (el.checkVisibility && !el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return false;
    const style = getComputedStyle(el);
    return style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity) > 0.05;
  };
  const described = el => [el.getAttribute('aria-label'), el.getAttribute('placeholder'), el.getAttribute('title'), el.getAttribute('name'),
    el.id, el.getAttribute('data-testid'), typeof el.className === 'string' ? el.className.slice(0, 160) : '',
    Array.from(el.labels || []).map(label => label.textContent).join(' '), el.getAttribute('aria-describedby') ? (el.getRootNode().getElementById?.(el.getAttribute('aria-describedby'))?.textContent || '') : ''].filter(Boolean).join(' ');
  const ancestry = (el, depth = 8) => { const out = []; let node = el; for (let i = 0; node && i < depth; i++) { node = node.parentElement || node.getRootNode()?.host; if (node && node.nodeType === 1) out.push(node); } return out; };
  const chatWords = /chat|assistant|asistente|bot\b|bot[-_]|conversation|messenger|copilot|widget|intercom|drift|zendesk|crisp|tidio|hubspot|livechat|freshchat|tawk|olark|gorgias|helpcrunch|botpress|voiceflow|landbot|ada-|kommunicate|support/i;
`;

const SCAN_INPUTS = `(frameHint) => {
  ${PAGE_HELPERS}
  for (const el of document.querySelectorAll('[${MARK}]')) el.removeAttribute('${MARK}');
  const inputs = [], launchers = [];
  const ask = /message|mensaje|ask|pregunt|chat|question|prompt|type|escrib|write|anything|help|ayuda|query|consulta|reply|talk|say|copilot|assistant|asistente|bot|send|enviar|how can|cómo|que necesitas/i;
  const reject = /search|buscar|busca|e-?mail|correo|password|contraseña|user ?name|usuario|login|phone|tel[eé]fono|zip|postal|card|tarjeta|coupon|cup[oó]n|newsletter|subscri|first ?name|last ?name|apellido|address|direcci|company|empresa|captcha|otp|code|c[oó]digo/i;
  const frameChat = chatWords.test(frameHint);
  let n = 0;
  walk(document, el => {
    const tag = el.tagName.toLowerCase();
    const type = (el.getAttribute('type') || 'text').toLowerCase();
    const textInput = tag === 'textarea' || el.isContentEditable && el.getAttribute('contenteditable') !== 'false' && !el.parentElement?.isContentEditable ||
      el.getAttribute('role') === 'textbox' || tag === 'input' && ['text', 'search', ''].includes(type);
    if (textInput && visible(el) && !el.disabled && !el.readOnly && el.getAttribute('aria-disabled') !== 'true') {
      const text = described(el);
      const rect = el.getBoundingClientRect();
      let score = 0;
      if (tag === 'textarea') score += 3;
      if (el.isContentEditable) score += 3;
      if (el.getAttribute('role') === 'textbox') score += 1;
      if (ask.test(text)) score += 4;
      if (reject.test(text)) score -= 6;
      if (type === 'search' || el.closest('[role="search"],form[action*="search" i]')) score -= 5;
      if (ancestry(el).some(node => chatWords.test(described(node) + ' ' + (node.getAttribute('role') || '')))) score += 3;
      if (frameChat) score += 2;
      if (rect.bottom > innerHeight * 0.45) score += 1;
      if (rect.width >= 220) score += 1;
      if (document.activeElement === el || el.autofocus) score += 2;
      if (el.closest('form')?.querySelector('input[type="password"]')) score -= 8;
      const id = 'i' + (n++);
      el.setAttribute('${MARK}', id);
      inputs.push({ id, score, area: rect.width * rect.height });
    }
    // Widget launchers are often a plain element with a pointer cursor floating
    // in a corner (an avatar or bubble) rather than a button.
    const floatingWidget = () => {
      if (getComputedStyle(el).cursor !== 'pointer' || (el.parentElement && getComputedStyle(el.parentElement).cursor === 'pointer')) return false;
      const rect = el.getBoundingClientRect();
      if (rect.width < 32 || rect.width > 180 || rect.height < 32 || rect.height > 180) return false;
      return rect.top > innerHeight * 0.5 && (rect.left > innerWidth * 0.6 || rect.right < innerWidth * 0.4) &&
        [el, ...ancestry(el, 4)].some(node => getComputedStyle(node).position === 'fixed');
    };
    const clickable = tag === 'button' || tag === 'a' || el.getAttribute('role') === 'button' || el.hasAttribute('aria-haspopup') || tag === 'iframe' ||
      (['div', 'span', 'img', 'svg', 'figure', 'picture'].includes(tag) || tag.includes('-')) && floatingWidget();
    if (clickable && visible(el)) {
      const own = (el.innerText || '').trim().slice(0, 80);
      const img = el.querySelector('img[alt],svg[aria-label],svg title');
      const text = described(el) + ' ' + own + ' ' + (img?.getAttribute?.('alt') || img?.getAttribute?.('aria-label') || img?.textContent || '');
      const rect = el.getBoundingClientRect();
      const fixed = [el, ...ancestry(el, 6)].some(node => ['fixed', 'sticky'].includes(getComputedStyle(node).position));
      let score = 0;
      if (/chat|assistant|asistente|help|ayuda|support|soporte|ask|pregunt|\bbot\b|message|mensaje|copilot|\bai\b|\bia\b|conversation|conversa|habla|talk|contact us|cont[aá]ct/i.test(text)) score += 5;
      if (chatWords.test(text)) score += 2;
      if (fixed) score += 3;
      if (fixed && rect.left > innerWidth * 0.55 && rect.top > innerHeight * 0.45) score += 3;
      if (rect.width >= 32 && rect.width <= 96 && rect.height >= 32 && rect.height <= 96) score += 1;
      if (frameChat) score += 3;
      if (tag === 'iframe') score -= 2;
      if (tag === 'a' && /^(https?:|\\/)/.test(el.getAttribute('href') || '') && !/chat|assistant|bot|copilot|ask/i.test(el.getAttribute('href') || '')) score -= 4;
      // A link to another page (an article about chat, a sales form) ranks
      // below an in-page widget; a chat page link can still win when alone.
      if (tag === 'a') { try { const url = new URL(el.getAttribute('href') || '#', location.href); if (url.origin !== location.origin || url.pathname !== location.pathname) score -= 3; } catch {} }
      if (/cookie|accept|reject|aceptar|rechazar|privacy|privacidad|close|cerrar|menu|login|sign in|iniciar/i.test(text)) score -= 6;
      if (score >= 5) { const id = 'l' + (n++); el.setAttribute('${MARK}', id); launchers.push({ id, score }); }
    }
  });
  return { inputs, launchers };
}`;

// Ranks clickable elements around the chosen input. The search widens one
// ancestor at a time and stops at the first level holding a likely Send.
const SCAN_SUBMIT = `(inputId) => {
  ${PAGE_HELPERS}
  const input = (() => { let found = null; walk(document, el => { if (!found && el.getAttribute('${MARK}') === inputId) found = el; }); return found; })();
  if (!input) return [];
  const box = input.getBoundingClientRect();
  const results = [];
  let scope = input, n = 0;
  for (let depth = 0; depth < 7 && scope; depth++) {
    scope = scope.parentElement || scope.getRootNode()?.host;
    if (!scope) break;
    const seen = new Set(results.map(item => item.el));
    const candidates = [];
    walk(scope, el => { if (!seen.has(el)) candidates.push(el); });
    if (scope.shadowRoot) walk(scope.shadowRoot, el => candidates.push(el));
    for (const el of candidates) {
      const tag = el.tagName.toLowerCase();
      if (!(tag === 'button' || el.getAttribute('role') === 'button' || tag === 'input' && ['submit', 'button', 'image'].includes(el.getAttribute('type')))) continue;
      if (el === input || el.contains(input) || !visible(el)) continue;
      const text = described(el) + ' ' + (el.innerText || el.value || '').trim().slice(0, 40) + ' ' + (el.querySelector('svg')?.getAttribute('aria-label') || '');
      if (/attach|adjunt|upload|subir|file|archivo|mic|voice|voz|audio|emoji|record|grabar|clear|limpiar|close|cerrar|minimi|menu|setting|ajuste|option|more|más|feedback|like|copy|copiar|new chat|nuevo|history|historial|expand|share/i.test(text)) continue;
      const rect = el.getBoundingClientRect();
      let score = 0;
      if (/send|enviar|submit|ask|pregunt|go\\b|arrow|➤|→|paper ?plane|plane|ir\\b/i.test(text)) score += 6;
      if ((el.getAttribute('type') || '').toLowerCase() === 'submit') score += 4;
      if (el.querySelector('svg') && !(el.innerText || '').trim()) score += 1;
      const dx = rect.left - box.right, dy = rect.top - box.top;
      if (dx >= -box.width * 0.2 && Math.abs(dy) < Math.max(80, box.height * 1.5)) score += 2;
      const distance = Math.hypot(rect.left + rect.width / 2 - box.right, rect.top + rect.height / 2 - (box.top + box.height / 2));
      const id = 's' + (n++);
      el.setAttribute('${MARK}', id);
      results.push({ el, id, score: score - Math.min(3, distance / 250) });
    }
    if (results.some(item => item.score >= 4)) break;
  }
  return results.map(({ id, score }) => ({ id, score })).sort((a, b) => b.score - a.score).slice(0, 4);
}`;

const CLEAR_MARKS = `() => { const clear = root => { for (const el of root.querySelectorAll('[${MARK}],[data-caudals-reply],[data-caudals-busy],[data-caudals-stop],[data-caudals-user]')) { for (const name of ['${MARK}', 'data-caudals-reply', 'data-caudals-busy', 'data-caudals-stop', 'data-caudals-user']) el.removeAttribute(name); } for (const el of root.querySelectorAll('*')) if (el.shadowRoot) clear(el.shadowRoot); }; clear(document); }`;

// Records what the page adds or changes after the probe is sent, including
// inside open shadow roots present at install time.
const OBSERVE = `() => {
  const state = window.__caudalsProbe = { added: new Set(), changed: new Set(), toggled: new Set(), last: performance.now(), observers: [] };
  const note = node => { state.last = performance.now(); };
  const observe = root => {
    const observer = new MutationObserver(records => {
      for (const record of records) {
        note();
        if (record.type === 'childList') for (const node of record.addedNodes) { if (node.nodeType === 1) state.added.add(node); else if (node.parentElement) state.changed.add(node.parentElement); }
        else if (record.type === 'characterData' && record.target.parentElement) state.changed.add(record.target.parentElement);
        else if (record.type === 'attributes') state.toggled.add(record.target);
      }
    });
    // Attribute changes reveal indicators that exist all along and are only shown while busy.
    observer.observe(root, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['hidden', 'class', 'style', 'aria-busy', 'aria-hidden'] });
    state.observers.push(observer);
  };
  observe(document);
  for (const el of document.querySelectorAll('*')) if (el.shadowRoot) observe(el.shadowRoot);
}`;

// Finds the reply: the largest region added after the probe that does not
// hold the user's own message, narrowed to the block holding nearly all of it.
// The user's message is the element whose text is exactly the prompt, so an
// assistant that echoes the question is still recognised as the assistant.
const READ_REPLY = `(prompt) => {
  ${PAGE_HELPERS}
  const state = window.__caudalsProbe;
  if (!state) return null;
  const normal = value => (value || '').replace(/\\s+/g, ' ').trim();
  const wanted = normal(prompt), snippet = wanted.slice(0, 32);
  const parentOf = node => node.parentElement || (node.getRootNode && node.getRootNode().host) || null;
  const isNew = node => { for (let cur = node, i = 0; cur && i < 60; cur = parentOf(cur), i++) if (state.added.has(cur)) return true; return false; };
  const text = el => (el.innerText || el.textContent || '').trim();
  const input = document.querySelector('[data-caudals-input]');
  // Conversation titles, menus and navigation can change in response to the
  // prompt too. They are not replies, even when longer than the assistant.
  // A widget may itself live in an aside, so keep the panel with the composer.
  const outsideChat = el => {
    for (const node of [el, ...ancestry(el, 12)]) {
      if (input && node.contains(input)) break;
      if (node.matches('nav,aside,[role="navigation"],[role="complementary"],[role="dialog"],[aria-modal="true"]') ||
          /sidebar|conversation[-_ ]?(list|title)|chat[-_ ]?list|history[-_ ]?list|modal|overlay|announcement|promo|popover/i.test(described(node))) return true;
    }
    return !!el.closest('button,a,[role="button"],[role="menuitem"],[role="option"]');
  };
  const touched = [...state.added, ...state.changed].filter(el => el.isConnected && el.nodeType === 1 && !(input && (el.contains(input) || input.contains(el))));
  let users = [];
  for (const el of touched) walk(el, child => { if (normal(child.textContent) === wanted) users.push(child); });
  for (const el of touched) if (normal(el.textContent) === wanted) users.push(el);
  if (!users.length) for (const el of touched) { const value = normal(el.textContent); if (value.includes(snippet) && value.length <= wanted.length + 20) users.push(el); }
  for (const el of document.querySelectorAll('[data-caudals-user]')) el.removeAttribute('data-caudals-user');
  for (const el of users) el.setAttribute('data-caudals-user', '');
  const holdsUser = el => users.some(user => el === user || el.contains(user) || user.contains(el));
  const tops = new Set();
  for (const el of touched) {
    if (holdsUser(el) || outsideChat(el)) continue;
    let top = el;
    for (let parent = parentOf(top); parent && parent !== document.body && parent !== document.documentElement && isNew(parent) && !holdsUser(parent) && !(input && parent.contains(input)); parent = parentOf(parent)) top = parent;
    tops.add(top);
  }
  let best = null, bestLength = 0;
  for (const top of tops) {
    const value = text(top);
    if (value.length > bestLength && visible(top) && !outsideChat(top)) { best = top; bestLength = value.length; }
  }
  for (const el of document.querySelectorAll('[data-caudals-reply],[data-caudals-busy],[data-caudals-stop]')) { el.removeAttribute('data-caudals-reply'); el.removeAttribute('data-caudals-busy'); el.removeAttribute('data-caudals-stop'); }
  let reply = '';
  if (best) {
    let current = best;
    for (let i = 0; i < 12; i++) {
      const children = Array.from(current.children).filter(child => text(child));
      const largest = children.sort((a, b) => text(b).length - text(a).length)[0];
      if (!largest || ['P', 'SPAN', 'LI', 'STRONG', 'EM', 'B', 'I', 'CODE', 'A', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'PRE', 'BR'].includes(largest.tagName)) break;
      if (text(largest).length < text(current).length * 0.85) break;
      current = largest;
    }
    current.setAttribute('data-caudals-reply', '');
    reply = text(current);
  }
  let busy = false, stop = false;
  const busyWords = /typing|loading|spinner|thinking|generat|dots|pending|writing|escribiendo|pensando|cargando|progress|streaming/i;
  walk(document, el => {
    if (!visible(el)) return;
    const label = (el.getAttribute('aria-label') || '') + ' ' + (el.getAttribute('title') || '') + ' ' + (el.tagName === 'BUTTON' ? (el.innerText || '').trim().slice(0, 30) : '');
    if (!stop && (el.tagName === 'BUTTON' || el.getAttribute('role') === 'button') && /\\bstop|detener|parar|cancel(ar)?\\b|abort/i.test(label)) { el.setAttribute('data-caudals-stop', ''); stop = true; }
    if (!busy && (isNew(el) || state.toggled.has(el) || (parentOf(el) && state.toggled.has(parentOf(el)))) && !(best && (best.contains(el) || el.contains(best))) && (el.getAttribute('aria-busy') === 'true' || el.getAttribute('role') === 'progressbar' || busyWords.test((typeof el.className === 'string' ? el.className : '') + ' ' + label + ' ' + (el.getAttribute('data-testid') || '')))) { el.setAttribute('data-caudals-busy', ''); busy = true; }
  });
  return { reply, quietFor: performance.now() - state.last, busy, stop };
}`;

const STOP_OBSERVING = `() => { const state = window.__caudalsProbe; if (state) for (const observer of state.observers) observer.disconnect(); delete window.__caudalsProbe; }`;

function liveFrames(page: Page) {
  return page.frames().filter(frame => !frame.isDetached());
}

async function evaluateIn<T, A = undefined>(frame: Frame, source: string, arg?: A): Promise<T | null> {
  try { return await frame.evaluate(pageScript<unknown, T>(source) as (arg: unknown) => T, arg as unknown); }
  catch { return null; }
}

async function marked(frame: Frame, id: string) {
  const handle = await frame.locator(`[${MARK}="${id}"]`).first().elementHandle({ timeout: 1_000 }).catch(() => null);
  return handle as ElementHandle<Element> | null;
}

async function describePart(handle: ElementHandle<Element>, frame: Frame, repeatable = false): Promise<DetectedPart> {
  const chain = await frameChain(frame);
  const found = await locatorCandidates(handle, frame, repeatable, 4);
  if (!found.length) throw new Error("selector_ambiguous");
  const scoped = found.map(value => ({ ...value, frames: chain }));
  return { locator: scoped[0], alternates: scoped.slice(1, 4) };
}

async function scan(page: Page) {
  const inputs: Array<{ frame: Frame; id: string; score: number; area: number }> = [];
  const launchers: Array<{ frame: Frame; id: string; score: number }> = [];
  for (const frame of liveFrames(page)) {
    const result = await evaluateIn<{ inputs: Array<{ id: string; score: number; area: number }>; launchers: Array<{ id: string; score: number }> }, string>(frame, SCAN_INPUTS, frame.url());
    if (!result) continue;
    for (const item of result.inputs) inputs.push({ frame, ...item });
    for (const item of result.launchers) launchers.push({ frame, ...item });
  }
  inputs.sort((a, b) => b.score - a.score || b.area - a.area);
  launchers.sort((a, b) => b.score - a.score);
  // A single visible text box is the chat unless it is clearly something else.
  const chosen = inputs.find(item => item.score >= 3) ?? (inputs.length === 1 && inputs[0].score >= 0 ? inputs[0] : null);
  return { input: chosen, launchers };
}

async function waitForInput(page: Page, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const result = await scan(page);
    if (result.input || Date.now() >= deadline) return result;
    await page.waitForTimeout(400);
  }
}

/** Finds the chat controls on the live page, opening the chat when it is closed. */
export async function detectChatControls(page: Page, options: { onStep?: (step: DetectStep) => void; signal?: AbortSignal } = {}): Promise<DetectedControls> {
  options.onStep?.("find_input");
  await dismissConsent(page);
  let result = await waitForInput(page, 4_000);
  // A consent dialog that appeared late still blocks the launcher.
  if (!result.input && await dismissConsent(page)) result = await waitForInput(page, 2_000);
  let launcher: DetectedPart | null = null;
  if (!result.input) {
    options.onStep?.("open_chat");
    const origin = page.url();
    const tried = new Set<string>();
    for (let clicks = 0; clicks < 5 && !result.input; clicks++) {
      if (options.signal?.aborted) throw new Error("target_execution_aborted");
      // Candidates are re-read after every click: a page we came back to has new elements.
      let next: { candidate: (typeof result.launchers)[number]; handle: ElementHandle<Element>; signature: string } | null = null;
      for (const candidate of result.launchers.slice(0, 8)) {
        const handle = await marked(candidate.frame, candidate.id);
        if (!handle) continue;
        const signature = candidate.frame.url() + "|" + await handle.evaluate(pageScript<Element, string>("el => [el.tagName, el.id, el.getAttribute('aria-label'), el.getAttribute('href'), typeof el.className === 'string' ? el.className : '', (el.textContent || '').trim().slice(0, 60)].join('|')")).catch(() => "");
        if (tried.has(signature)) { await handle.dispose(); continue; }
        next = { candidate, handle, signature };
        break;
      }
      if (!next) break;
      tried.add(next.signature);
      let described: DetectedPart | null = null;
      try { described = await describePart(next.handle, next.candidate.frame); } catch { /* clicked but not recordable */ }
      const before = page.url();
      const clicked = await next.handle.click({ timeout: 5_000 }).then(() => true, () => false);
      await next.handle.dispose();
      if (clicked) result = await waitForInput(page, 6_000);
      if (result.input) {
        // A launcher that navigated to a chat page is replaced by that page's URL.
        launcher = page.url() === before ? described : null;
        break;
      }
      // The click led somewhere without a chat (an article, a sales form): go back and try the next candidate.
      if (page.url() !== origin) {
        await page.goto(origin, { waitUntil: "domcontentloaded", timeout: 30_000 }).catch(() => {});
        await page.waitForLoadState("load", { timeout: 8_000 }).catch(() => {});
        await page.waitForTimeout(1_000);
        await dismissConsent(page);
      }
      result = await waitForInput(page, 1_500);
    }
  }
  if (!result.input) throw new Error("chat_input_not_found");
  const inputHandle = await marked(result.input.frame, result.input.id);
  if (!inputHandle) throw new Error("chat_input_not_found");
  try {
    const input = await describePart(inputHandle, result.input.frame);
    const sends = await evaluateIn<Array<{ id: string; score: number }>, string>(result.input.frame, SCAN_SUBMIT, result.input.id) ?? [];
    let submit: DetectedPart | null = null;
    for (const send of sends.filter(item => item.score >= 2)) {
      const handle = await marked(result.input.frame, send.id);
      if (!handle) continue;
      try { submit = await describePart(handle, result.input.frame); break; }
      catch { /* not uniquely addressable; Enter remains */ }
      finally { await handle.dispose(); }
    }
    return { input, submit, launcher, reset: await detectResetFor(page) };
  } finally {
    await inputHandle.dispose();
    for (const frame of liveFrames(page)) await evaluateIn(frame, CLEAR_MARKS);
  }
}

function partLocator(page: Page, value: BrowserLocator) {
  let root: Page | ReturnType<Page["frameLocator"]> = page;
  for (const frame of value.frames ?? []) root = browserLocator(root, frame).contentFrame();
  return browserLocator(root, value);
}

/** Locators that select every assistant reply, with the new reply last and no user text. */
async function replyLocators(page: Page, frame: Frame, handle: ElementHandle<Element>, reply: string): Promise<DetectedPart> {
  const chain = await frameChain(frame);
  const levels: Array<ElementHandle<Element>> = [handle];
  for (let i = 0; i < 4; i++) {
    const parent = await levels.at(-1)!.evaluateHandle(pageScript<Element, Element | null>("el => el.parentElement")).then(value => value.asElement() as ElementHandle<Element> | null);
    if (!parent) break;
    const contains = await parent.evaluate(pageScript<Element, boolean>("el => !!el.querySelector('[data-caudals-user],[data-caudals-input]') || !!el.closest('[data-caudals-user]')")).catch(() => true);
    if (contains) { await parent.dispose(); break; }
    levels.push(parent);
  }
  const accepted: BrowserLocator[] = [];
  const normalized = (value: string) => value.replace(/\s+/g, " ").trim();
  const target = normalized(reply);
  try {
    for (const level of levels) {
      for (const candidate of await locatorCandidates(level, frame, true, 6)) {
        if (candidate.kind === "role" || candidate.kind === "label") continue;
        const scoped = { ...candidate, frames: chain };
        const match = partLocator(page, scoped);
        // Every match must be an assistant message: none may hold, or sit
        // inside, the user's own message.
        const texts = await match.evaluateAll(pageScript<Element[], string[] | null>("els => els.some(el => el.matches('[data-caudals-user]') || el.querySelector('[data-caudals-user],[data-caudals-input]') || el.closest('[data-caudals-user]')) ? null : els.map(el => (el.innerText || el.textContent || ''))")).catch(() => null);
        if (!texts?.length) continue;
        const last = normalized(texts.at(-1)!);
        if (!last.includes(target.slice(0, 200)) || last.length > target.length * 1.6 + 80) continue;
        if (!accepted.some(value => JSON.stringify(value) === JSON.stringify(scoped))) accepted.push(scoped);
        if (accepted.length >= 4) break;
      }
      if (accepted.length >= 4) break;
    }
  } finally {
    for (const level of levels.slice(1)) await level.dispose();
  }
  if (!accepted.length) throw new Error("response_not_identified");
  // Assistant-specific attributes and message classes beat generic ones.
  const rank = (value: BrowserLocator) => value.kind === "test_id" ? 1 : value.kind === "css" && /assistant|bot|answer|response|reply|markdown|prose/i.test(value.value) ? 0 : value.kind === "css" && /message|msg|bubble|content/i.test(value.value) ? 2 : 3;
  accepted.sort((a, b) => rank(a) - rank(b));
  return { locator: accepted[0], alternates: accepted.slice(1) };
}

async function signalLocator(page: Page, attribute: "data-caudals-busy" | "data-caudals-stop"): Promise<BrowserLocator | null> {
  for (const frame of liveFrames(page)) {
    const handle = await frame.locator(`[${attribute}]`).first().elementHandle({ timeout: 300 }).catch(() => null) as ElementHandle<Element> | null;
    if (!handle) continue;
    try {
      const chain = await frameChain(frame);
      for (const candidate of await locatorCandidates(handle, frame, true, 4)) {
        // A completion signal must not stay matched by an always-visible element.
        const scoped = { ...candidate, frames: chain };
        const count = await partLocator(page, scoped).count().catch(() => 99);
        if (count <= 3) return scoped;
      }
    } catch { /* fall through to the next frame */ }
    finally { await handle.dispose(); }
  }
  return null;
}

async function readReply(page: Page, prompt: string) {
  let best: { frame: Frame; reply: string; quietFor: number; busy: boolean; stop: boolean } | null = null;
  let busy = false, stop = false, quietFor = Infinity;
  for (const frame of liveFrames(page)) {
    const value = await evaluateIn<{ reply: string; quietFor: number; busy: boolean; stop: boolean }, string>(frame, READ_REPLY, prompt);
    if (!value) continue;
    busy ||= value.busy; stop ||= value.stop; quietFor = Math.min(quietFor, value.quietFor);
    if (value.reply && (!best || value.reply.length > best.reply.length)) best = { frame, ...value };
  }
  return { best, busy, stop, quietFor };
}

/**
 * Sends one probe through the detected controls and learns the reply locator
 * and the most reliable completion signal the page exposes.
 */
export async function probeChatReply(page: Page, controls: DetectedControls, options: { prompt?: string; timeoutMs?: number; onStep?: (step: DetectStep) => void; signal?: AbortSignal; activity?: PageActivity } = {}): Promise<DetectedConnector> {
  const prompt = options.prompt ?? "Hello! Please reply with one short sentence so we can confirm this connection works.";
  const activity = options.activity ?? trackPageActivity(page);
  const deadline = Date.now() + (options.timeoutMs ?? 75_000);
  const submitLocator = controls.submit ? partLocator(page, controls.submit.locator) : null;
  try {
    for (const frame of liveFrames(page)) await evaluateIn(frame, OBSERVE);
    await partLocator(page, controls.input.locator).first().evaluate(pageScript<Element, void>("el => el.setAttribute('data-caudals-input', '')")).catch(() => {});
    options.onStep?.("send_probe");
    const sentAt = Date.now();
    activity.mark();
    await sendWebsitePrompt(page, { input: controls.input.locator, submit: controls.submit?.locator ?? null }, prompt);
    options.onStep?.("read_reply");
    let reply = "", changedAt = Date.now();
    let sawBusy = false, sawStop = false, sendDisabled = false;
    let busyLocator: BrowserLocator | null = null, stopLocator: BrowserLocator | null = null;
    let replyFrame: Frame | null = null;
    while (Date.now() < deadline) {
      if (options.signal?.aborted) throw new Error("target_execution_aborted");
      for (const frame of liveFrames(page)) if (await websiteUsageLimitReached(frame)) throw new Error("website_usage_limit");
      const state = await readReply(page, prompt);
      if (state.stop && !stopLocator) { sawStop = true; stopLocator = await signalLocator(page, "data-caudals-stop"); }
      if (state.busy && !busyLocator) { sawBusy = true; busyLocator = await signalLocator(page, "data-caudals-busy"); }
      if (submitLocator && !(await submitLocator.first().isEnabled({ timeout: 200 }).catch(() => true))) sendDisabled = true;
      const value = state.best?.reply ?? "";
      if (value !== reply) { reply = value; changedAt = Date.now(); replyFrame = state.best?.frame ?? null; }
      const stableFor = Date.now() - changedAt;
      const networkQuiet = activity.inflight() === 0 && Date.now() - activity.lastActivity() >= 1_000;
      const signalsClear = !state.busy && !state.stop;
      if (reply && signalsClear && ((stableFor >= 1_800 && networkQuiet && state.quietFor >= 1_200) || stableFor >= 8_000)) break;
      await page.waitForTimeout(250);
    }
    if (!reply || !replyFrame) throw new Error(Date.now() - sentAt < 5_000 ? "submit_unverified" : "response_not_identified");
    const handle = await replyFrame.locator("[data-caudals-reply]").first().elementHandle({ timeout: 1_000 }) as ElementHandle<Element> | null;
    if (!handle) throw new Error("response_not_identified");
    let response: DetectedPart;
    try { response = await replyLocators(page, replyFrame, handle, reply); }
    finally { await handle.dispose(); }
    let completion: WebsiteRecipe["completion"] = { kind: "quiescent", quiet_ms: 1_500 };
    const hidden = async (value: BrowserLocator | null) => !!value && !(await partLocator(page, value).first().isVisible().catch(() => false));
    if (sawStop && await hidden(stopLocator)) completion = { kind: "selector_hidden", locator: stopLocator! };
    else if (sawBusy && await hidden(busyLocator)) completion = { kind: "selector_hidden", locator: busyLocator! };
    else if (sendDisabled && controls.submit && await submitLocator!.first().isEnabled({ timeout: 500 }).catch(() => false)) completion = { kind: "send_enabled", locator: controls.submit.locator };
    return { ...controls, response, completion, reply };
  } finally {
    for (const frame of liveFrames(page)) {
      await evaluateIn(frame, STOP_OBSERVING);
      await evaluateIn(frame, `() => { for (const el of document.querySelectorAll('[data-caudals-input]')) el.removeAttribute('data-caudals-input'); }`);
      await evaluateIn(frame, CLEAR_MARKS);
    }
    if (!options.activity) activity.dispose();
  }
}

/** On a freshly loaded page, finds a launcher that reveals the given input. */
export async function detectLauncherFor(page: Page, input: BrowserLocator, timeoutMs = 20_000): Promise<DetectedPart | null> {
  const target = partLocator(page, input).first();
  const deadline = Date.now() + timeoutMs;
  if (await target.isVisible().catch(() => false)) return null;
  if (await dismissConsent(page) && await target.waitFor({ state: "visible", timeout: 3_000 }).then(() => true, () => false)) return null;
  try {
    const { launchers } = await scan(page);
    for (const candidate of launchers.slice(0, 4)) {
      if (Date.now() > deadline) break;
      const handle = await marked(candidate.frame, candidate.id);
      if (!handle) continue;
      try {
        const described = await describePart(handle, candidate.frame).catch(() => null);
        await handle.click({ timeout: 5_000 });
        if (await target.waitFor({ state: "visible", timeout: 6_000 }).then(() => true, () => false)) {
          if (!described) throw new Error("selector_ambiguous");
          return described;
        }
      } catch (error) { if (error instanceof Error && error.message === "selector_ambiguous") throw error; }
      finally { await handle.dispose(); }
    }
  } finally {
    for (const frame of liveFrames(page)) await evaluateIn(frame, CLEAR_MARKS);
  }
  throw new Error("chat_launcher_not_found");
}

// Keep opening a widget separate from starting a new conversation. These
// explicit actions are safe to learn without clicking arbitrary navigation.
const NEW_CHAT = /^(?:[+＋]\s*)?(?:new\s+(?:chat|conversation|session)|start\s+(?:a\s+)?new\s+(?:chat|conversation)|nuevo\s+chat|nueva\s+(?:conversaci[oó]n|sesi[oó]n)|iniciar\s+(?:una\s+)?(?:nueva\s+conversaci[oó]n|nuevo\s+chat))(?:\s*[+＋])?$/i;
export async function isNewConversationControl(page: Page, value: BrowserLocator) {
  const match = partLocator(page, value);
  if (await match.count().catch(() => 0) !== 1) return false;
  const label = await match.evaluate(pageScript<Element, string>(
    "el => (el.getAttribute('aria-label') || el.getAttribute('title') || el.innerText || el.textContent || '').trim()",
  )).catch(() => "");
  return NEW_CHAT.test(label);
}
export async function detectResetFor(page: Page): Promise<DetectedPart | null> {
  for (const frame of liveFrames(page)) {
    const candidates = frame.locator('button,[role="button"],a');
    const labels = await candidates.evaluateAll(pageScript<Element[], string[]>(
      "els => els.slice(0,150).map(el => (el.getAttribute('aria-label') || el.getAttribute('title') || el.innerText || el.textContent || '').trim())",
    )).catch(() => []);
    for (const [index, label] of labels.entries()) {
      if (!NEW_CHAT.test(label)) continue;
      const match = candidates.nth(index);
      if (!await match.isVisible().catch(() => false)) continue;
      const handle = await match.elementHandle();
      if (!handle) continue;
      try {
        const described = await describePart(handle as ElementHandle<Element>, frame).catch(() => null);
        if (described) return described;
      }
      finally { await handle.dispose(); }
    }
  }
  return null;
}

export { resilientLocator };

/** A recipe from detected controls; the caller validates it before use. */
export function recipeFromDetection(detected: DetectedConnector, pageUrl: string, source: WebsiteRecipe["source"], recipeRevisionId: string): Omit<WebsiteRecipe, "content_hash"> {
  const url = new URL(pageUrl);
  url.search = ""; url.username = ""; url.password = "";
  if (!/^#!?\/[A-Za-z0-9/_~.-]{0,200}$/.test(url.hash)) url.hash = "";
  const alternates = {
    ...(detected.launcher?.alternates.length ? { launcher: detected.launcher.alternates } : {}),
    ...(detected.input.alternates.length ? { input: detected.input.alternates } : {}),
    ...(detected.submit?.alternates.length ? { submit: detected.submit.alternates } : {}),
    ...(detected.response.alternates.length ? { assistant_message: detected.response.alternates } : {}),
    ...(detected.reset?.alternates.length ? { reset: detected.reset.alternates } : {}),
  };
  return {
    schema_version: "1.0", recipe_revision_id: recipeRevisionId, source, start_url: url.toString(),
    launcher: detected.launcher?.locator ?? null, frame_chain: [], input: detected.input.locator,
    submit: detected.submit ? { kind: "click", locator: detected.submit.locator } : { kind: "press_enter" },
    message_container: detected.response.locator, assistant_message: detected.response.locator,
    completion: detected.completion, reset: detected.reset ? { kind: "click", locator: detected.reset.locator } : { kind: "new_context" }, assistant_extraction: "last_new_message",
    created_at: new Date().toISOString(),
    extensions: { "caudals.evals/teach": { version: 2, detected: true, ...(Object.keys(alternates).length ? { alternates } : {}) } },
  };
}

/**
 * Unattended detection for the background connection check: a fresh context
 * (with the saved login, if any), the same detection a person would trigger.
 */
export async function autoDetectWebsiteRecipe(args: {
  browser: Browser;
  url: string;
  destinationCheck: (url: string) => Promise<void>;
  storageState?: BrowserStorageState;
  recipeRevisionId: string;
  signal?: AbortSignal;
  onStep?: (step: DetectStep) => void;
}) {
  if (args.signal?.aborted) throw new Error("target_execution_aborted");
  await args.destinationCheck(args.url);
  const context = await args.browser.newContext({
    viewport: { width: 1280, height: 800 }, acceptDownloads: false, serviceWorkers: "block",
    ...(args.storageState ? { storageState: scopedBrowserStorageState(args.storageState, args.url) } : {}),
  });
  const abort = () => { void context.close().catch(() => {}); };
  args.signal?.addEventListener("abort", abort, { once: true });
  if (args.signal?.aborted) abort();
  try {
    await guardBrowserContext(context, args.destinationCheck);
    await restoreBrowserSessionStorage(context, args.storageState);
    const page = await context.newPage();
    page.setDefaultTimeout(10_000);
    await page.goto(args.url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForLoadState("load", { timeout: 10_000 }).catch(() => {});
    await page.waitForTimeout(1_500);
    let controls: DetectedControls;
    try { controls = await detectChatControls(page, { signal: args.signal, onStep: args.onStep }); }
    catch (error) { if (await loginRequired(page, args.url)) throw new Error("login_required"); throw error; }
    // Freeze the composer URL before a probe creates a conversation URL.
    const startUrl = page.url();
    const detected = await probeChatReply(page, controls, { signal: args.signal, onStep: args.onStep });
    return recipeFromDetection(detected, startUrl, "known_recipe", args.recipeRevisionId);
  } finally {
    args.signal?.removeEventListener("abort", abort);
    await context.close().catch(() => {});
  }
}
