import { expect, test } from "@playwright/test";
import { createServer } from "node:http";
import { guardBrowserContext, waitForCompletion } from "../../lib/evals/connectors/browser-executor";
import type { WebsiteRecipe } from "../../lib/evals/contracts/browser";

test("website fixtures cover iframe, open shadow DOM, streaming and delayed completion", async ({ page }) => {
  await page.setContent('<iframe title="support"></iframe>');
  await page.locator("iframe").evaluate((frame: HTMLIFrameElement) => {
    frame.srcdoc = `<div id="host"></div><script>
      const root=document.querySelector('#host').attachShadow({mode:'open'});
      root.innerHTML='<label>Question<textarea></textarea></label><button>Send</button><div role="log"></div>';
      root.querySelector('button').onclick=()=>{
        const log=root.querySelector('[role=log]');const row=document.createElement('p');
        row.dataset.messageAuthorRole='assistant';log.append(row);let text='';let delay=0;
        for(const part of ['Policy ','answer ','complete']){delay+=150;setTimeout(()=>{text+=part;row.textContent=text},delay)}
      };
    <\/script>`;
  });
  const frame = page.frameLocator('iframe[title="support"]');
  await frame.getByLabel("Question").fill("Question");
  await frame.getByRole("button", { name: "Send" }).click();
  await expect(frame.locator('[data-message-author-role="assistant"]')).toHaveText("Policy answer complete", { timeout: 5_000 });
});

test("a quiet stream pause cannot complete before the widget finishes", async ({ page }) => {
  await page.setContent('<div role="log"><p class="assistant-message"></p></div><div class="busy">Working</div>');
  const recipe = {
    assistant_message: { kind: "css", value: ".assistant-message" },
    assistant_extraction: "last_new_message",
    completion: { kind: "selector_hidden", locator: { kind: "css", value: ".busy" } },
  } as WebsiteRecipe;
  await page.evaluate(() => {
    const response = document.querySelector(".assistant-message")!;
    const busy = document.querySelector(".busy") as HTMLElement;
    window.setTimeout(() => { response.textContent = "Partial"; }, 100);
    window.setTimeout(() => { response.textContent = "Complete answer"; busy.hidden = true; }, 900);
  });
  expect(await waitForCompletion(page, recipe, [], Date.now() + 2_000)).toBe("Complete answer");
  await page.setContent('<div role="log"><p class="assistant-message">Partial</p></div><div class="busy" hidden>Working</div>');
  await expect(waitForCompletion(page, recipe, [], Date.now() + 650)).rejects.toThrow("capture_incomplete");
});

test("duplicate extraction, fresh-context reset and selector drift fail safely", async ({ browser }) => {
  const first = await browser.newContext();
  const page = await first.newPage();
  await page.setContent('<div role="log"><p data-message-author-role="assistant">old</p><p data-message-author-role="assistant">new</p><p data-message-author-role="assistant">new</p></div>');
  const values = await page.locator('[data-message-author-role="assistant"]').allTextContents();
  expect(values.slice(1)).toEqual(["new", "new"]);
  expect(new Set(values.slice(1)).size).toBe(1);
  await first.addCookies([{ name: "case", value: "leak", domain: "example.test", path: "/" }]);
  expect(await first.cookies("https://example.test")).toHaveLength(1);
  await first.close();
  const second = await browser.newContext();
  const resetPage = await second.newPage();
  await resetPage.setContent('<textarea aria-label="New question"></textarea>');
  expect(await second.cookies("https://example.test")).toHaveLength(0);
  await expect(resetPage.locator('[data-testid="removed-input"]')).toHaveCount(0);
  await second.close();
});

test("browser request guard blocks private WebSocket handshakes", async ({ browser }) => {
  let upgrades = 0;
  const server = createServer();
  server.on("upgrade", (request, socket) => {
    upgrades += 1;
    socket.end("HTTP/1.1 403 Forbidden\r\n\r\n");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("fixture_port_missing");
  const context = await browser.newContext();
  try {
    await guardBrowserContext(context, async (url) => {
      if (url.startsWith("ws://") || url.startsWith("wss://")) throw new Error("destination_denied");
    });
    const page = await context.newPage();
    await page.setContent("<main>WebSocket boundary fixture</main>");
    await page.evaluate((port) => {
      const socket = new WebSocket(`ws://127.0.0.1:${port}/private`);
      socket.onerror = () => socket.close();
    }, address.port);
    await page.waitForTimeout(300);
    expect(upgrades).toBe(0);
  } finally {
    await context.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("browser request guard refuses plain-HTTP subresources even with a permissive checker", async ({ browser }) => {
  let requests = 0;
  const server = createServer((_request, response) => { requests += 1; response.writeHead(204).end(); });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("fixture_port_missing");
  const context = await browser.newContext();
  try {
    await guardBrowserContext(context, async () => {});
    const page = await context.newPage();
    await page.setContent(`<img alt="fixture" src="http://127.0.0.1:${address.port}/private">`);
    await page.waitForTimeout(200);
    expect(requests).toBe(0);
  } finally {
    await context.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
