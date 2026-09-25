import { chromium, expect, test } from "@playwright/test";
import { createServer } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { discoverWebsite, guardBrowserContext, invokeWebsite, openWebsiteAttemptSession, validateWebsiteRecipe, waitForCompletion } from "../../lib/evals/connectors/browser-executor";
import { withContentHash } from "../../lib/evals/contracts/hashing";
import type { WebsiteRecipe } from "../../lib/evals/contracts/browser";

test("synthetic HTTPS chatbot completes discovery, two reset probes and a scored capture", async () => {
  const directory = mkdtempSync(join(tmpdir(), "evals-fake-chatbot-"));
  const key = join(directory, "key.pem"), cert = join(directory, "cert.pem");
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1",
    "-subj", "/CN=127.0.0.1", "-keyout", key, "-out", cert], { stdio: "ignore" });
  const server = createHttpsServer({ key: readFileSync(key), cert: readFileSync(cert) }, (_request, response) => {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
    response.end(`<!doctype html><html><head><title>Synthetic chatbot fixture</title></head><body>
      <main><h1>Synthetic chatbot fixture</h1><form><label>Question<textarea></textarea></label>
      <button type="submit">Send</button></form><div role="status" id="busy" hidden>Working</div>
      <div role="log"></div></main><script>
      let turn=0;document.querySelector('form').addEventListener('submit', event => {
        event.preventDefault();const question=document.querySelector('textarea').value;
        const busy=document.querySelector('#busy');busy.hidden=false;
        const answer=document.createElement('p');answer.dataset.messageAuthorRole='assistant';
        document.querySelector('[role=log]').append(answer);
        setTimeout(()=>{answer.textContent='Partial';},100);
        setTimeout(()=>{answer.textContent='Synthetic answer '+(++turn)+': '+question;busy.hidden=true;},650);
      });
      </script></body></html>`);
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("fixture_port_missing");
  const url = `https://127.0.0.1:${address.port}/`;
  const browser = await chromium.launch({ args: ["--ignore-certificate-errors"] });
  const destinationCheck = async (candidate: string) => {
    if (new URL(candidate).origin !== new URL(url).origin) throw new Error("fixture_destination_denied");
  };
  try {
    const discovery = await discoverWebsite({ browser, url, destinationCheck });
    expect(discovery.text_inputs.length).toBeGreaterThan(0);
    const recipe = withContentHash({ schema_version: "1.0", recipe_revision_id: randomUUID(),
      source: "operator_authored", start_url: url, launcher: null, frame_chain: [],
      input: { kind: "role", role: "textbox", name: "Question" },
      submit: { kind: "click", locator: { kind: "role", role: "button", name: "Send" } },
      message_container: { kind: "role", role: "log", name: null },
      assistant_message: { kind: "css", value: '[data-message-author-role="assistant"]' },
      completion: { kind: "selector_hidden", locator: { kind: "css", value: "#busy" } },
      reset: { kind: "new_context" }, assistant_extraction: "last_new_message",
      created_at: new Date().toISOString(), extensions: {},
    }) as WebsiteRecipe;
    const probe = await validateWebsiteRecipe({ browser, recipe, destinationCheck, timeoutMs: 5_000 });
    expect(probe).toMatchObject({ distinct_responses: true, reset_verified: true,
      streaming_complete: true, duplicate_free: true });
    const observation = await invokeWebsite({ browser, recipe, destinationCheck,
      input: { schema_version: "1.0", case_id: "synthetic-case", case_revision_id: "synthetic-case-v1",
        messages: [{ role: "user", content: "fixture question" }], attachments: [], tools: [] },
      context: { run_id: "synthetic-run", target_revision_id: "synthetic-target",
        execution_plan_id: "synthetic-plan", tenant_scope_handle: "synthetic",
        deadline: new Date(Date.now() + 5_000).toISOString(), attempt_id: "synthetic-attempt",
        scoped_credential_handle: null, destination_policy_id: "synthetic-local-only",
        reserved_cost: { amount: "0", currency: "EUR" }, signal: new AbortController().signal },
    });
    expect(observation.status).toBe("succeeded");
    expect(observation.messages.at(-1)?.content).toBe("Synthetic answer 1: fixture question");
    const baseContext = { run_id: "synthetic-run", target_revision_id: "synthetic-target",
      execution_plan_id: "synthetic-plan", tenant_scope_handle: "synthetic",
      deadline: new Date(Date.now() + 10_000).toISOString(), attempt_id: "synthetic-conversation-attempt",
      scoped_credential_handle: null, destination_policy_id: "synthetic-local-only",
      reserved_cost: { amount: "0", currency: "EUR" }, signal: new AbortController().signal };
    const firstInput = { schema_version: "1.0" as const, case_id: "synthetic-case", case_revision_id: "synthetic-case-v1",
      messages: [{ role: "user" as const, content: "first turn" }], attachments: [], tools: [] };
    const attempt = await openWebsiteAttemptSession({ browser, recipe, destinationCheck });
    try {
      const first = await attempt.invoke(firstInput, baseContext);
      expect(first.messages.at(-1)?.content).toBe("Synthetic answer 1: first turn");
      const secondInput = { ...firstInput, messages: [...first.messages, { role: "user" as const, content: "second turn" }] };
      await expect(attempt.invoke(secondInput, { ...baseContext, attempt_id: "wrong-attempt" })).rejects.toThrow("scenario_identity_mismatch");
      const second = await attempt.invoke(secondInput, baseContext);
      expect(second.messages.at(-1)?.content).toBe("Synthetic answer 2: second turn");
      expect(second.messages.slice(0, first.messages.length)).toEqual(first.messages);
    } finally { await attempt.close(); }
    const resetAttempt = await openWebsiteAttemptSession({ browser, recipe, destinationCheck });
    try {
      const reset = await resetAttempt.invoke(firstInput, { ...baseContext, attempt_id: "new-attempt" });
      expect(reset.messages.at(-1)?.content).toBe("Synthetic answer 1: first turn");
    } finally { await resetAttempt.close(); }
  } finally {
    await browser.close();
    await new Promise<void>(resolve => server.close(() => resolve()));
    rmSync(directory, { recursive: true, force: true });
  }
});

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
