import type { ElementHandle, Page } from "playwright";
import { browserLocatorSchema, type BrowserLocator } from "../../lib/evals/contracts/browser";
import { pageScript, resilientLocator } from "../../lib/evals/connectors/browser-locators";

export { resilientLocator };

/**
 * Manual repair of one part: the element under a click, followed through
 * nested frames and open shadow roots, mapped to its actionable or message
 * wrapper. Selection is highlighted by the live view, not in the page.
 */
export async function selectAt(page: Page, x: number, y: number, response = false) {
  let frame = page.mainFrame();
  const frames: BrowserLocator[] = [];
  const globalX = x, globalY = y;
  for (let depth = 0; depth <= 8; depth++) {
    const handle = await frame.evaluateHandle(pageScript<[number, number], Element | null>(`([x,y]) => {
      let el=document.elementFromPoint(x,y);
      while (el?.shadowRoot) { const inner=el.shadowRoot.elementFromPoint(x,y); if(!inner || inner===el) break;el=inner; }
      return el;
    }`), [x, y] as [number, number]);
    const element = handle.asElement() as ElementHandle<Element> | null;
    if (!element) { await handle.dispose(); throw new Error("selector_unavailable"); }
    try {
      const child = await element.contentFrame();
      if (child) {
        if (depth === 8) throw new Error("website_frame_unavailable");
        frames.push(await resilientLocator(element, frame));
        const box = await element.boundingBox();
        if (!box) throw new Error("website_frame_unavailable");
        const border = await element.evaluate(pageScript<Element, { x: number; y: number }>("el => ({x:el.clientLeft,y:el.clientTop})"));
        x = globalX - box.x - border.x; y = globalY - box.y - border.y;
        frame = child;
        continue;
      }
      // A click on a message's text maps to its assistant wrapper. Input/send
      // descendants similarly map to the actual actionable element.
      const chosenHandle = await element.evaluateHandle(pageScript<Element, Element>(response
        ? `el => el.closest('[data-message-author-role="assistant"],[data-role="assistant"],[class*="assistant" i],[class*="markdown" i],[class*="message" i],[role="log"] > *') || el`
        : `el => el.closest('button,input,textarea,[role="button"],[role="textbox"],[contenteditable="true"],[contenteditable="plaintext-only"],a') || el`));
      const chosen = chosenHandle.asElement() as ElementHandle<Element> | null;
      if (!chosen) throw new Error("selector_unavailable");
      try {
        const value = await resilientLocator(chosen, frame, response);
        return browserLocatorSchema.parse({ ...value, frames });
      } finally { await chosenHandle.dispose(); }
    } finally { await handle.dispose(); }
  }
  throw new Error("website_frame_unavailable");
}
