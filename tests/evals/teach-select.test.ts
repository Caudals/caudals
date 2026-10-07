import { chromium, type Browser, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { selectAt } from "../../services/evals-browser/teach";

// Manual repair ("Fix") of the reply part: a click on a message's text must
// map to that one message, never to the history that holds every message.
describe("selectAt for the reply part", () => {
  let browser: Browser;
  let page: Page;
  beforeAll(async () => {
    browser = await chromium.launch();
    page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  });
  afterAll(async () => { await browser?.close(); });

  async function clickTarget(html: string) {
    await page.setContent(`<!doctype html><body style="margin:0;font:16px sans-serif">${html}</body>`);
    const box = await page.locator("#target").boundingBox();
    if (!box) throw new Error("target not rendered");
    const selection = await selectAt(page, box.x + box.width / 2, box.y + box.height / 2, true);
    if (selection.kind !== "css") throw new Error(`expected a css locator, got ${selection.kind}`);
    return { selection, matches: await page.locator(selection.value).count() };
  }

  it("picks the bubble when the history is the only element named after messages (Visor.ai)", async () => {
    const { selection, matches } = await clickTarget(`
      <div id="messageBox__messages" class="direct-chat-messages">
        <div class="direct-chat-msg doted-border"><div class="direct-chat-text">¡Hola! Bienvenido al asistente virtual.</div></div>
        <div class="direct-chat-msg right"><div class="direct-chat-text">hola, ¿qué preguntas puedes responderme?</div></div>
        <div class="direct-chat-msg doted-border"><div class="direct-chat-text"><p id="target">Puedo responder a preguntas sobre presupuestos y pólizas.</p></div></div>
      </div>`);
    expect(selection.value).not.toMatch(/messages/i);
    expect(matches).toBe(3);
  });

  it("still picks an assistant message by its role", async () => {
    const { selection, matches } = await clickTarget(`
      <div class="chat-messages" role="log">
        <div data-message-author-role="user"><p>¿Cuánto cuesta?</p></div>
        <div data-message-author-role="assistant"><p id="target">Cuesta 10 euros al mes.</p></div>
        <div data-message-author-role="assistant"><p>¿Algo más?</p></div>
      </div>`);
    expect(selection.value).not.toMatch(/messages/i);
    expect(matches).toBe(2);
  });
});
