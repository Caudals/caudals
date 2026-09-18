import { expect, test } from "@playwright/test";

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
