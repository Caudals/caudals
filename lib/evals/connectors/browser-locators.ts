import type { ElementHandle, Frame } from "playwright";
import { browserLocatorSchema, type BrowserLocator } from "../contracts/browser";
import { browserLocator } from "./browser-executor";

// Construct only repository-owned scripts. Passing a string function to
// Playwright returns the function rather than invoking it; tsx also decorates
// nested callbacks, so native functions avoid page-side helper references.
// Element evaluations receive (element, arg); frame evaluations receive (arg).
export function pageScript<A, T, B = unknown>(source: string): (arg: A, extra?: B) => T {
  return new Function("arg", "extra", `return (${source})(arg, extra)`) as (arg: A, extra?: B) => T;
}

// Class names that are generated per build (CSS modules, styled-components,
// emotion, hashed utility output) never survive a redeploy of the target app.
const UNSTABLE_CLASS = String.raw`/^(css|sc|jsx|svelte|emotion|chakra|mui|tw|_)-|[0-9a-f]{5,}|\d{3,}|__[A-Za-z0-9_-]{5}$|^[A-Za-z]{1,2}\d|[:\[\]\/@!]|script|style|link|meta|object|embed/i`;

/**
 * Locator candidates for one element, most stable first. Repeatable locators
 * (assistant messages, busy indicators) may match several elements; every
 * other part must resolve to exactly one element in its frame.
 */
export async function resilientLocator(element: ElementHandle<Element>, frame: Frame, repeatable = false): Promise<BrowserLocator> {
  const all = await locatorCandidates(element, frame, repeatable, 1);
  if (!all.length) throw new Error("selector_ambiguous");
  return all[0];
}

export async function locatorCandidates(element: ElementHandle<Element>, frame: Frame, repeatable = false, limit = 4): Promise<BrowserLocator[]> {
  const raw: unknown[] = await element.evaluate(pageScript<Element, unknown[]>(`(el) => {
    const out = [], attr = name => el.getAttribute(name), tag = el.tagName.toLowerCase();
    const quote = value => JSON.stringify(value);
    const unstable = ${UNSTABLE_CLASS};
    if (attr('data-testid')) out.push({kind:'test_id',value:attr('data-testid')});
    const role = attr('role') || ({button:'button',textarea:'textbox'}[tag]) || (tag==='input' && ['submit','button'].includes(attr('type')) ? 'button' : null) || (tag==='input' && !['checkbox','radio','password','hidden','file','image','range','color'].includes(attr('type')) ? 'textbox' : null);
    const labels = Array.from(el.labels || []).map(label => label.textContent.trim()).filter(Boolean);
    const text = (el.textContent || '').trim().replace(/\\s+/g, ' ');
    const name = attr('aria-label') || (attr('aria-labelledby') || '').split(/\\s+/).map(id => document.getElementById(id)?.textContent?.trim() || '').filter(Boolean).join(' ') || labels[0] || (role==='button' && text.length <= 60 ? text : '') || attr('title') || (role==='textbox' ? attr('placeholder') : '') || '';
    if (['button','textbox','dialog','status','log'].includes(role) && name) out.push({kind:'role',role,name:name.slice(0,200)});
    if (labels[0]) out.push({kind:'label',text:labels[0].slice(0,200)});
    for (const name of ['data-message-author-role','data-role','data-author','data-sender','data-test-id','data-qa','data-cy','data-test','name','aria-label','placeholder','title','type']) {
      const value = attr(name); if (value && value.length <= 120 && !(name==='type' && !['submit','button'].includes(value))) out.push({kind:'css',value:tag+'['+name+'='+quote(value)+']'});
    }
    if (el.id && !/\\d{3}|[a-f0-9]{8}|[:.]/i.test(el.id)) out.push({kind:'css',value:'[id='+quote(el.id)+']'});
    if (tag==='iframe' && attr('src')) { try { const url=new URL(attr('src'),location.href);out.push({kind:'css',value:'iframe[src^='+quote(url.origin+url.pathname)+']'});out.push({kind:'css',value:'iframe[src^='+quote(url.origin)+']'}); } catch {} }
    const classes = Array.from(el.classList).filter(cls => cls.length <= 48 && !unstable.test(cls));
    const semantic = classes.filter(cls => /assistant|bot|answer|response|reply|message|msg|markdown|prose|chat|send|submit|input|composer|launcher|bubble|content|text|typing|loading|spinner|stop/i.test(cls));
    for (const cls of semantic) out.push({kind:'css',value:tag+'.'+CSS.escape(cls)});
    if (semantic.length > 1) out.push({kind:'css',value:tag+'.'+semantic.slice(0,2).map(cls => CSS.escape(cls)).join('.')});
    for (const cls of classes.filter(cls => !semantic.includes(cls)).slice(0, 6)) out.push({kind:'css',value:tag+'.'+CSS.escape(cls)});
    if (['textarea','iframe'].includes(tag) || el.isContentEditable) out.push({kind:'css',value:tag+(attr('contenteditable')?'[contenteditable='+quote(attr('contenteditable'))+']':'')});
    if (tag==='input' && role==='textbox') out.push({kind:'css',value:'input[type='+quote(attr('type') || 'text')+']'});
    return out;
  }`));
  const found: BrowserLocator[] = [];
  const seen = new Set<string>();
  await element.evaluate(pageScript<Element, void>("el => el.setAttribute('data-caudals-own','')"));
  try {
    for (const rawValue of raw) {
      const parsed = browserLocatorSchema.safeParse(rawValue);
      if (!parsed.success || seen.has(JSON.stringify(parsed.data))) continue;
      seen.add(JSON.stringify(parsed.data));
      const match = browserLocator(frame, parsed.data);
      const count = await match.count().catch(() => 0);
      if (count !== 1 && !(repeatable && count > 0 && count <= 300)) continue;
      // The candidate must select this element, not a lookalike elsewhere.
      const owns = await match.evaluateAll(pageScript<Element[], boolean>("els => els.some(el => el.hasAttribute('data-caudals-own'))")).catch(() => false);
      if (!owns) continue;
      found.push(parsed.data);
      if (found.length >= limit) break;
    }
  } finally {
    await element.evaluate(pageScript<Element, void>("el => el.removeAttribute('data-caudals-own')")).catch(() => {});
  }
  return found;
}

/** The iframe locators from the top document down to `frame`. */
export async function frameChain(frame: Frame): Promise<BrowserLocator[]> {
  const chain: BrowserLocator[] = [];
  let current = frame;
  for (let depth = 0; current.parentFrame(); depth++) {
    if (depth >= 8) throw new Error("website_frame_unavailable");
    const parent = current.parentFrame()!;
    const element = await current.frameElement();
    try { chain.unshift(await resilientLocator(element as ElementHandle<Element>, parent)); }
    finally { await element.dispose(); }
    current = parent;
  }
  return chain;
}
