import type { ElementHandle, Frame, Page } from "playwright";
import { browserLocatorSchema, type BrowserLocator } from "../../lib/evals/contracts/browser";
import { browserLocator } from "../../lib/evals/connectors/browser-executor";

// Construct only repository-owned scripts. Passing a string function to
// Playwright returns the function rather than invoking it; tsx also decorates
// nested callbacks, so native functions avoid page-side helper references.
function elementScript<T>(source: string): (element: Element) => T {
  return new Function("el", `return (${source})(el)`) as (element: Element) => T;
}

export async function resilientLocator(element: ElementHandle<Element>, frame: Frame, repeatable = false): Promise<BrowserLocator> {
  const raw: unknown[] = await element.evaluate(elementScript<unknown[]>(`(el) => {
    const out = [], attr = name => el.getAttribute(name), tag = el.tagName.toLowerCase();
    const quote = value => JSON.stringify(value);
    if (attr('data-testid')) out.push({kind:'test_id',value:attr('data-testid')});
    const role = attr('role') || ({button:'button',textarea:'textbox'}[tag]) || (tag==='input' && !['submit','button','checkbox','radio','password','hidden'].includes(attr('type')) ? 'textbox' : null);
    const labels = Array.from(el.labels || []).map(label => label.textContent.trim()).filter(Boolean);
    const name = attr('aria-label') || (attr('aria-labelledby') || '').split(/\s+/).map(id => document.getElementById(id)?.textContent?.trim() || '').filter(Boolean).join(' ') || labels[0] || (tag==='button' ? el.textContent.trim() : '');
    if (['button','textbox','dialog','status','log'].includes(role)) out.push({kind:'role',role,name:name || null});
    if (labels[0]) out.push({kind:'label',text:labels[0]});
    for (const name of ['data-message-author-role','data-role','data-cy','data-test','name','aria-label','placeholder','title']) if(attr(name)) out.push({kind:'css',value:tag+'['+name+'='+quote(attr(name))+']'});
    if (el.id && !/\d{4}|[a-f0-9]{8}|:/.test(el.id)) out.push({kind:'css',value:'[id='+quote(el.id)+']'});
    if (tag==='iframe' && attr('src')) { try { const url=new URL(attr('src'),location.href);out.push({kind:'css',value:'iframe[src^='+quote(url.origin+url.pathname)+']'}); } catch {} }
    for (const cls of el.classList) if(/assistant|response|message|chat|send|input|launcher/i.test(cls) && !/\d{4}/.test(cls)) out.push({kind:'css',value:tag+'.'+CSS.escape(cls)});
    if (['textarea','iframe'].includes(tag) || attr('contenteditable')==='true') out.push({kind:'css',value:tag+(attr('contenteditable')==='true'?'[contenteditable="true"]':'')});
    return out;
  }`));
  for (const rawValue of raw) {
    const parsed = browserLocatorSchema.safeParse(rawValue);
    if (!parsed.success) continue;
    const match = browserLocator(frame, parsed.data);
    const count = await match.count();
    if (count === 1 || (repeatable && count > 0 && parsed.data.kind === "css")) return parsed.data;
  }
  throw new Error("selector_ambiguous");
}

export async function selectAt(page: Page, x: number, y: number, response = false) {
  let frame = page.mainFrame();
  const frames: BrowserLocator[] = [];
  const globalX = x, globalY = y;
  for (let depth = 0; depth <= 8; depth++) {
    const handle = await frame.evaluateHandle(`(([x,y]) => {
      let el=document.elementFromPoint(x,y);
      while (el?.shadowRoot) { const inner=el.shadowRoot.elementFromPoint(x,y); if(!inner || inner===el) break;el=inner; }
      return el;
    })(${JSON.stringify([x,y])})`);
    const element = handle.asElement() as ElementHandle<Element> | null;
    if (!element) { await handle.dispose(); throw new Error("selector_unavailable"); }
    try {
      const child = await element.contentFrame();
      if (child) {
        if (depth === 8) throw new Error("website_frame_unavailable");
        frames.push(await resilientLocator(element, frame));
        const box = await element.boundingBox();
        if (!box) throw new Error("website_frame_unavailable");
        const border = await element.evaluate(elementScript<{x:number;y:number}>("el => ({x:el.clientLeft,y:el.clientTop})"));
        x = globalX - box.x - border.x; y = globalY - box.y - border.y;
        frame = child;
        continue;
      }
      // A click on a message's text maps to its assistant wrapper. Input/send
      // descendants similarly map to the actual actionable element.
      const chosenHandle = await element.evaluateHandle(elementScript<Element>(response
        ? `el => el.closest('[data-message-author-role="assistant"],[data-role="assistant"],[role="log"],.assistant-message,.assistant-response') || el`
        : `el => el.closest('button,input,textarea,[role="button"],[role="textbox"],[contenteditable="true"]') || el`));
      const chosen = chosenHandle.asElement() as ElementHandle<Element> | null;
      if (!chosen) throw new Error("selector_unavailable");
      try {
        const value = await resilientLocator(chosen, frame, response);
        await frame.evaluate(`(() => { for(const el of document.querySelectorAll('[data-caudals-selected]')) {el.style.outline=el.getAttribute('data-caudals-selected');el.removeAttribute('data-caudals-selected');} })()`);
        await chosen.evaluate(elementScript<void>(`el => {el.setAttribute('data-caudals-selected',el.style.outline);el.style.outline='3px solid #1d9a6c';}`));
        return browserLocatorSchema.parse({ ...value, frames });
      } finally { await chosenHandle.dispose(); }
    } finally { await handle.dispose(); }
  }
  throw new Error("website_frame_unavailable");
}
