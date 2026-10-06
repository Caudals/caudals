import { chromium, expect, test, type Browser } from "@playwright/test";
import { createServer, type Server } from "node:https";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { BrowserControl } from "../../services/evals-browser/control";
import type { RemoteState } from "../../lib/evals/contracts/remote-browser";
import { websiteRecipeSchema, type WebsiteRecipe } from "../../lib/evals/contracts/browser";
import { withContentHash } from "../../lib/evals/contracts/hashing";
import { autoDetectWebsiteRecipe } from "../../lib/evals/connectors/browser-autodetect";
import { dismissConsent, invokeWebsite, openWebsiteAttemptSession, validateWebsiteRecipe } from "../../lib/evals/connectors/browser-executor";

// An authenticated SPA restores its server-side conversation in every new
// browser. Sending a prompt also adds a longer, clickable title in the sidebar.
// This reproduces the reported failure without relying on a third-party app.
const html = `<!doctype html><title>Persistent copilot</title>
<style>
body{display:flex;gap:24px}aside{width:250px}main{width:700px}
.conversation-title{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.assistant-message,.user-message{padding:12px;margin:8px}
</style>
<aside><h2>Conversations</h2><div class="conversation-list"></div>
<button id="new-chat">Nueva conversación</button></aside>
<main><div class="thread"></div><form>
<textarea placeholder="Ask the assistant"></textarea><button type="submit">Send</button>
</form></main><script>
const thread=document.querySelector('.thread'),list=document.querySelector('.conversation-list'),input=document.querySelector('textarea');
const api=location.pathname+'/state';
const render=rows=>{thread.replaceChildren();for(const row of rows){
  const u=document.createElement('p');u.className='user-message';u.textContent=row.prompt;thread.append(u);
  const a=document.createElement('p');a.className='assistant-message';a.textContent=row.reply;thread.append(a);
}};
fetch(api).then(r=>r.json()).then(render);
document.getElementById('new-chat').onclick=async()=>{
  await fetch(api,{method:'DELETE'});thread.replaceChildren();input.value='';
};
document.querySelector('form').onsubmit=async e=>{
  e.preventDefault();const prompt=input.value.trim();if(!prompt)return;input.value='';
  const u=document.createElement('p');u.className='user-message';u.textContent=prompt;thread.append(u);
  const title=document.createElement('button');title.className='conversation-title';
  title.title='Conversation about '+prompt;title.textContent='Conversation about '+prompt;
  list.append(title);
  const row=await fetch(api,{method:'POST',body:prompt}).then(r=>r.json());
  const a=document.createElement('p');a.className='assistant-message';a.textContent=row.reply;thread.append(a);
};
</script>`;

let server: Server, browser: Browser, origin: string, directory: string;
const histories = new Map<string, Array<{ prompt: string; reply: string }>>();
test.beforeAll(async () => {
  directory = mkdtempSync(join(tmpdir(), "web-connector-recovery-"));
  const key = join(directory, "key.pem"), cert = join(directory, "cert.pem");
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-subj", "/CN=127.0.0.1", "-keyout", key, "-out", cert], { stdio: "ignore" });
  server = createServer({ key: readFileSync(key), cert: readFileSync(cert) }, (request, response) => {
    const path = new URL(request.url ?? "/", "https://fixture").pathname;
    if (path.endsWith("/state")) {
      response.setHeader("content-type", "application/json");
      const rows = histories.get(path) ?? [];
      if (request.method === "DELETE") {
        setTimeout(() => { histories.set(path, []); response.end("[]"); }, path === "/slow/state" ? 1_600 : 0);
        return;
      }
      if (request.method === "POST") {
        let prompt = "";
        request.on("data", data => { prompt += String(data); });
        request.on("end", () => {
          const row = { prompt, reply: "The connection works. Turn " + (rows.length + 1) };
          histories.set(path, [...rows, row]); response.end(JSON.stringify(row));
        });
        return;
      }
      response.end(JSON.stringify(rows)); return;
    }
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.setHeader("set-cookie", "auth=fixture; Secure; HttpOnly; SameSite=Lax; Path=/");
    if (path === "/widget") {
      response.end(html.replace("<aside>", `<button aria-label="Open chat" style="position:fixed;right:20px;bottom:20px;width:60px;height:60px" onclick="document.querySelector('#chat-panel').hidden=false">💬</button><section id="chat-panel" hidden><aside>`).replace("</script>", "</script></section>"));
      return;
    }
    if (path === "/no-reset") { response.end(html.replace("await fetch(api,{method:'DELETE'});", "return;")); return; }
    response.end(path === "/notice" ? html.replace("<style>", `<div id="notice-overlay" hidden style="position:fixed;inset:0;z-index:9999;background:white">
      <h2>Join our next webinar</h2><button onclick="document.body.dataset.reserved='yes'">Reserve a place</button>
      <button onclick="this.parentElement.remove()">×</button></div>
      <script>addEventListener('DOMContentLoaded',()=>document.querySelector('textarea').addEventListener('input',()=>{const notice=document.getElementById('notice-overlay');if(notice)notice.hidden=false;}));</script><style>`) : html);
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("fixture_port_missing");
  origin = "https://127.0.0.1:" + address.port;
  browser = await chromium.launch({ args: ["--ignore-certificate-errors"] });
});
test.afterAll(async () => {
  await browser.close();
  await new Promise<void>(resolve => server.close(() => resolve()));
  rmSync(directory, { recursive: true, force: true });
});
const destinationCheck = async (url: string) => { if (new URL(url).origin !== origin) throw new Error("destination_denied"); };
const question = (content: string) => ({ schema_version: "1.0" as const, case_id: "case", case_revision_id: "case-v1", messages: [{ role: "user" as const, content }], attachments: [], tools: [] });
const invocation = () => ({ run_id: "run", target_revision_id: "revision", execution_plan_id: "plan", tenant_scope_handle: "fixture", deadline: new Date(Date.now() + 20_000).toISOString(), attempt_id: randomUUID(), scoped_credential_handle: null, destination_policy_id: "fixture", reserved_cost: { amount: "0", currency: "EUR" }, signal: new AbortController().signal });
const legacyRecipe = (path: string): WebsiteRecipe => websiteRecipeSchema.parse(withContentHash({
  schema_version: "1.0", recipe_revision_id: randomUUID(), source: "operator_authored",
  start_url: origin + path, launcher: null, frame_chain: [],
  input: { kind: "role", role: "textbox", name: "Ask the assistant" },
  submit: { kind: "click", locator: { kind: "role", role: "button", name: "Send" } },
  message_container: { kind: "css", value: ".assistant-message" },
  assistant_message: { kind: "css", value: ".assistant-message" },
  completion: { kind: "quiescent", quiet_ms: 1_500 }, reset: { kind: "new_context" },
  assistant_extraction: "last_new_message", created_at: new Date().toISOString(), extensions: {},
}));

test("detects the assistant instead of a longer sidebar title and resets a server-restored conversation", async () => {
  test.setTimeout(90_000);
  histories.set("/auto/state", [{ prompt: "old question", reply: "old answer" }]);
  const draft = await autoDetectWebsiteRecipe({ browser, url: origin + "/auto", destinationCheck, recipeRevisionId: randomUUID() });
  expect(draft.assistant_message).toMatchObject({ kind: "css", value: "p.assistant-message" });
  expect(draft.reset).toMatchObject({ kind: "click", locator: { kind: "role", role: "button", name: "Nueva conversación" } });
  const recipe = websiteRecipeSchema.parse(withContentHash(draft));
  const proof = await validateWebsiteRecipe({ browser, recipe, destinationCheck });
  expect(proof).toMatchObject({ reset_verified: true, streaming_complete: true, duplicate_free: true, multi_turn_verified: true });
  const first = await invokeWebsite({ browser, recipe, destinationCheck, input: question("First evaluation"), context: invocation() });
  const second = await invokeWebsite({ browser, recipe, destinationCheck, input: question("Second evaluation"), context: invocation() });
  expect(first.messages.at(-1)?.content).toBe("The connection works. Turn 1");
  expect(second.messages.at(-1)?.content).toBe("The connection works. Turn 1");
  // A fresh conversation resets once, while follow-up turns keep their context.
  const attempt = await openWebsiteAttemptSession({ browser, recipe, destinationCheck });
  try {
    const ctx = invocation();
    const a = await attempt.invoke(question("one"), ctx);
    const b = await attempt.invoke({ ...question("two"), messages: [...a.messages, { role: "user", content: "two" }] }, ctx);
    expect(b.messages.at(-1)?.content).toBe("The connection works. Turn 2");
  } finally { await attempt.close(); }
});

test("a manually selected new-conversation button is honored even when the input is visible", async () => {
  test.setTimeout(90_000);
  const path = "/manual";
  histories.set(path + "/state", [{ prompt: "old question", reply: "old answer" }]);
  const control = new BrowserControl({ browser, destinationCheck });
  const scope = { orgId: randomUUID(), actorId: "owner", targetId: randomUUID(), endpoint: origin + path };
  try {
    const { sessionId } = await control.dispatch(scope, { action: "open" }, { recipe: legacyRecipe(path) }) as { sessionId: string };
    const page = browser.contexts().at(-1)!.pages()[0];
    const button = page.getByRole("button", { name: "Nueva conversación" });
    await button.waitFor();
    const box = (await button.boundingBox())!;
    await control.dispatch(scope, { action: "mode", sessionId, mode: "teach", part: "launcher" });
    await control.dispatch(scope, { action: "click", sessionId, x: box.x + box.width / 2, y: box.y + box.height / 2, button: "left" });
    await control.dispatch(scope, { action: "autoteach", sessionId });
    await expect.poll(async () => (await control.dispatch(scope, { action: "snapshot", sessionId }) as RemoteState).test.status, { timeout: 70_000, intervals: [500] }).toMatch(/ready|failed/);
    const state = await control.dispatch(scope, { action: "snapshot", sessionId }) as RemoteState;
    expect(state.test.error).toBeNull();
    const result = await control.dispatch(scope, { action: "result", sessionId }) as { recipe: WebsiteRecipe };
    expect(result.recipe.reset.kind).toBe("click");
    const answer = await invokeWebsite({ browser, recipe: result.recipe, destinationCheck, input: question("After repair"), context: invocation() });
    expect(answer.messages.at(-1)?.content).toBe("The connection works. Turn 1");
  } finally { await control.close(); }
});

test("keeps a closed widget's opener and its new-conversation action in the same recipe", async () => {
  test.setTimeout(90_000);
  histories.set("/widget/state", [{ prompt: "old question", reply: "old answer" }]);
  const control = new BrowserControl({ browser, destinationCheck });
  const scope = { orgId: randomUUID(), actorId: "owner", targetId: randomUUID(), endpoint: origin + "/widget" };
  try {
    const { sessionId } = await control.dispatch(scope, { action: "open" }) as { sessionId: string };
    await browser.contexts().at(-1)!.pages()[0].getByRole("button", { name: "Open chat" }).waitFor();
    await control.dispatch(scope, { action: "autoteach", sessionId });
    await expect.poll(async () => (await control.dispatch(scope, { action: "snapshot", sessionId }) as RemoteState).test.status, { timeout: 70_000, intervals: [500] }).toMatch(/ready|failed/);
    const state = await control.dispatch(scope, { action: "snapshot", sessionId }) as RemoteState;
    expect(state.test.error).toBeNull();
    const result = await control.dispatch(scope, { action: "result", sessionId }) as { recipe: WebsiteRecipe };
    expect(result.recipe.launcher).toMatchObject({ kind: "role", name: "Open chat" });
    expect(result.recipe.reset).toMatchObject({ kind: "click", locator: { kind: "role", name: "Nueva conversación" } });
    const answer = await invokeWebsite({ browser, recipe: result.recipe, destinationCheck, input: question("Another fresh chat"), context: invocation() });
    expect(answer.messages.at(-1)?.content).toBe("The connection works. Turn 1");
  } finally { await control.close(); }
});

test("refuses a new-conversation action that leaves the previous conversation visible", async () => {
  histories.set("/no-reset/state", [{ prompt: "old question", reply: "old answer" }]);
  const recipe = websiteRecipeSchema.parse(withContentHash({ ...legacyRecipe("/no-reset"), reset: { kind: "click", locator: { kind: "role", role: "button", name: "Nueva conversación" } } }));
  await expect(openWebsiteAttemptSession({ browser, recipe, destinationCheck })).rejects.toThrow("conversation_reset_unverified");
  expect(histories.get("/no-reset/state")?.map(row => row.prompt)).toEqual(["old question"]);
  expect(browser.contexts()).toHaveLength(0);
});

test("closes a late announcement through its close button and never accepts an authentication or agreement screen", async () => {
  test.setTimeout(60_000);
  const recipe = legacyRecipe("/notice");
  const answer = await invokeWebsite({ browser, recipe, destinationCheck, input: question("A complete reply"), context: invocation() });
  expect(answer.messages.at(-1)?.content).toBe("The connection works. Turn 1");
  const context = await browser.newContext(), page = await context.newPage();
  try {
    for (const content of [
      '<h2>Sign in</h2><input type="password">',
      '<h2>Accept terms of service</h2><input type="checkbox">',
      '<h2>Complete CAPTCHA</h2>',
    ]) {
      await page.setContent('<div role="dialog" class="notice-overlay">' + content + '<div class="modal-header"><button onclick="this.closest(\'[role=dialog]\').remove()">Close</button></div></div>');
      expect(await dismissConsent(page)).toBe(false);
      await expect(page.getByRole("dialog")).toBeVisible();
    }
  } finally { await context.close(); }
});

test("waits for an asynchronous new-conversation action before sending an evaluation question", async () => {
  histories.set("/slow/state", [{ prompt: "old question", reply: "old answer" }]);
  const recipe = websiteRecipeSchema.parse(withContentHash({ ...legacyRecipe("/slow"), reset: { kind: "click", locator: { kind: "role", role: "button", name: "Nueva conversación" } } }));
  const answer = await invokeWebsite({ browser, recipe, destinationCheck, input: question("Fresh question"), context: invocation() });
  expect(answer.messages.at(-1)?.content).toBe("The connection works. Turn 1");
  expect(histories.get("/slow/state")?.map(row => row.prompt)).toEqual(["Fresh question"]);
});

test("stopping a connection check releases its fresh browser and allows an immediate retry", async () => {
  test.setTimeout(90_000);
  const control = new BrowserControl({ browser, destinationCheck });
  const scope = { orgId: randomUUID(), actorId: "owner", targetId: randomUUID(), endpoint: origin + "/cancel" };
  try {
    const recipe = legacyRecipe("/cancel");
    const { sessionId } = await control.dispatch(scope, { action: "open" }, { recipe }) as { sessionId: string };
    await browser.contexts().at(-1)!.pages()[0].getByRole("textbox").waitFor();
    await control.dispatch(scope, { action: "test", sessionId });
    await expect.poll(() => browser.contexts().length).toBe(2);
    await control.dispatch(scope, { action: "cancel", sessionId });
    expect((await control.dispatch(scope, { action: "snapshot", sessionId }) as RemoteState).test.status).toBe("failed");
    await control.dispatch(scope, { action: "test", sessionId });
    await expect.poll(async () => (await control.dispatch(scope, { action: "snapshot", sessionId }) as RemoteState).test.status, { timeout: 70_000, intervals: [500] }).toBe("ready");
    expect(browser.contexts()).toHaveLength(1);
  } finally { await control.close(); }
});
